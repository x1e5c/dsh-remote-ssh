import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RemoteSshController, formatRemoteWorkspaceTitle } from '../lib/controller.js'

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
    inject(names, callback) {
      const scope = { credentials }
      callback(scope)
    },
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

test('formatRemoteWorkspaceTitle uses "dir @ host", disambiguates same-host collisions, and createAgentWorkspace accepts custom title', async () => {
  const hostA = { id: 'h-a', name: 'gpu-01', target: 'root@10.0.0.5' }
  const hostB = { id: 'h-b', name: '', target: 'dev@10.0.0.8' }

  assert.equal(formatRemoteWorkspaceTitle(hostA, '/home/dev/my-app'), 'my-app @ gpu-01')
  assert.equal(formatRemoteWorkspaceTitle(hostB, '/srv/my-app'), 'my-app @ dev@10.0.0.8')
  assert.equal(formatRemoteWorkspaceTitle(hostA, '/'), '/ @ gpu-01')

  // Same basename on a different host does not force parent segments.
  assert.equal(
    formatRemoteWorkspaceTitle(hostA, '/srv/v2/app', [{ hostId: 'h-b', target: 'dev@10.0.0.8', remotePath: '/srv/v1/app' }]),
    'app @ gpu-01',
  )
  // Same basename on the same host automatically includes parent segment(s).
  assert.equal(
    formatRemoteWorkspaceTitle(hostA, '/srv/v2/app', [{ hostId: 'h-a', target: 'root@10.0.0.5', remotePath: '/srv/v1/app' }]),
    'v2/app @ gpu-01',
  )

  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-title-test-'))
  const createdWorkspaces = []
  const workspaceRegistry = {
    async create(path, title) {
      const existing = createdWorkspaces.find((ws) => ws.path === path)
      if (existing) return existing
      const ws = {
        id: `ws-${createdWorkspaces.length + 1}`,
        path,
        title,
        async setTitle(nextTitle) {
          this.title = nextTitle
        },
      }
      createdWorkspaces.push(ws)
      return ws
    },
    get(id) {
      return createdWorkspaces.find((ws) => ws.id === id)
    },
  }
  const ctx = {
    dshHomePath: (...parts) => join(dir, ...parts),
    get: (name) => (name === 'workspaceRegistry' ? workspaceRegistry : undefined),
    inject() {},
    logger: { info() {}, warn() {}, error() {} },
  }
  const controller = new TestController(ctx, {})
  await controller.ready
  controller.remoteFileSystemFor = () => ({
    async stat() { return { type: 'directory', size: 4096, version: '1:4096' } },
  })
  const saved = await controller.save({ name: 'gpu-01', target: 'root@10.0.0.5', remotePath: '/home/dev/my-app' })

  const ws1 = await controller.createAgentWorkspace(saved.host.id, '/home/dev/my-app')
  assert.equal(ws1.title, 'my-app @ gpu-01')

  // Second workspace with same basename on same host disambiguates automatically.
  const ws2 = await controller.createAgentWorkspace(saved.host.id, '/srv/staging/my-app')
  assert.equal(ws2.title, 'staging/my-app @ gpu-01')

  // Custom title overrides default and trims whitespace/newlines.
  const ws3 = await controller.createAgentWorkspace(saved.host.id, '/opt/train', 'standard', '  A100\n训练环境  ')
  assert.equal(ws3.title, 'A100 训练环境')

  // Re-adding an already-registered remote directory with a custom title updates its title via setTitle().
  const ws3Renamed = await controller.createAgentWorkspace(saved.host.id, '/opt/train', 'standard', '新名称')
  assert.equal(ws3Renamed.workspaceId, ws3.workspaceId)
  assert.equal(ws3Renamed.title, '新名称')

  // Re-adding a legacy "Remote Agent ..." workspace upgrades its title to the new "dir @ host" format.
  createdWorkspaces[0].title = 'Remote Agent (standard) 路 root@10.0.0.5:/home/dev/my-app'
  const ws1Upgraded = await controller.createAgentWorkspace(saved.host.id, '/home/dev/my-app')
  assert.equal(ws1Upgraded.workspaceId, ws1.workspaceId)
  assert.equal(ws1Upgraded.title, 'dev/my-app @ gpu-01')

  await controller.dispose()
})
