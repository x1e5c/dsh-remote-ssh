import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../remote-tools.js'

const config = { host: 'aliyun', remotePath: '/root/data' }
const tools = new Map()
apply({ tools: { register(definition) { tools.set(definition.name, definition) } }, get: () => undefined }, config)

const execute = (name, args) => tools.get(name).execute(args, {})

test('remote tools write, edit, bash, and read the same remote file over SSH', {
  skip: process.env.DSH_REMOTE_TOOLS_INTEGRATION !== '1',
}, async () => {
  const target = '/root/data/agent-direct-test.txt'
  const write = await execute('write', { path: target, content: 'alpha' })
  assert.match(write.text, /Wrote/)

  const edit = await execute('edit', { path: target, old_string: 'alpha', new_string: 'beta', replace_all: false })
  assert.equal(edit.replacements, 1)

  const bash = await execute('bash', { command: `cat ${target}`, timeoutMs: 30000 })
  assert.equal(bash.exitCode, 0)
  assert.match(bash.text, /beta/)

  const read = await execute('read', { path: target })
  assert.match(read.text, /beta/)

  const cleanup = await execute('bash', { command: `rm -f ${target}`, timeoutMs: 30000 })
  assert.equal(cleanup.exitCode, 0)
})
