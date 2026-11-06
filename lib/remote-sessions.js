import { decodeSessionLog } from './mirror.js'

const SCAN_BEGIN = '@@DSHRS_SESSION@@'
const SCAN_END = '@@DSHRS_SESSION_END@@'
const SESSION_ID = /^session-[A-Za-z0-9._-]+$/

function firstUserText(events) {
  for (const event of events) {
    if (event?.type !== 'user/message') continue
    const source = event.data?.source
    const content = event.data?.content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text === '') continue
    if (source?.kind === 'user') return text
    if (source?.kind === 'goal') {
      const objective = /Objective:\s*"([^"]+)"/.exec(text)?.[1]
        ?? /Objective:\s*([^\n]+)/.exec(text)?.[1]
      if (objective) return objective.trim()
    }
  }
  return null
}

/** Derive the title shown in the local session list from remote events. */
export function sessionTitleFromEvents(events) {
  const text = firstUserText(events)
  if (!text) return null
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

export function sessionIdFromPath(path) {
  if (typeof path !== 'string') return null
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  const parent = parts.at(-2)
  return typeof parent === 'string' && SESSION_ID.test(parent) ? parent : null
}

function sessionVersionFromPath(path) {
  const name = String(path ?? '').replace(/\\/g, '/').split('/').at(-1) ?? ''
  const match = /^session\.v(\d+)\.jsonl\.zstd$/.exec(name)
  return match ? Number.parseInt(match[1], 10) : null
}

/** Parse the delimited output produced by the remote session scan command. */
export function parseRemoteSessionScan(text) {
  const entries = []
  const pattern = new RegExp(`${SCAN_BEGIN}([^\\n\\r]*)\\r?\\n([\\s\\S]*?)\\r?\\n${SCAN_END}`, 'g')
  let match
  while ((match = pattern.exec(String(text ?? ''))) !== null) {
    const meta = match[1].split('\t')
    if (meta.length < 3) continue
    const mtime = Number(meta[0])
    const size = Number(meta[1])
    const path = meta.slice(2).join('\t')
    if (!path.startsWith('/') || !Number.isFinite(mtime) || !Number.isFinite(size)) continue
    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
    if (buffer.length === 0) continue
    entries.push({ mtime, size, path, buffer })
  }
  return entries
}

/**
 * Turn one remote log preview into the metadata shown in the import dialog.
 * A truncated preview is deliberately tolerated: the header lives in its own
 * frame, so the first frame is normally complete even when later frames are
 * cut off by the preview size limit.
 */
export function summarizeRemoteSession(entry, options = {}) {
  let header = null
  let events = []
  try {
    const decoded = decodeSessionLog(entry.buffer)
    header = decoded.header
    events = decoded.events
  } catch {
    // The preview may be truncated before the header frame is complete.
  }
  const id = typeof header?.id === 'string' && SESSION_ID.test(header.id)
    ? header.id
    : sessionIdFromPath(entry.path)
  if (!id) return null
  const version = Number.isSafeInteger(header?.version)
    ? header.version
    : sessionVersionFromPath(entry.path)
  const cwd = typeof header?.cwd === 'string' && header.cwd.startsWith('/') ? header.cwd : null
  const createdAt = Number.isFinite(header?.createdAt)
    ? header.createdAt
    : Math.round(entry.mtime * 1000)
  const title = typeof header?.title === 'string' && header.title.trim() !== ''
    ? header.title.trim()
    : sessionTitleFromEvents(events)
  return {
    id,
    title: title || null,
    cwd,
    version,
    size: entry.size,
    mtime: entry.mtime,
    createdAt,
    updatedAt: Math.round(entry.mtime * 1000),
    agentPreset: typeof header?.agentPreset === 'string' ? header.agentPreset : null,
    localExists: options.localExists === true,
    workspaceKnown: options.workspaceKnown === true,
    remotePath: entry.path,
  }
}

/** Keep one summary per session id, preferring v4 and the newest file. */
export function dedupeRemoteSessions(sessions) {
  const byId = new Map()
  for (const session of sessions) {
    if (!session) continue
    const previous = byId.get(session.id)
    if (!previous) {
      byId.set(session.id, session)
      continue
    }
    const previousVersion = Number.isSafeInteger(previous.version) ? previous.version : 0
    const nextVersion = Number.isSafeInteger(session.version) ? session.version : 0
    if (nextVersion > previousVersion || (nextVersion === previousVersion && session.mtime > previous.mtime)) {
      byId.set(session.id, session)
    }
  }
  return [...byId.values()].sort((left, right) => right.mtime - left.mtime)
}

/**
 * Build the local session header for an imported remote session. The cwd and
 * agent preset must point at the local remote-agent workspace so that the
 * local agent can resolve the remote binding and continue the session.
 */
export function buildImportedSessionHeader(header, { cwd, preset }) {
  if (!header || typeof header.id !== 'string' || !SESSION_ID.test(header.id)) {
    throw new Error('the remote session header has no valid id')
  }
  if (typeof cwd !== 'string' || cwd === '') throw new Error('the local workspace path is missing')
  if (typeof preset !== 'string' || preset === '') throw new Error('the remote preset is missing')
  const local = {
    version: 4,
    id: header.id,
    createdAt: Number.isFinite(header.createdAt) ? header.createdAt : Date.now(),
    cwd,
    // Import the snapshot as a standalone session. A seeded remote session
    // would otherwise require the exact inherited cut, which is not part of
    // the remote header snapshot.
    isSeeded: false,
    agentPreset: preset,
    // The imported snapshot is a standalone local session, not a delegated
    // child of the remote session's parent.
    delegationDepth: 0,
  }
  return local
}

/**
 * The remote session may have selected a local-only preset (for example
 * `cordis`). Rewrite preset-selection events so replaying the imported log
 * cannot switch the local session away from its remote-agent preset.
 *
 * Remote runtime-policy events are kept in the stream, because v4 event
 * relationships such as delivery `throughSeq`, developer `headerSeq`,
 * compaction `shadowedRange` and source-event references must keep pointing at
 * the original sequence numbers. Their payloads are replaced with restrictive
 * local defaults so importing a remote snapshot cannot raise this session's
 * local permissions.
 */
const SAFE_POLICY_DATA = {
  'approval/policy': { policy: 'ask' },
  'sandbox/mode': { mode: 'workspace-write' },
  'permission/preset': { preset: 'workspace-write' },
}

export function normalizeImportedEvents(events, preset) {
  if (!Array.isArray(events)) return []
  return events.map((event) => {
    if (!event || typeof event !== 'object') return event
    const safePolicy = SAFE_POLICY_DATA[event.type]
    if (safePolicy) return { ...event, data: { ...safePolicy } }
    if (event.type === 'agent-preset/selected') {
      return { ...event, data: { ...(event.data ?? {}), agentPreset: preset } }
    }
    return { ...event }
  })
}

export { SESSION_ID }
