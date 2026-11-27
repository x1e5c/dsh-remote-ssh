import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../remote-tool-restrict.js'

test('remote presets hide global ops tools and deny scope-local local tools', async () => {
  let restriction = null
  let listener = null
  const knownGlobalTools = new Set(['working_directory', 'render_ui', 'validate_dsh_ui'])
  apply({
    tools: {
      restrict(value) {
        for (const name of value.deny) {
          if (!knownGlobalTools.has(name)) throw new Error(`tools.restrict() names unknown global tool "${name}"`)
        }
        restriction = value
      },
    },
    effect(fn) { fn() },
    get() { return undefined },
    on(name, fn) {
      assert.equal(name, 'tools/pre-execute')
      listener = fn
      return () => {}
    },
  })
  assert.deepEqual(restriction.deny, ['working_directory', 'render_ui', 'validate_dsh_ui'])

  const next = async () => ({ kind: 'allow' })
  const denied = await listener({ name: 'ops_bash' }, next)
  assert.equal(denied.kind, 'deny')
  assert.match(denied.reason, /disabled in this remote workspace/)
  const discovered = await listener({ name: 'ops_discover_tools' }, next)
  assert.equal(discovered.kind, 'deny')
  assert.deepEqual(await listener({ name: 'bash' }, next), { kind: 'allow' })
  assert.deepEqual(await listener({ name: 'read' }, next), { kind: 'allow' })

  // The plugin ships no remote terminal backend, so opening a terminal in a
  // remote workspace would run on the local machine — always denied.
  const terminal = await listener({ name: 'terminal_open', arguments: { type: 'remote-ssh' } }, next)
  assert.equal(terminal.kind, 'deny')
  assert.match(terminal.reason, /disabled in this remote workspace/)
})
