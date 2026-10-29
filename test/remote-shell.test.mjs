import assert from 'node:assert/strict'
import test from 'node:test'
import { createRemoteShell } from '../remote-shell.js'

test('remote shell resolves workdir, timeout, output caps and environment', () => {
  const shell = createRemoteShell({ host: 'aliyun', remotePath: '/root/data' })
  assert.equal(shell.sandboxMode, 'danger-full-access')
  const spec = shell.resolve({
    command: 'pwd',
    workdir: 'C:\\Users\\xiesc\\remote-handle',
    timeoutMs: 999_999,
    stdoutMaxBytes: 99_999_999,
    onExpiry: 'none',
    env: { FOO: 'bar' },
    dshEnv: { DSH_TEST: 'yes' },
  })
  assert.equal(spec.workdir, '/root/data')
  assert.equal(spec.timeoutMs, 600_000)
  assert.equal(spec.stdoutMaxBytes, 8 * 1024 * 1024)
  assert.equal(spec.onExpiry, 'none')
  assert.equal(spec.env.FOO, 'bar')
  assert.equal(spec.dshEnv.DSH_TEST, 'yes')
})

test('remote shell keeps absolute remote workdirs', () => {
  const shell = createRemoteShell({ host: 'aliyun', remotePath: '/root/data' })
  const spec = shell.resolve({ command: 'ls', workdir: '/srv/project' })
  assert.equal(spec.workdir, '/srv/project')
  assert.equal(spec.timeoutMs, 120_000)
  assert.equal(spec.onExpiry, 'kill')
})

test('remote shell service is provided under the shell key', async () => {
  let provided = null
  const ctx = { provide(key, value) { provided = { key, value } } }
  const { apply } = await import('../remote-shell.js')
  apply(ctx, { host: 'aliyun', remotePath: '/root/data' })
  assert.equal(provided.key, 'shell')
  assert.equal(typeof provided.value.resolve, 'function')
  assert.equal(typeof provided.value.execute, 'function')
})
