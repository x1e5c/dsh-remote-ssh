import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, createRemoteTerminalBackend } from '../remote-terminal.js'

test('remote terminal backend has a stable type and validates config', () => {
  const backend = createRemoteTerminalBackend({ host: 'aliyun', remotePath: '/root/data' })
  assert.equal(backend.type, 'remote-ssh')
  assert.equal(typeof backend.spawn, 'function')
  assert.throws(() => createRemoteTerminalBackend({ host: 'aliyun', remotePath: 'relative' }), /absolute config.remotePath/)
})

test('remote terminal backend registers through ctx.terminals', () => {
  let registered = null
  apply({ terminals: { registerBackend(value) { registered = value } } }, { host: 'aliyun', remotePath: '/root/data' })
  assert.equal(registered.type, 'remote-ssh')
  assert.equal(typeof registered.spawn, 'function')
})
