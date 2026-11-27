import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, isWithinRemoteWorkspace } from '../remote-fs-approval.js'
import { createRemoteFileSystem } from '../remote-fs.js'
import { REMOTE_WORKSPACE_SERVICE } from '../lib/binding-service.js'

function capture(binding = null, config = {}) {
  let listener = null
  const ctx = {
    get(name) {
      if (name === 'remoteSshWorkspace' && binding) {
        return { current: () => binding }
      }
      return undefined
    },
    effect(fn) {
      fn()
    },
    on(_name, fn) {
      listener = fn
      return () => {}
    },
  }
  apply(ctx, config)
  return listener
}

test('remote fs approval asks for write, edit, and bash without bwrap', async () => {
  const listener = capture()
  const next = async () => ({ kind: 'allow' })
  assert.deepEqual(
    await listener({ name: 'write', arguments: { file_path: '/root/data/a.txt' } }, next),
    { kind: 'ask', reason: 'write /root/data/a.txt on the remote SSH workspace' },
  )
  assert.deepEqual(
    await listener({ name: 'edit', arguments: { file_path: '/root/data/a.txt' } }, next),
    { kind: 'ask', reason: 'edit /root/data/a.txt on the remote SSH workspace' },
  )
  assert.deepEqual(
    await listener({ name: 'bash', arguments: { command: 'ls' } }, next),
    { kind: 'ask', reason: 'run a command on the remote SSH workspace' },
  )
  assert.deepEqual(await listener({ name: 'read', arguments: {} }, next), { kind: 'allow' })
})

test('bwrap sandbox auto-approves bash and in-workspace write/edit while still asking outside workspace', async () => {
  const binding = { host: 'dev', remotePath: '/root/data', sandbox: 'bwrap' }
  const listener = capture(binding)
  const next = async () => ({ kind: 'allow' })

  assert.deepEqual(await listener({ name: 'bash', arguments: { command: 'ls' } }, next), { kind: 'allow' })
  assert.deepEqual(await listener({ name: 'write', arguments: { file_path: '/root/data/src/a.js' } }, next), { kind: 'allow' })
  assert.deepEqual(await listener({ name: 'edit', arguments: { file_path: 'src/a.js' } }, next), { kind: 'allow' })

  // Paths escaping the workspace (absolute, .., or sibling prefix /root/data2) must still ask.
  assert.equal((await listener({ name: 'write', arguments: { file_path: '/etc/hosts' } }, next)).kind, 'ask')
  assert.equal((await listener({ name: 'edit', arguments: { file_path: '../secret.env' } }, next)).kind, 'ask')
  assert.equal((await listener({ name: 'write', arguments: { file_path: '/root/data2/evil.txt' } }, next)).kind, 'ask')
  assert.equal((await listener({ name: 'write', arguments: { file_path: '' } }, next)).kind, 'ask')

  // sandboxAutoApprove: false forces prompts even under bwrap.
  const strict = capture(binding, { sandboxAutoApprove: false })
  assert.equal((await strict({ name: 'bash', arguments: { command: 'ls' } }, next)).kind, 'ask')
  assert.equal((await strict({ name: 'edit', arguments: { file_path: 'src/a.js' } }, next)).kind, 'ask')
})

test('remote fs approval falls back to process-global workspace binding when isolated preset scope hides ctx.get', async () => {
  const previous = globalThis[REMOTE_WORKSPACE_SERVICE]
  globalThis[REMOTE_WORKSPACE_SERVICE] = {
    current: () => ({ host: 'dev', remotePath: '/srv/work', sandbox: 'bwrap' }),
  }
  try {
    const listener = capture(null)
    const next = async () => ({ kind: 'allow' })
    assert.deepEqual(await listener({ name: 'edit', arguments: { file_path: 'app.js' } }, next), { kind: 'allow' })
    assert.equal((await listener({ name: 'edit', arguments: { file_path: '/etc/passwd' } }, next)).kind, 'ask')
  } finally {
    if (previous === undefined) delete globalThis[REMOTE_WORKSPACE_SERVICE]
    else globalThis[REMOTE_WORKSPACE_SERVICE] = previous
  }
})

test('isWithinRemoteWorkspace enforces exact POSIX boundaries', () => {
  assert.equal(isWithinRemoteWorkspace('/root/data', 'a/b.txt'), true)
  assert.equal(isWithinRemoteWorkspace('/root/data', '/root/data/a/b.txt'), true)
  assert.equal(isWithinRemoteWorkspace('/root/data', '/root/data/../data/a.txt'), true)
  assert.equal(isWithinRemoteWorkspace('/root/data', '/root/data/../other/a.txt'), false)
  assert.equal(isWithinRemoteWorkspace('/root/data', '/root/data2/a.txt'), false)
  assert.equal(isWithinRemoteWorkspace('/root/data', 'C:\\Windows\\win.ini'), false)
})

test('remote-fs writeText under bwrap includes realpath symlink-escape guard and rejects escape', async () => {
  let capturedScript = ''
  const fs = createRemoteFileSystem({ host: 'dev', remotePath: '/root/data', sandbox: 'bwrap' }, async (_cfg, script) => {
    if (script.startsWith('stat -c')) return { code: 1, stdout: '', stderr: 'No such file or directory' }
    capturedScript = script
    return { code: 42, stdout: '', stderr: '__DSH_SANDBOX_ESCAPE__\n' }
  })
  await assert.rejects(
    () => fs.writeText({ targetKey: '/root/data/escape-link', displayPath: '/root/data/escape-link' }, 'payload'),
    (err) => err?.code === 'FS_SANDBOX_ESCAPE',
  )
  assert.ok(capturedScript.includes('realpath -m'))
})
