import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RemoteSshController } from '../lib/controller.js'

class TestController extends RemoteSshController {
  checkSshAvailable() {
    return Promise.resolve(true)
  }
}

async function makeController() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-ssh-test-'))
  const store = new Map()
  const credentials = {
    async set(ref, value) {
      assert.match(ref, /^[A-Z][A-Z0-9_]*$/)
      store.set(ref, value)
    },
    async resolve(ref) {
      return store.has(ref) ? { value: store.get(ref) } : undefined
    },
    async describe(ref) {
      return { configured: store.has(ref) }
    },
    async unset(ref) {
      store.delete(ref)
    },
  }
  const ctx = {
    dshHomePath: (...parts) => join(dir, ...parts),
    get: (name) => name === 'credentials' ? credentials : undefined,
    logger: { info() {}, warn() {}, error() {} },
  }
  const controller = new TestController(ctx, {})
  await controller.ready
  return { controller, store }
}

test('remote workspaces persist, copy same-host secrets, and mark opens', async () => {
  const { controller, store } = await makeController()
  const first = await controller.save({
    name: 'GPU /root',
    target: 'aliyun',
    remotePath: '/root',
    secret: 'hunter2',
  })
  assert.ok(first.host.id)
  assert.equal(first.hasSecret, true)

  const second = await controller.save({
    name: 'GPU /srv/data',
    target: 'aliyun',
    remotePath: '/srv/data',
    copySecretFrom: first.host.id,
  })
  assert.ok(second.host.id)
  assert.notEqual(second.host.id, first.host.id)
  assert.equal(second.hasSecret, true)
  assert.equal(await controller.getSecret(second.host), 'hunter2')

  const other = await controller.save({
    name: 'Other host',
    target: 'node02',
    remotePath: '/home/me',
    copySecretFrom: first.host.id,
  })
  assert.equal(other.hasSecret, false)

  const marked = await controller.markOpened(first.host.id)
  assert.ok(marked.lastOpenedAt)
  const listed = await controller.list()
  const found = listed.connections.find((item) => item.id === first.host.id)
  assert.equal(found.lastOpenedAt, marked.lastOpenedAt)

  await controller.remove(second.host.id)
  assert.equal(store.has(`REMOTE_SSH_${second.host.id.toUpperCase()}`), false)
  await controller.dispose()
})
