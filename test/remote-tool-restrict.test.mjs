import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../remote-tool-restrict.js'

test('remote presets hide global ops tools and deny scope-local local tools', async () => {
  let restriction = null
  let listener = null
  apply({
    tools: { restrict(value) { restriction = value } },
    effect(fn) { fn() },
    get() { return undefined },
    on(name, fn) {
      assert.equal(name, 'tools/pre-execute')
      listener = fn
      return () => {}
    },
  })
  assert.ok(restriction.deny.includes('ops_read_files'))
  assert.ok(restriction.deny.includes('working_directory'))
  assert.ok(!restriction.deny.includes('ops_bash'))

  const next = async () => ({ kind: 'allow' })
  const denied = await listener({ name: 'ops_bash' }, next)
  assert.equal(denied.kind, 'deny')
  assert.match(denied.reason, /disabled in this remote workspace/)
  const discovered = await listener({ name: 'ops_discover_tools' }, next)
  assert.equal(discovered.kind, 'deny')
  assert.deepEqual(await listener({ name: 'bash' }, next), { kind: 'allow' })
  assert.deepEqual(await listener({ name: 'read' }, next), { kind: 'allow' })
  assert.deepEqual(
    await listener({ name: 'terminal_open', arguments: { type: 'remote-ssh' } }, next),
    { kind: 'allow' },
  )
  const localTerminal = await listener({ name: 'terminal_open', arguments: { type: 'bash' } }, next)
  assert.equal(localTerminal.kind, 'deny')
})

test('a preset can require one exact terminal backend type', async () => {
  let listener = null
  apply({
    tools: { restrict() {} },
    effect(fn) { fn() },
    get() { return undefined },
    on(_name, fn) { listener = fn; return () => {} },
  }, { terminalType: 'remote-ssh-aliyun-root-data-2fd799' })
  const next = async () => ({ kind: 'allow' })
  assert.deepEqual(
    await listener({ name: 'terminal_open', arguments: { type: 'remote-ssh-aliyun-root-data-2fd799' } }, next),
    { kind: 'allow' },
  )
  const other = await listener({ name: 'terminal_open', arguments: { type: 'remote-ssh' } }, next)
  assert.equal(other.kind, 'deny')
  assert.match(other.reason, /remote-ssh-aliyun-root-data-2fd799/)
})
