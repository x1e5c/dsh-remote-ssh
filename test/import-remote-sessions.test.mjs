import assert from 'node:assert/strict'
import test from 'node:test'
import { RemoteSshController } from '../lib/controller.js'

const host = { id: 'host-1', target: 'example', name: 'example' }
const remotePath = '/home/me/project'
const sessionId = 'session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function createHarness() {
  const controller = Object.create(RemoteSshController.prototype)
  controller.ready = Promise.resolve()
  controller.hosts = [host]
  controller.agentWorkspaces = new Map()
  controller.config = { mirrorNativeTree: false }
  controller.ctx = {
    get(name) {
      if (name === 'workspaceRegistry') return registry
      if (name === 'sessionPersistence') return persistence
      return null
    },
  }

  const attached = []
  const registry = {
    get(id) {
      if (id !== 'workspace-1') return null
      return {
        id,
        attachSession: async (session) => { attached.push(session) },
      }
    },
  }
  const created = []
  const persistence = {
    async stat() { return null },
    async create(header) {
      created.push(header)
      return {
        async append(events) { header.events = events },
        async flush() {},
        async close() {},
      }
    },
  }

  controller.createAgentWorkspace = async () => {
    controller.agentWorkspaces.set('workspace-1', {
      hostId: host.id,
      target: host.target,
      remotePath,
      path: 'C:\\Users\\me\\.dsh\\remote-ssh\\agent-workspaces\\abc',
      preset: 'remote-standard',
      mode: 'standard',
    })
    return { workspaceId: 'workspace-1', preset: 'remote-standard' }
  }
  controller.fetchRemoteSessionLog = async () => ({
    header: {
      type: 'session',
      version: 4,
      id: sessionId,
      createdAt: 1_700_000_000_000,
      cwd: remotePath,
      isSeeded: false,
      agentPreset: 'cordis',
    },
    events: [
      { type: 'agent-preset/selected', seq: 0, data: { agentPreset: 'cordis' } },
      {
        type: 'user/message',
        seq: 1,
        data: {
          content: [{ type: 'text', text: 'Refactor the pips pipeline' }],
          source: { kind: 'user' },
          role: 'user',
        },
      },
    ],
  })
  return { controller, created, attached }
}

test('importRemoteSessions binds the imported session to the remote-agent workspace', async () => {
  const { controller, created, attached } = createHarness()
  const result = await controller.importRemoteSessions({ id: host.id, sessionIds: [sessionId] })

  assert.equal(result.imported.length, 1)
  assert.equal(result.failed.length, 0)
  assert.equal(result.workspaceId, 'workspace-1')
  assert.equal(created.length, 1)
  assert.equal(created[0].cwd, 'C:\\Users\\me\\.dsh\\remote-ssh\\agent-workspaces\\abc')
  assert.equal(created[0].agentPreset, 'remote-standard')
  assert.equal(created[0].title, undefined)
  assert.equal(created[0].type, undefined)
  assert.equal(created[0].version, 4)
  assert.equal(created[0].isSeeded, false)
  assert.equal(created[0].delegationDepth, 0)
  assert.equal(created[0].createdAt, 1_700_000_000_000)
  assert.equal(created[0].events[0].data.agentPreset, 'remote-standard')
  assert.deepEqual(attached, [sessionId])
})
