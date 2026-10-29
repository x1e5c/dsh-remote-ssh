import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RemoteSshController } from '../lib/controller.js'

class TestController extends RemoteSshController {
  async checkSshAvailable() { return false }
}

async function controllerFor() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-workspace-'))
  const ctx = {
    dshHomePath: (...parts) => join(dir, ...parts),
    get: () => undefined,
    provide() {},
    logger: { info() {}, warn() {}, error() {} },
  }
  const controller = new TestController(ctx, {})
  await controller.ready
  return controller
}

test('resolves the session cwd to its remote workspace binding', async () => {
  const controller = await controllerFor()
  controller.agentWorkspaces.set('ws-1', {
    hostId: 'h',
    target: 'iota-sc',
    remotePath: '/home/shichang/working/tttest',
    path: 'C:\\Users\\xiesc\\.dsh\\remote-ssh\\agent-workspaces\\abc123',
    mode: 'ptc',
    preset: 'remote-ptc',
  })
  const binding = controller.resolveRemoteWorkspace({
    header: { cwd: 'C:\\Users\\xiesc\\.dsh\\remote-ssh\\agent-workspaces\\abc123' },
  })
  assert.equal(binding.host, 'iota-sc')
  assert.equal(binding.remotePath, '/home/shichang/working/tttest')
  assert.equal(binding.mode, 'ptc')
  assert.equal(binding.preset, 'remote-ptc')
  assert.match(binding.terminalType, /^remote-ssh-iota-sc-/)

  const child = controller.resolveRemoteWorkspace({
    header: { cwd: 'C:/Users/xiesc/.dsh/remote-ssh/agent-workspaces/abc123/subdir' },
  })
  assert.equal(child.workspaceId, 'ws-1')
  assert.equal(controller.resolveRemoteWorkspace({ header: { cwd: 'C:/elsewhere' } }), null)
})

test('migrates old workspaces to a static mode preset', async () => {
  const controller = await controllerFor()
  controller.agentWorkspaces.set('ws-old', {
    hostId: 'h',
    target: 'aliyun',
    remotePath: '/root/data',
    path: 'C:/tmp/ws-old',
    preset: 'remote-agent-fs-deadbeef',
    mode: null,
  })
  await controller.migrateAgentWorkspaceModes()
  const record = controller.agentWorkspaces.get('ws-old')
  assert.equal(record.mode, 'standard')
  assert.equal(record.preset, 'remote-standard')
})
