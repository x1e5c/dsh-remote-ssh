import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Decode a concatenated-zstd JSONL session log written by dsh. */
export function decodeSessionLog(buffer) {
  const frames = []
  let position = 0
  while (position < buffer.length) {
    const start = buffer.indexOf(ZSTD_MAGIC, position)
    if (start < 0) break
    let next = buffer.indexOf(ZSTD_MAGIC, start + 4)
    let decoded = null
    while (next >= 0) {
      try {
        decoded = zstdDecompressSync(buffer.subarray(start, next))
        break
      } catch {
        next = buffer.indexOf(ZSTD_MAGIC, next + 4)
      }
    }
    if (decoded === null) {
      try {
        decoded = zstdDecompressSync(buffer.subarray(start))
      } catch {
        decoded = null
      }
    }
    if (decoded === null) {
      position = start + 4
      continue
    }
    frames.push(decoded.toString('utf8'))
    position = next < 0 ? buffer.length : next
  }

  let header = null
  const events = []
  for (const text of frames) {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (line === '') continue
      let record
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      if (record && record.type === 'session' && header === null) {
        header = record
        continue
      }
      if (record && typeof record.type === 'string' && typeof record.seq === 'number') {
        events.push(record)
      }
    }
  }
  if (!header) throw new Error('the session log has no header record')
  if (!Number.isSafeInteger(header.version)) throw new Error('the session log header has no version')
  if (typeof header.id !== 'string' || header.id === '') throw new Error('the session log header has no id')
  return { header, events }
}

export function remoteWorkspaceKey(cwd) {
  return createHash('sha256').update(String(cwd)).digest('hex').slice(0, 16)
}

export function mirrorWorkspacePath(baseDir, remoteCwd) {
  return join(baseDir, remoteWorkspaceKey(remoteCwd))
}

/**
 * Mirror one decoded remote session into local persistence and attach it to a
 * local mirror workspace. The local session is read-only by policy; the bridge
 * rejects new agent steps for mirrored ids.
 */
export async function mirrorSession({ sessionPersistence, workspaceRegistry, baseDir, remotePath, log, notice }) {
  const { header, events } = decodeSessionLog(log)
  const remoteCwd = typeof header.cwd === 'string' && header.cwd.startsWith('/') ? header.cwd : null
  if (!remoteCwd) throw new Error('the remote session has no absolute cwd')

  const workspaceDir = mirrorWorkspacePath(baseDir, remoteCwd)
  await mkdir(workspaceDir, { recursive: true })
  const title = `远程 · ${remoteCwd}`
  const workspace = await workspaceRegistry.create(workspaceDir, title)

  const existing = await sessionPersistence.stat(header.id)
  if (existing) {
    await workspace.attachSession(header.id)
    notice?.(`skipped existing ${header.id}`)
    return { id: header.id, skipped: true, events: events.length, cwd: remoteCwd, lastSeq: events.at(-1)?.seq ?? -1 }
  }

  const localHeader = {
    version: header.version,
    id: header.id,
    createdAt: typeof header.createdAt === 'number' ? header.createdAt : Date.now(),
    cwd: workspaceDir,
    isSeeded: header.isSeeded === true,
    agentPreset: 'standard',
    ...(typeof header.delegationDepth === 'number' ? { delegationDepth: header.delegationDepth } : {}),
  }
  const handle = await sessionPersistence.create(localHeader)
  try {
    if (events.length > 0) await handle.append(events)
    await handle.flush()
  } finally {
    await handle.close()
  }
  await workspace.attachSession(header.id)
  notice?.(`mirrored ${remotePath} -> ${header.id} (${events.length} events)`)
  return { id: header.id, skipped: false, events: events.length, cwd: remoteCwd, lastSeq: events.at(-1)?.seq ?? -1 }
}
