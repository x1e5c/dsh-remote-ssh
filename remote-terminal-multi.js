import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRemoteTerminalBackend } from './remote-terminal.js'
import { remoteTerminalType } from './remote-terminal-types.js'

export const name = 'remote-terminal-multi'
export const inject = ['terminals']

function stateFile(ctx) {
  try {
    const dir = ctx.dshHomePath?.('remote-ssh')
    if (typeof dir === 'string' && dir !== '') return join(dir, 'agent-workspaces.json')
  } catch {
    // fall through
  }
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'remote-ssh', 'agent-workspaces.json')
}

function backendType(record) {
  return remoteTerminalType(record?.target, record?.remotePath)
}

export function apply(ctx) {
  const backends = new Map()
  let closed = false
  let inFlight = false
  let lastStamp = null

  const refresh = async () => {
    if (closed || inFlight) return
    inFlight = true
    try {
      const file = stateFile(ctx)
      let workspaces = {}
      try {
        const info = await stat(file)
        const stamp = `${info.mtimeMs}:${info.size}`
        if (stamp === lastStamp) return
        const parsed = JSON.parse(await readFile(file, 'utf8'))
        lastStamp = stamp
        workspaces = parsed?.workspaces && typeof parsed.workspaces === 'object' ? parsed.workspaces : {}
      } catch {
        if (lastStamp === 'missing') return
        lastStamp = 'missing'
        workspaces = {}
      }
      const wanted = new Map()
      for (const record of Object.values(workspaces)) {
        if (typeof record?.target !== 'string' || typeof record?.remotePath !== 'string') continue
        if (!record.remotePath.startsWith('/')) continue
        const type = backendType(record)
        if (wanted.has(type)) continue
        wanted.set(type, {
          host: record.target,
          remotePath: record.remotePath,
          type,
          sandbox: record.sandbox === 'bwrap' ? 'bwrap' : null,
        })
      }
      for (const [type, dispose] of [...backends]) {
        if (wanted.has(type)) continue
        try { await dispose() } catch { /* best effort */ }
        backends.delete(type)
      }
      for (const [type, config] of wanted) {
        if (backends.has(type)) continue
        try {
          const dispose = ctx.terminals.registerBackend(createRemoteTerminalBackend(config))
          backends.set(type, dispose)
        } catch {
          // duplicate type during reload; retry on the next tick
          lastStamp = null
        }
      }
    } finally {
      inFlight = false
    }
  }

  void refresh()
  const timer = setInterval(() => { void refresh() }, 5000)
  timer.unref?.()
  ctx.effect(() => () => {
    closed = true
    clearInterval(timer)
    for (const dispose of backends.values()) {
      try { void dispose() } catch { /* ignore */ }
    }
    backends.clear()
  }, 'remote-terminal-multi: cleanup')
}
