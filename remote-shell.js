import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join, posix } from 'node:path'
import { appendFile, mkdir } from 'node:fs/promises'
import { buildRemoteCommand } from './remote-tools.js'
import { shellQuote } from './lib/remote.js'

export const name = 'remote-agent-shell'
export const inject = []

function sandboxLogFile(ctx) {
  try {
    const dir = ctx.dshHomePath?.('remote-ssh')
    if (typeof dir === 'string' && dir !== '') return join(dir, 'sandbox-log.jsonl')
  } catch {
    // fall through
  }
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'remote-ssh', 'sandbox-log.jsonl')
}

function makeSandboxLogger(ctx) {
  const file = sandboxLogFile(ctx)
  return (entry) => {
    void mkdir(join(file, '..'), { recursive: true })
      .then(() => appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8'))
      .catch(() => {})
  }
}

function normalizeConfig(config) {
  if (typeof config?.host !== 'string' || config.host === '') throw new Error('remote-agent-shell requires config.host')
  if (typeof config?.remotePath !== 'string' || !config.remotePath.startsWith('/')) {
    throw new Error('remote-agent-shell requires an absolute config.remotePath')
  }
  return {
    host: config.host,
    remotePath: config.remotePath,
    sshExecutable: config.sshExecutable ?? 'ssh',
    connectTimeoutSec: config.connectTimeoutSec ?? 15,
    defaultTimeoutMs: config.defaultTimeoutMs ?? 120_000,
    maxTimeoutMs: config.maxTimeoutMs ?? 600_000,
    defaultMaxBytes: config.defaultMaxBytes ?? 1_000_000,
    sandbox: config.sandbox === 'bwrap' ? 'bwrap' : null,
    log: typeof config.log === 'function' ? config.log : null,
  }
}

function output(text, truncated) {
  return { text, truncated }
}

function validEnvName(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
}

function envAssignments(env) {
  if (!env) return []
  return Object.entries(env)
    .filter(([key]) => validEnvName(key))
    .map(([key, value]) => `${key}=${shellQuote(String(value))}`)
}

export function createRemoteShell(config) {
  const cfg = normalizeConfig(config)

  function resolve(request) {
    const timeoutMs = Math.min(
      Number.isSafeInteger(request?.timeoutMs) && request.timeoutMs > 0 ? request.timeoutMs : cfg.defaultTimeoutMs,
      cfg.maxTimeoutMs,
    )
    const stdoutMaxBytes = Math.min(
      Number.isSafeInteger(request?.stdoutMaxBytes) && request.stdoutMaxBytes > 0 ? request.stdoutMaxBytes : cfg.defaultMaxBytes,
      8 * 1024 * 1024,
    )
    const requestedWorkdir = typeof request?.workdir === 'string' ? request.workdir : ''
    const workdir = requestedWorkdir.startsWith('/') ? posix.normalize(requestedWorkdir) : cfg.remotePath
    return {
      command: String(request?.command ?? ''),
      workdir,
      timeoutMs,
      onExpiry: request?.onExpiry === 'none' ? 'none' : 'kill',
      stdoutMaxBytes,
      ...(request?.signal ? { signal: request.signal } : {}),
      ...(typeof request?.stdin === 'string' ? { stdin: request.stdin } : {}),
      ...(request?.env ? { env: request.env } : {}),
      ...(request?.dshEnv ? { dshEnv: request.dshEnv } : {}),
      sandboxPolicy: request?.sandboxPolicy,
    }
  }

  async function execute(spec) {
    if (spec.signal?.aborted) {
      const error = new Error('remote shell aborted before start')
      error.name = 'AbortError'
      throw error
    }
    const env = envAssignments({
      ...spec.env,
      ...spec.dshEnv,
      DSH_REMOTE_SANDBOX: cfg.sandbox === 'bwrap' ? 'bwrap' : 'none',
      ...(cfg.sandbox === 'bwrap' ? { DSH_REMOTE_SANDBOX_ROOT: cfg.remotePath } : {}),
    })
    cfg.log?.({
      at: new Date().toISOString(),
      host: cfg.host,
      remotePath: cfg.remotePath,
      workdir: spec.workdir,
      sandbox: cfg.sandbox ?? 'none',
      command: String(spec.command ?? '').slice(0, 500),
    })
    const prefix = env.length > 0 ? `env ${env.join(' ')} ` : ''
    const shellCommand = `${prefix}sh -lc ${shellQuote(spec.command)}`
    const command = cfg.sandbox === 'bwrap'
      ? `cd -- ${shellQuote(spec.workdir)} && bwrap --ro-bind / / --bind ${shellQuote(cfg.remotePath)} ${shellQuote(cfg.remotePath)} --dev /dev --proc /proc --tmpfs /tmp --setenv HOME ${shellQuote(cfg.remotePath)} --chdir ${shellQuote(spec.workdir)} --die-with-parent --unshare-pid --unshare-uts --unshare-ipc ${shellCommand}`
      : `cd -- ${shellQuote(spec.workdir)} && ${shellCommand}`
    const args = [
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${cfg.connectTimeoutSec}`,
      '-o', 'ServerAliveInterval=15',
      cfg.host,
      buildRemoteCommand(command),
    ]
    const child = spawn(cfg.sshExecutable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })

    const stdoutChunks = []
    const stderrChunks = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let stdoutTruncated = false
    let stderrTruncated = false
    let stdoutOffset = 0
    let stderrOffset = 0
    let timedOut = false
    let aborted = false
    let status = 'running'
    let exitCode = null
    let exitSignal = null
    let spawnError = null
    let settled = false
    let timer = null

    let resolveDone
    const done = new Promise((resolve) => { resolveDone = resolve })
    let resolveResult
    let rejectResult
    const resultPromise = new Promise((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    resultPromise.catch(() => {})

    const stdoutText = () => Buffer.concat(stdoutChunks).toString('utf8')
    const stderrText = () => Buffer.concat(stderrChunks).toString('utf8')

    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      spec.signal?.removeEventListener?.('abort', onAbort)
      if (error) spawnError = error
      status = error ? 'killed' : status
      resolveDone()
      if (error) {
        rejectResult(error)
      } else {
        resolveResult({
          exitCode,
          signal: exitSignal,
          timedOut,
          aborted,
          timeoutMs: spec.timeoutMs,
          stdout: output(stdoutText(), stdoutTruncated),
          stderr: output(stderrText(), stderrTruncated),
        })
      }
    }

    const onAbort = () => {
      if (settled) return
      aborted = true
      status = 'killed'
      child.kill()
    }

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes <= spec.stdoutMaxBytes) stdoutChunks.push(chunk)
      else stdoutTruncated = true
    })
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length
      if (stderrBytes <= spec.stdoutMaxBytes) stderrChunks.push(chunk)
      else stderrTruncated = true
    })
    child.once('error', (error) => {
      status = 'killed'
      finish(error?.code === 'ENOENT'
        ? Object.assign(new Error('The local ssh client was not found'), { code: 'ssh-missing' })
        : error)
    })
    child.once('close', (code, signal) => {
      if (status !== 'killed') status = 'completed'
      exitCode = code
      exitSignal = signal
      finish()
    })
    child.stdin.on('error', () => {})
    if (spec.stdin === undefined) child.stdin.end()
    else child.stdin.end(spec.stdin)
    spec.signal?.addEventListener?.('abort', onAbort, { once: true })
    if (spec.onExpiry === 'kill') {
      timer = setTimeout(() => {
        if (settled) return
        timedOut = true
        status = 'killed'
        child.kill()
      }, spec.timeoutMs)
      timer.unref?.()
    }

    const makeReader = (chunks, getOffset, setOffset, truncated) => ({
      readFrom(fromByte) {
        const offset = Number.isSafeInteger(fromByte) && fromByte >= 0 ? fromByte : 0
        const text = Buffer.concat(chunks).toString('utf8')
        return {
          text: text.slice(offset),
          nextOffset: text.length,
          lossy: truncated(),
        }
      },
    })

    return {
      get status() { return status },
      get exitCode() { return exitCode },
      get signal() { return exitSignal },
      get done() { return done },
      get sandbox() { return undefined },
      readOutput() {
        const outText = stdoutText()
        const errText = stderrText()
        const delta = outText.slice(stdoutOffset) + errText.slice(stderrOffset)
        stdoutOffset = outText.length
        stderrOffset = errText.length
        return {
          delta,
          lossy: stdoutTruncated || stderrTruncated,
        }
      },
      observed: {
        stdout: makeReader(stdoutChunks, () => stdoutOffset, (value) => { stdoutOffset = value }, () => stdoutTruncated),
        stderr: makeReader(stderrChunks, () => stderrOffset, (value) => { stderrOffset = value }, () => stderrTruncated),
      },
      kill() {
        if (settled) return false
        status = 'killed'
        return child.kill()
      },
      result() {
        return resultPromise
      },
    }
  }

  return {
    get sandboxMode() {
      return 'danger-full-access'
    },
    resolve,
    execute,
  }
}

export function createBoundRemoteShell(ctx) {
  const services = new Map()
  const log = makeSandboxLogger(ctx)

  function service() {
    const binding = ctx.get('remoteSshWorkspace')?.current?.()
    if (!binding || !binding.host || !binding.remotePath) {
      const error = new Error('No Remote Agent workspace is bound to the current session.')
      error.code = 'SHELL_NO_REMOTE_WORKSPACE'
      throw error
    }
    const key = `${binding.host}\u0000${binding.remotePath}\u0000${binding.sandbox ?? ''}`
    let current = services.get(key)
    if (!current) {
      current = createRemoteShell({ host: binding.host, remotePath: binding.remotePath, sandbox: binding.sandbox, log })
      services.set(key, current)
    }
    return current
  }

  return {
    get sandboxMode() { return 'danger-full-access' },
    resolve(request) { return service().resolve(request) },
    execute(request) { return service().execute(request) },
  }
}

export function apply(ctx, config) {
  const service = typeof config?.host === 'string' && config?.host !== ''
    ? createRemoteShell(config)
    : createBoundRemoteShell(ctx)
  ctx.provide('shell', service)
}
