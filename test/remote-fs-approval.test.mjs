import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../remote-fs-approval.js'

function capture() {
  let listener = null
  const ctx = {
    effect(fn) {
      fn()
    },
    on(_name, fn) {
      listener = fn
      return () => {}
    },
  }
  apply(ctx)
  return listener
}

test('remote fs approval asks for write and edit only', async () => {
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
