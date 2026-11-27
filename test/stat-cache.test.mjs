import assert from 'node:assert/strict'
import test from 'node:test'
import { RemoteSshController } from '../lib/controller.js'

function makeController(options = {}) {
  const controller = Object.create(RemoteSshController.prototype)
  controller.config = { statCacheMs: 5000, instructionCacheMs: 30000, ...options.config }
  controller.remoteStatCache = new Map()
  controller.calls = { batch: 0, stat: 0 }
  controller.batchStatRemotePaths = async (_record, paths) => {
    controller.calls.batch += 1
    const versions = new Map()
    for (const path of paths) {
      versions.set(path, path.endsWith('/AGENTS.md') ? '100:2:regular file' : path.endsWith('/.git') ? '100:0:directory' : null)
    }
    return versions
  }
  controller.remoteFileSystemFor = () => ({
    async stat() {
      controller.calls.stat += 1
      return { version: '200:5:regular file', type: 'file', size: 5 }
    },
  })
  return controller
}

const record = { target: 'host-a', remotePath: '/ws' }

test('instruction probes are batched into one stat round trip and cached', async () => {
  const controller = makeController()

  const agents = await controller.remoteStat(record, '/ws/AGENTS.md')
  assert.equal(controller.calls.batch, 1)
  assert.equal(controller.calls.stat, 0, 'the batch answers the probe, no direct stat')
  assert.deepEqual(agents, { version: '100:2:regular file', type: 'file', size: 2 })

  // Sibling probes of the same directory come from the same batch.
  assert.equal(await controller.remoteStat(record, '/ws/CLAUDE.md'), null)
  assert.equal((await controller.remoteStat(record, '/ws/.git')).type, 'directory')
  assert.equal(controller.calls.batch, 1)
  assert.equal(controller.calls.stat, 0)

  // A later step repeats the same probes: still no SSH.
  await controller.remoteStat(record, '/ws/AGENTS.md')
  assert.equal(controller.calls.batch, 1)
})

test('plain paths use a short TTL cache and writes invalidate it', async () => {
  const controller = makeController()

  const first = await controller.remoteStat(record, '/ws/data.txt')
  assert.equal(first.size, 5)
  assert.equal(controller.calls.stat, 1)

  const second = await controller.remoteStat(record, '/ws/data.txt')
  assert.equal(second.size, 5)
  assert.equal(controller.calls.stat, 1, 'served from the short TTL cache')

  controller.invalidateRemoteStat(record, '/ws/data.txt')
  await controller.remoteStat(record, '/ws/data.txt')
  assert.equal(controller.calls.stat, 2, 'an edit invalidates the cached version')
})

test('a failed batch falls back to a direct stat', async () => {
  const controller = makeController()
  controller.batchStatRemotePaths = async () => {
    controller.calls.batch += 1
    const versions = new Map()
    return versions
  }
  const info = await controller.remoteStat(record, '/ws/AGENTS.md')
  assert.equal(info.size, 5)
  assert.equal(controller.calls.batch, 1)
  assert.equal(controller.calls.stat, 1)
})

test('statCacheMs=0 disables the cache for change-detection callers', async () => {
  const controller = makeController({ config: { statCacheMs: 0, instructionCacheMs: 0 } })
  await controller.remoteStat(record, '/ws/data.txt')
  await controller.remoteStat(record, '/ws/data.txt')
  assert.equal(controller.calls.stat, 2)
  assert.equal(controller.calls.batch, 0)
})
