import assert from 'node:assert/strict'
import test from 'node:test'
import { zstdCompressSync } from 'node:zlib'
import {
  buildImportedSessionHeader,
  dedupeRemoteSessions,
  normalizeImportedEvents,
  parseRemoteSessionScan,
  sessionIdFromPath,
  sessionTitleFromEvents,
  summarizeRemoteSession,
} from '../lib/remote-sessions.js'

const id = 'session-11111111-2222-3333-4444-555555555555'
const path = `/home/me/.dsh/sessions/--home-me-project--/${id}/session.v4.jsonl.zstd`

function logBuffer(version = 4) {
  const header = {
    type: 'session',
    version,
    id,
    createdAt: 1_700_000_000_000,
    cwd: '/home/me/project',
    isSeeded: false,
    delegationDepth: 0,
    agentPreset: 'remote-agent-fs',
  }
  const user = {
    type: 'user/message',
    seq: 0,
    time: 1_700_000_000_001,
    data: {
      content: [{ type: 'text', text: 'Explain the pipeline\nand the data' }],
      source: { kind: 'user' },
      role: 'user',
      id: 'message-1',
    },
  }
  const context = {
    type: 'user/message',
    seq: 1,
    data: {
      content: [{ type: 'text', text: 'runtime context' }],
      source: { kind: 'runtime-context' },
      role: 'user',
      id: 'message-2',
    },
  }
  return Buffer.concat([
    zstdCompressSync(Buffer.from(`${JSON.stringify(header)}\n${JSON.stringify(user)}\n`)),
    zstdCompressSync(Buffer.from(`${JSON.stringify(context)}\n`)),
  ])
}

function scanText({ version = 4, mtime = 1_700_000_000, sessionPath = path } = {}) {
  const log = logBuffer(version)
  return [
    `@@DSHRS_SESSION@@${mtime}\t${log.length}\t${sessionPath}`,
    log.toString('base64'),
    '@@DSHRS_SESSION_END@@',
  ].join('\n')
}

test('parseRemoteSessionScan reads metadata and preview bytes', () => {
  const entries = parseRemoteSessionScan(scanText())
  assert.equal(entries.length, 1)
  assert.equal(entries[0].path, path)
  assert.equal(entries[0].size, logBuffer().length)
  assert.equal(entries[0].buffer.length, logBuffer().length)
})

test('summarizeRemoteSession extracts the first real user message', () => {
  const [entry] = parseRemoteSessionScan(scanText())
  const summary = summarizeRemoteSession(entry, { localExists: true, workspaceKnown: false })
  assert.equal(summary.id, id)
  assert.equal(summary.title, 'Explain the pipeline and the data')
  assert.equal(summary.cwd, '/home/me/project')
  assert.equal(summary.version, 4)
  assert.equal(summary.localExists, true)
  assert.equal(summary.workspaceKnown, false)
})

test('summarizeRemoteSession tolerates a truncated preview', () => {
  const [entry] = parseRemoteSessionScan(scanText())
  entry.buffer = entry.buffer.subarray(0, 20)
  const summary = summarizeRemoteSession(entry)
  assert.equal(summary.id, id)
  assert.equal(summary.title, null)
  assert.equal(summary.version, 4)
})

test('dedupeRemoteSessions prefers v4 over v3 and the newest file', () => {
  const older = { id, version: 3, mtime: 100 }
  const newer = { id, version: 4, mtime: 90 }
  const newest = { id, version: 4, mtime: 110 }
  assert.equal(dedupeRemoteSessions([older, newer])[0].version, 4)
  assert.equal(dedupeRemoteSessions([newer, newest])[0], newest)
  assert.equal(dedupeRemoteSessions([older, newer, newest])[0].mtime, 110)
})

test('buildImportedSessionHeader points the session at the local remote workspace', () => {
  const [entry] = parseRemoteSessionScan(scanText())
  const decoded = summarizeRemoteSession(entry)
  const local = buildImportedSessionHeader({
    id: decoded.id,
    version: decoded.version,
    createdAt: decoded.createdAt,
    isSeeded: false,
    delegationDepth: 0,
  }, {
    cwd: 'C:\\Users\\me\\.dsh\\remote-ssh\\agent-workspaces\\abc',
    preset: 'remote-standard',
  })
  assert.equal(local.id, id)
  assert.equal(local.type, undefined)
  assert.equal(local.version, 4)
  assert.equal(local.cwd, 'C:\\Users\\me\\.dsh\\remote-ssh\\agent-workspaces\\abc')
  assert.equal(local.agentPreset, 'remote-standard')
  assert.equal(local.delegationDepth, 0)
  assert.equal(local.title, undefined)
  assert.deepEqual(Object.keys(local).sort(), [
    'agentPreset', 'createdAt', 'cwd', 'delegationDepth', 'id', 'isSeeded', 'version',
  ])
})

test('sessionTitleFromEvents falls back to a goal objective', () => {
  const events = [{
    type: 'user/message',
    data: {
      content: [{ type: 'text', text: '<goal_round> Objective: "Refactor the pipeline"' }],
      source: { kind: 'goal' },
    },
  }]
  assert.equal(sessionTitleFromEvents(events), 'Refactor the pipeline')
})

test('sessionIdFromPath validates the session directory', () => {
  assert.equal(sessionIdFromPath(path), id)
  assert.equal(sessionIdFromPath('/tmp/not-a-session/session.v4.jsonl.zstd'), null)
})

test('normalizeImportedEvents keeps sequences and sanitizes policy events', () => {
  const events = [
    { type: 'agent-preset/selected', seq: 4, data: { agentPreset: 'cordis' } },
    { type: 'approval/policy', seq: 5, data: { policy: 'never' }, source: 'delegation' },
    { type: 'sandbox/mode', seq: 6, data: { mode: 'danger-full-access' } },
    { type: 'permission/preset', seq: 7, data: { preset: 'yolo' } },
    {
      type: 'user/message',
      seq: 8,
      data: { content: [] },
      sourceEventSeqs: [4, [5, 8]],
      throughSeq: 7,
    },
  ]
  const normalized = normalizeImportedEvents(events, 'remote-standard')
  assert.equal(normalized.length, events.length)
  assert.deepEqual(
    normalized.map((event) => event.seq),
    [4, 5, 6, 7, 8],
  )
  assert.equal(normalized[0].data.agentPreset, 'remote-standard')
  assert.deepEqual(normalized[1].data, { policy: 'ask' })
  assert.deepEqual(normalized[2].data, { mode: 'workspace-write' })
  assert.deepEqual(normalized[3].data, { preset: 'workspace-write' })
  assert.deepEqual(normalized[4].sourceEventSeqs, [4, [5, 8]])
  assert.equal(normalized[4].throughSeq, 7)
  assert.equal(normalized[4].data, events[4].data)
  assert.equal(events[0].data.agentPreset, 'cordis')
  assert.equal(events[4].seq, 8)
})
