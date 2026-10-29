import { spawn } from 'node:child_process'
import { posix } from 'node:path'
import { buildRemoteCommand } from './remote-tools.js'
import { shellQuote } from './lib/remote.js'

export const name = 'remote-agent-terminal'
export const inject = ['terminals']

function normalizeConfig(config) {
  if (typeof config?.host !== 'string' || config.host === '') throw new Error('remote-agent-terminal requires config.host')
  if (typeof config?.remotePath !== 'string' || !config.remotePath.startsWith('/')) {
    throw new Error('remote-agent-terminal requires an absolute config.remotePath')
  }
  return {
    host: config.host,
    remotePath: config.remotePath,
    sshExecutable: config.sshExecutable ?? 'ssh',
    connectTimeoutSec: config.connectTimeoutSec ?? 15,
    maxLines: config.maxLines ?? 2000,
    type: typeof config.type === 'string' && config.type !== '' ? config.type : 'remote-ssh',
    sandbox: config.sandbox === 'bwrap' ? 'bwrap' : null,
  }
}

function createSessionState(width = 120, height = 30) {
  return { width, height }
}

export function createRemoteTerminalBackend(config) {
  const cfg = normalizeConfig(config)

  return {
    type: cfg.type,
    async spawn(spec) {
      const requested = typeof spec?.cwd === 'string' ? spec.cwd : ''
      const cwd = requested.startsWith('/') ? posix.normalize(requested) : cfg.remotePath
      createSessionState()
      const inner = `cd -- ${shellQuote(cwd)} && exec env DSH_REMOTE_SANDBOX=${cfg.sandbox === 'bwrap' ? 'bwrap' : 'none'} bash -i`
      const script = cfg.sandbox === 'bwrap'
        ? `bwrap --ro-bind / / --bind ${shellQuote(cfg.remotePath)} ${shellQuote(cfg.remotePath)} --dev /dev --proc /proc --tmpfs /tmp --setenv HOME ${shellQuote(cfg.remotePath)} --chdir ${shellQuote(cwd)} --die-with-parent --unshare-pid --unshare-uts --unshare-ipc sh -lc ${shellQuote(inner)}`
        : inner
      const args = [
        '-tt',
        '-o', 'BatchMode=yes',
        '-o', `ConnectTimeout=${cfg.connectTimeoutSec}`,
        '-o', 'ServerAliveInterval=15',
        cfg.host,
        buildRemoteCommand(script),
      ]
      const child = spawn(cfg.sshExecutable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      const lines = []
      let partial = ''
      let status = { kind: 'running' }
      let closed = false
      let closePromise = null
      let outputSeq = 0
      const sendWaiters = new Set()

      const notify = () => {
        outputSeq += 1
        for (const waiter of [...sendWaiters]) waiter()
      }
      const append = (text) => {
        partial += text
        const parts = partial.split('\n')
        partial = parts.pop() ?? ''
        for (const line of parts) {
          lines.push(line)
          if (lines.length > cfg.maxLines) lines.splice(0, lines.length - cfg.maxLines)
        }
        notify()
      }
      child.stdout.on('data', (chunk) => append(chunk.toString('utf8')))
      child.stderr.on('data', (chunk) => append(chunk.toString('utf8')))
      child.once('error', () => {
        status = { kind: 'exited', exitCode: null, signal: null }
        closed = true
        notify()
      })
      child.once('close', (code, signal) => {
        status = { kind: 'exited', exitCode: code, signal }
        closed = true
        notify()
      })
      child.stdin.on('error', () => {})
      await new Promise((resolve) => {
        if (child.pid) resolve()
        else child.once('spawn', resolve)
        child.once('error', resolve)
      })
      if (closed) throw new Error('The remote terminal process could not be started')

      const read = (request = {}) => {
        const total = lines.length
        const offset = Number.isSafeInteger(request.offset) && request.offset >= 0 ? request.offset : 0
        const count = Number.isSafeInteger(request.count) && request.count > 0 ? request.count : 100
        const end = Math.max(0, total - offset)
        const begin = Math.max(0, end - count)
        return {
          text: lines.slice(begin, end).join('\n'),
          totalLines: total,
          lineBegin: begin,
          lineEnd: end,
          truncated: begin > 0,
        }
      }

      const startSend = (request) => {
        let settled = false
        let canceled = false
        let timer = null
        let waitReason = 'inferred_idle'
        const startSeq = outputSeq
        const startLines = lines.length
        let resolveDone
        const done = new Promise((resolve) => { resolveDone = resolve })
        const finish = (reason) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          waitReason = reason
          sendWaiters.delete(onOutput)
          request.signal?.removeEventListener?.('abort', onAbort)
          resolveDone({
            viewport: lines.slice(Math.max(0, lines.length - 80)).join('\n'),
            waitReason,
            sessionStatus: status,
            truncated: lines.length - startLines > 80,
          })
        }
        const onOutput = () => {
          clearTimeout(timer)
          timer = setTimeout(() => finish('inferred_idle'), 500)
        }
        const onAbort = () => {
          canceled = true
          finish('timeout')
        }
        sendWaiters.add(onOutput)
        request.signal?.addEventListener?.('abort', onAbort, { once: true })
        const timeout = setTimeout(() => finish('timeout'), 30_000)
        timer = setTimeout(() => finish('inferred_idle'), 6000)
        const clearAll = () => clearTimeout(timeout)
        done.finally(clearAll).catch(() => {})
        if (!closed) {
          child.stdin.write(request.text ?? '')
          if (request.submit) child.stdin.write('\n')
        } else {
          finish('session_exit')
        }
        return {
          done,
          readOutput() {
            const delta = lines.slice(startLines).join('\n')
            return { delta, truncated: false }
          },
          cancel() {
            if (settled) return false
            canceled = true
            finish('timeout')
            return true
          },
        }
      }

      return {
        motd: `Remote SSH terminal · ${cfg.host}:${cwd}`,
        pid: child.pid,
        startSend,
        read,
        async signal(signal) {
          if (signal === 'SIGINT') {
            if (!closed) child.stdin.write('\u0003')
            return { delivered: true, targetPgid: child.pid ?? 0 }
          }
          if (!closed) child.kill(signal === 'SIGKILL' ? 'SIGKILL' : signal === 'SIGHUP' ? 'SIGHUP' : 'SIGTERM')
          return { delivered: true, targetPgid: child.pid ?? 0 }
        },
        status() {
          return status
        },
        async close(reason) {
          if (closePromise) return closePromise
          closePromise = (async () => {
            if (closed) return
            try {
              child.stdin.end()
            } catch {
              // already closed
            }
            child.kill('SIGTERM')
            await new Promise((resolve) => {
              if (closed) return resolve()
              const timer = setTimeout(resolve, 3000)
              child.once('close', () => {
                clearTimeout(timer)
                resolve()
              })
            })
          })()
          return closePromise
        },
      }
    },
  }
}

export function apply(ctx, config) {
  const backend = createRemoteTerminalBackend(config)
  ctx.terminals.registerBackend(backend)
}
