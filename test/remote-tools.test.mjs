import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, buildRemoteCommand, inject, name, resolveRemotePath } from '../remote-tools.js'
import { shellQuote } from '../lib/remote.js'

test('remote tools resolve paths inside the configured remote root', () => {
  const cfg = { remotePath: '/root/data' }
  assert.equal(resolveRemotePath(cfg, 'src/app.ts'), '/root/data/src/app.ts')
  assert.equal(resolveRemotePath(cfg, './src/app.ts'), '/root/data/src/app.ts')
  assert.equal(resolveRemotePath(cfg, '/etc/hosts'), '/etc/hosts')
  assert.equal(resolveRemotePath(cfg, '../README.md'), '/root/README.md')
  assert.throws(() => resolveRemotePath(cfg, ''), /path is required/)
})

test('remote commands are passed to ssh as one shell-quoted sh -lc script', () => {
  const script = `mkdir -p '/root/data' && printf '%s' 'ok'`
  assert.equal(buildRemoteCommand(script), `sh -lc ${shellQuote(script)}`)
  assert.ok(buildRemoteCommand(script).startsWith('sh -lc '))
  assert.ok(!buildRemoteCommand(script).includes('\n'))
})

test('remote tools register the four SSH tools and validate config', () => {
  const registered = []
  const ctx = { tools: { register(definition) { registered.push(definition) } } }
  apply(ctx, { host: 'aliyun', remotePath: '/root/data' })
  assert.equal(name, 'remote-agent-tools')
  assert.deepEqual(inject, ['tools'])
  assert.deepEqual(registered.map((definition) => definition.name).sort(), ['bash', 'edit', 'glob', 'grep', 'read', 'write'])
  for (const definition of registered) {
    assert.equal(definition.parameters.type, 'object')
    assert.equal(typeof definition.output.render, 'function')
    assert.deepEqual(definition.output.schema, { type: 'object', additionalProperties: true })
    assert.equal(typeof definition.execute, 'function')
  }
  assert.throws(() => apply(ctx, { remotePath: '/root/data' }), /config.host/)
  assert.throws(() => apply(ctx, { host: 'aliyun', remotePath: 'relative' }), /absolute config.remotePath/)
})

test('remote tools can be limited to the tools a preset excludes elsewhere', () => {
  const registered = []
  const ctx = { tools: { register(definition) { registered.push(definition.name) } } }
  apply(ctx, { host: 'aliyun', remotePath: '/root/data', tools: ['bash'] })
  assert.deepEqual(registered, ['bash'])
})
