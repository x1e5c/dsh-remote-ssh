import assert from 'node:assert/strict'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { RemoteSshController } from '../lib/controller.js'

function controller() {
  const instance = Object.create(RemoteSshController.prototype)
  instance.dir = tmpdir()
  instance.workspaceChangesBridge = null
  instance.remoteChangeRecords = new Map()
  instance.remoteSessionEvents = new Map()
  instance.info = () => {}
  instance.remoteChangesSummarySync = () => ({ turn: 3, files: [{ path: '/remote/a.txt', display: 'a.txt' }] })
  instance.remoteChangesDiff = async () => ({ kind: 'text', path: '/remote/a.txt', display: 'a.txt', before: true, after: true, coarse: true, hunks: [] })
  return instance
}

test('workspaceChanges falls back for imported remote summaries and diffs', async () => {
  const instance = controller()
  const service = {
    summary: () => undefined,
    diff: () => Promise.resolve(undefined),
  }
  instance.applyWorkspaceChangesBridge(service)
  const summary = await service.summary('session-1', 12)
  assert.equal(summary.turn, 3)
  assert.equal(summary.files[0].path, '/remote/a.txt')
  const diff = await service.diff('session-1', 12, 0)
  assert.equal(diff.kind, 'text')
  assert.equal(diff.coarse, true)
  instance.uninstallWorkspaceChangesBridge()
  assert.equal(await service.summary('session-1', 12), undefined)
})

test('workspaceChanges keeps native local results', async () => {
  const instance = controller()
  const native = { turn: 1, files: [] }
  const service = {
    summary: () => native,
    diff: () => Promise.resolve({ kind: 'binary', path: 'x' }),
  }
  instance.applyWorkspaceChangesBridge(service)
  assert.deepEqual(await service.summary('session-2', 4), native)
  assert.equal((await service.diff('session-2', 4, 0)).kind, 'binary')
  instance.uninstallWorkspaceChangesBridge()
})
