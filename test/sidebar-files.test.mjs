import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script, createContext } from 'node:vm'
import { RemoteSshController } from '../lib/controller.js'
import { createRemoteFileSystem } from '../remote-fs.js'

function makeControllerWithServices(dir, services = {}, config = {}) {
  const ctx = {
    dshHomePath: (...parts) => join(dir, ...parts),
    get: (name) => services[name],
    provide() {},
    inject(deps, cb) {
      const scope = {}
      for (const dep of deps) {
        if (services[dep] === undefined) return
        scope[dep] = services[dep]
      }
      cb(scope)
    },
    logger: { info() {}, warn() {}, error() {} },
  }
  class TestController extends RemoteSshController {
    async checkSshAvailable() { return false }
  }
  return new TestController(ctx, config)
}

test('remote-fs listDir runs in 1 SSH call with find -H, resolves symlinks via %Y, and reports not-found/not-dir', async () => {
  const calls = []
  const fs = createRemoteFileSystem({ host: 'dev', remotePath: '/srv/app' }, async (_cfg, script) => {
    calls.push(script)
    if (script.startsWith('stat -c')) {
      if (script.includes(' -L ')) {
        return { code: 0, stdout: 'directory|4096|1700000000\n', stderr: '' }
      }
      return { code: 0, stdout: 'symbolic link|12|1700000000\n', stderr: '' }
    }
    if (script.includes('find -H ')) {
      if (script.includes('/srv/app/missing')) return { code: 0, stdout: '__DSH_FS_NOT_FOUND__\n', stderr: '' }
      if (script.includes('/srv/app/plain.txt')) return { code: 0, stdout: '__DSH_FS_NOT_DIR__\n', stderr: '' }
      return {
        code: 0,
        stdout: [
          'linked-dir|l|d|12|1700000001',
          'linked-file|l|f|42|1700000002',
          'broken-link|l|N|10|1700000003',
          'plain.txt|f|100|1700000004',
        ].join('\n') + '\n',
        stderr: '',
      }
    }
    return { code: 1, stdout: '', stderr: 'unexpected' }
  })

  const followed = await fs.stat({ targetKey: '/srv/app/linked-dir', displayPath: '/srv/app/linked-dir' })
  assert.equal(followed.type, 'directory')

  const unfollowed = await fs.lstat({ targetKey: '/srv/app/linked-dir', displayPath: '/srv/app/linked-dir' })
  assert.equal(unfollowed.type, 'symlink')

  calls.length = 0
  const entries = await fs.listDir({ targetKey: '/srv/app', displayPath: '/srv/app' })
  assert.equal(calls.length, 1, 'listDir must execute in a single SSH call')
  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry.type]))
  assert.deepEqual(byName, {
    'linked-dir': 'directory',
    'linked-file': 'file',
    'broken-link': 'symlink',
    'plain.txt': 'file',
  })

  await assert.rejects(
    () => fs.listDir({ targetKey: '/srv/app/missing', displayPath: '/srv/app/missing' }),
    (err) => err?.code === 'FS_NOT_FOUND',
  )
  await assert.rejects(
    () => fs.listDir({ targetKey: '/srv/app/plain.txt', displayPath: '/srv/app/plain.txt' }),
    (err) => err?.code === 'FS_NOT_DIRECTORY',
  )
})

test('remote-fs writeText combines write + stat into one SSH call without extra trailing stat', async () => {
  const scripts = []
  const fs = createRemoteFileSystem({ host: 'dev', remotePath: '/srv/app' }, async (_cfg, script) => {
    scripts.push(script)
    if (script.startsWith('stat -c')) {
      return { code: 1, stdout: '', stderr: 'No such file or directory' }
    }
    if (script.startsWith('mkdir -p') && script.includes('base64 -d >')) {
      return { code: 0, stdout: 'regular file|5|1700000123\n', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: 'unexpected' }
  })
  const res = await fs.writeText({ targetKey: '/srv/app/new.txt', displayPath: '/srv/app/new.txt' }, 'hello')
  assert.equal(res.operation, 'create')
  assert.equal(res.version, '1700000123:5')
  // Only 2 SSH calls total: initial stat + combined write-and-stat (no 3rd trailing stat).
  assert.equal(scripts.length, 2)
})

test('recordFileSurfaceCall skips local calls and setBoundedCache enforces capacity cap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-perf-host-'))
  const controller = makeControllerWithServices(dir)
  await controller.ready

  // Local workspace call (record = null) is ignored by default.
  controller.recordFileSurfaceCall('fs.stat', 'C:/local', 'C:/local/a.txt', null)
  assert.equal(controller.fileSurfaceCalls.length, 0)
  assert.equal(controller.fileSurfaceCallsTimer, null)

  // Remote call is recorded and debounced rather than writing immediately.
  controller.recordFileSurfaceCall('read', 'C:/handle', 'notes.txt', { path: 'C:/handle', remotePath: '/srv/app' })
  assert.equal(controller.fileSurfaceCalls.length, 1)
  assert.ok(controller.fileSurfaceCallsTimer !== null)

  // Bounded cache evicts oldest entries.
  const cache = new Map()
  for (let i = 0; i < 5; i += 1) controller.setBoundedCache(cache, `k${i}`, i, 3)
  assert.deepEqual([...cache.keys()], ['k2', 'k3', 'k4'])

  await controller.dispose()
  assert.equal(controller.fileSurfaceCallsTimer, null)
})

test('workspaceFiles.read uses 1-based offset, exact eof, early-quit sed, and RemoteError on binary/missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-sidebar-read-'))
  const workspaceFiles = {
    async read() { throw new Error('should not hit local read') },
    async stat() { throw new Error('should not hit local stat') },
    async list() { throw new Error('should not hit local list') },
    async readBytes() { throw new Error('should not hit local readBytes') },
    async search() { throw new Error('should not hit local search') },
    changes() { throw new Error('should not hit local changes') },
  }
  const fsStub = {
    resolve: async (p) => ({ targetKey: p, displayPath: p }),
    stat: async () => undefined,
  }
  const controller = makeControllerWithServices(dir, { workspaceFiles, fs: fsStub })
  await controller.ready

  const localHandle = join(dir, 'agent-workspaces', 'ws1')
  const record = {
    hostId: 'h1',
    target: 'dev-host',
    remotePath: '/srv/app',
    path: localHandle,
    mode: 'standard',
    preset: 'remote-standard',
  }
  controller.agentWorkspaces.set('ws1', record)

  const fileLines = ['line-1', 'line-2', 'line-3', 'line-4', 'line-5']
  const sedScripts = []
  const fakeFs = {
    async stat(target) {
      if (target.targetKey === '/srv/app/notes.txt') return { type: 'file', size: 35, version: '100:35' }
      if (target.targetKey === '/srv/app/bin.dat') return { type: 'file', size: 16, version: '100:16' }
      if (target.targetKey === '/srv/app') return { type: 'directory', size: 4096, version: '100:4096' }
      if (target.targetKey === '/srv/app/sub') return { type: 'directory', size: 4096, version: '100:4096' }
      return undefined
    },
    async listDir(target) {
      if (target.targetKey === '/srv/app') {
        return [{ name: 'sub', type: 'directory', size: 4096 }, { name: 'notes.txt', type: 'file', size: 35 }]
      }
      return [{ name: 'child.js', type: 'file', size: 10 }]
    },
  }
  controller.remoteFileSystemFor = () => fakeFs
  controller.runRemoteBuffer = async (_rec, script) => {
    sedScripts.push(script)
    if (script.includes('bin.dat')) {
      return { code: 0, stdout: Buffer.from([0x89, 0x50, 0x00, 0x47]), stderr: '', timedOut: false, truncated: false }
    }
    const match = /sed -n '(\d+),(\d+)p;(\d+)q'/.exec(script)
    assert.ok(match, `expected early-quit sed script, got: ${script}`)
    const start = Number(match[1])
    const end = Number(match[2])
    const slice = fileLines.slice(start - 1, end)
    const out = slice.length > 0 ? `${slice.join('\n')}\n` : ''
    return { code: 0, stdout: Buffer.from(out, 'utf8'), stderr: '', timedOut: false, truncated: false }
  }

  const scope = { sessionId: 's1', workspaceRoot: localHandle }

  // Page 1: 1-based offset=1, limit=2 must return line-1 & line-2 with eof=false.
  const page1 = await workspaceFiles.read(scope, 'notes.txt', { offset: 1, limit: 2 })
  assert.equal(page1.offset, 1)
  assert.equal(page1.text, 'line-1\nline-2')
  assert.equal(page1.lines, 2)
  assert.equal(page1.eof, false)

  // Page 2: offset=3, limit=2 -> line-3 & line-4, eof=false.
  const page2 = await workspaceFiles.read(scope, 'notes.txt', { offset: 3, limit: 2 })
  assert.equal(page2.offset, 3)
  assert.equal(page2.text, 'line-3\nline-4')
  assert.equal(page2.lines, 2)
  assert.equal(page2.eof, false)

  // Page 3: offset=5, limit=2 -> line-5, eof=true.
  const page3 = await workspaceFiles.read(scope, 'notes.txt', { offset: 5, limit: 2 })
  assert.equal(page3.offset, 5)
  assert.equal(page3.text, 'line-5')
  assert.equal(page3.lines, 1)
  assert.equal(page3.eof, true)

  // Binary file throws standard RemoteError workspace-file/not-text.
  await assert.rejects(
    () => workspaceFiles.read(scope, 'bin.dat', { offset: 1, limit: 10 }),
    (err) => err?.isDSHRemoteError === true && err?.code === 'workspace-file/not-text',
  )

  // Missing file throws standard RemoteError workspace-file/not-found.
  await assert.rejects(
    () => workspaceFiles.read(scope, 'missing.txt', { offset: 1, limit: 10 }),
    (err) => err?.isDSHRemoteError === true && err?.code === 'workspace-file/not-found',
  )

  // list returns workspace-relative path ("" for root, "sub" for subdir).
  const rootList = await workspaceFiles.list(scope, '')
  assert.equal(rootList.path, '')
  assert.deepEqual(rootList.entries.map((e) => `${e.name}:${e.type}`), ['notes.txt:file', 'sub:directory'])

  const subList = await workspaceFiles.list(scope, 'sub')
  assert.equal(subList.path, 'sub')

  // readAgentFile returns exact eof/hasMore and handles truncated buffer gracefully.
  const apiPage = await controller.readAgentFile({ workspaceId: 'ws1', path: 'notes.txt', offset: 0, limit: 5 })
  assert.equal(apiPage.lines, 5)
  assert.equal(apiPage.eof, true)
  assert.equal(apiPage.hasMore, false)

  await controller.dispose()
})

test('workspaceFiles.search queries remote workspace and sorts matches with inferred ancestor dirs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-sidebar-search-'))
  const workspaceFiles = {
    async read() {},
    async stat() {},
    async list() {},
    async readBytes() {},
    async search() { throw new Error('should not hit local search') },
    changes() {},
  }
  const controller = makeControllerWithServices(dir, { workspaceFiles, fs: {} })
  await controller.ready

  const localHandle = join(dir, 'agent-workspaces', 'ws-search')
  const record = {
    hostId: 'h1',
    target: 'dev-host',
    remotePath: '/srv/repo',
    path: localHandle,
    mode: 'standard',
    preset: 'remote-standard',
  }
  controller.agentWorkspaces.set('ws-search', record)
  controller.runRemoteBuffer = async (_rec, _script) => ({
    code: 0,
    stdout: Buffer.from([
      'f|f|./src/components/Button.tsx',
      'f|f|./src/components/deep/ButtonGroup.tsx',
      'f|f|./Button.md',
      'f|f|./dist/Button.js',
    ].join('\n') + '\n', 'utf8'),
    stderr: '',
    timedOut: false,
    truncated: false,
  })

  const scope = { sessionId: 's1', workspaceRoot: localHandle }
  const res = await workspaceFiles.search(scope, {
    query: 'button',
    excludedPaths: ['dist'],
    includeHidden: false,
    respectGitignore: true,
  })
  assert.equal(res.truncated, false)
  assert.equal(res.incomplete, false)
  assert.deepEqual(res.matches.map((m) => m.path), [
    'Button.md',
    'src/components/Button.tsx',
    'src/components/deep/ButtonGroup.tsx',
  ])

  // Blank query fails with gateway/bad-request RemoteError.
  await assert.rejects(
    () => workspaceFiles.search(scope, { query: '   ', excludedPaths: [], includeHidden: false, respectGitignore: true }),
    (err) => err?.isDSHRemoteError === true && err?.code === 'gateway/bad-request',
  )

  await controller.dispose()
})

test('workspaceFiles.changes coalesces multiple watched paths per host into one batched stat call', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-sidebar-watch-'))
  const workspaceFiles = {
    async read() {},
    async stat() {},
    async list() {},
    async readBytes() {},
    async search() {},
    changes() { throw new Error('should not hit local changes') },
  }
  const controller = makeControllerWithServices(dir, { workspaceFiles, fs: {} }, { watchIntervalMs: 50 })
  await controller.ready

  const localHandle = join(dir, 'agent-workspaces', 'ws-watch')
  const record = {
    hostId: 'h1',
    target: 'dev-host',
    remotePath: '/srv/repo',
    path: localHandle,
    mode: 'standard',
    preset: 'remote-standard',
  }
  controller.agentWorkspaces.set('ws-watch', record)

  let tick = 0
  const batchCalls = []
  controller.batchStatRemotePaths = async (_rec, paths) => {
    batchCalls.push([...paths])
    const map = new Map()
    for (const p of paths) {
      map.set(p, p.endsWith('/b') && tick >= 1 ? '200:4096:directory' : '100:4096:directory')
    }
    return map
  }

  const acA = new AbortController()
  const acB = new AbortController()
  const scope = { sessionId: 's1', workspaceRoot: localHandle }
  const iterA = workspaceFiles.changes(scope, 'a', acA.signal)[Symbol.asyncIterator]()
  const iterB = workspaceFiles.changes(scope, 'b', acB.signal)[Symbol.asyncIterator]()

  assert.deepEqual((await iterA.next()).value, { kind: 'ready' })
  assert.deepEqual((await iterB.next()).value, { kind: 'ready' })

  // Both paths share ONE host watcher entry in controller.remoteWatchers.
  assert.equal(controller.remoteWatchers.size, 1)
  const watcher = controller.remoteWatchers.get('dev-host')
  assert.equal(watcher.paths.size, 2)

  // Advance version on /srv/repo/b and wait for one coalesced poll tick.
  tick = 1
  const keepAlive = setTimeout(() => {}, 2000)
  let nextB
  try {
    nextB = await iterB.next()
  } finally {
    clearTimeout(keepAlive)
  }
  assert.equal(nextB.value.kind, 'change')
  assert.equal(nextB.value.change.absolutePath, '/srv/repo/b')
  assert.equal(nextB.value.change.version, '200:4096:directory')
  // Confirm a single batch call polled BOTH paths together.
  assert.ok(batchCalls.some((paths) => paths.includes('/srv/repo/a') && paths.includes('/srv/repo/b')))

  acA.abort()
  acB.abort()
  await iterA.return?.()
  await iterB.return?.()
  assert.equal(controller.remoteWatchers.size, 0)

  await controller.dispose()
})

test('client.js routes workspaceFiles (list/read/readBytes) by sessionId with lazy 1-level listing and 1-based offsets', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  let loadedModule = null
  const apiCalls = []
  const statCalls = []
  const listCalls = []
  const downloadCalls = []

  const fetchMock = async (url, init) => {
    const body = JSON.parse(init.body)
    if (url === '/api/remote-ssh/agentWorkspaces') {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            workspaces: [
              { workspaceId: 'ws-host-a', target: 'host-a', remotePath: '/root/data', path: 'C:\\Users\\t\\.dsh\\remote-ssh\\agent-workspaces\\aaaa' },
              { workspaceId: 'ws-host-b', target: 'host-b', remotePath: '/root/data', path: 'C:\\Users\\t\\.dsh\\remote-ssh\\agent-workspaces\\bbbb' },
            ],
          }
        },
      }
    }
    if (url === '/api/remote-ssh/filesStat') {
      statCalls.push(body)
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, path: body.path, type: 'file', size: 1024, version: '100:1024' }
        },
      }
    }
    if (url === '/api/remote-ssh/filesList') {
      listCalls.push(body)
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            workspaceId: body.workspaceId,
            remotePath: '/root/data',
            path: body.path,
            entries: body.path === '/root/data'
              ? [{ name: 'src', path: '/root/data/src', type: 'directory', size: 4096 }, { name: 'README.md', path: '/root/data/README.md', type: 'file', size: 120 }]
              : [{ name: 'index.js', path: '/root/data/src/index.js', type: 'file', size: 42 }],
            truncated: false,
          }
        },
      }
    }
    if (url === '/api/remote-ssh/filesRead') {
      apiCalls.push(body)
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            path: body.path,
            version: '10:50',
            size: 50,
            offset: body.offset,
            text: 'line1\nline2',
            lines: 2,
            eof: false,
            hasMore: true,
            binary: false,
            truncated: false,
          }
        },
      }
    }
    if (url === '/api/remote-ssh/filesDownload') {
      downloadCalls.push(body)
      const bytes = new Uint8Array([1, 2, 3, 4])
      return {
        ok: true,
        status: 200,
        headers: { get: (k) => (k === 'x-remote-file-size' ? '4' : null) },
        async blob() {
          return { size: bytes.length, async arrayBuffer() { return bytes.buffer } }
        },
      }
    }
    throw new Error(`unexpected fetch: ${url}`)
  }

  const sandbox = {
    console,
    fetch: fetchMock,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    Uint8Array,
    Response,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    window: {
      __ModuleLoader__: { load(def) { loadedModule = def } },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
    },
    document: {
      createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
      head: { appendChild() {} },
      body: null,
    },
  }
  new Script(source, { filename: 'client.js' }).runInContext(createContext(sandbox))
  const plugin = loadedModule.factory((id) => {
    if (id === 'react') {
      return {
        default: { createElement: () => null, Fragment: Symbol('Fragment') },
        useCallback: (fn) => fn,
        useEffect() {},
        useMemo: (fn) => fn(),
        useRef: (v) => ({ current: v }),
        useState: (v) => [v, () => {}],
      }
    }
    return {}
  })

  const workspaceFilesRemote = {
    async list() { return { ok: false, error: { code: 'local-fallback' } } },
    async read() { return { ok: false, error: { code: 'local-fallback' } } },
    async readBytes() { return { ok: false, error: { code: 'local-fallback' } } },
    async stat() { return { ok: false, error: { code: 'local-fallback' } } },
  }
  const originalMatch = () => null
  const betterSidebar = { matchFileViewer: originalMatch }
  const clientServices = {
    remote: { workspaceFiles: workspaceFilesRemote },
    betterSidebar,
    sessions: {
      list: {
        getSnapshot: () => ({
          byId: {
            'sess-b': {
              id: 'sess-b',
              workspaceId: 'ws-host-b',
              cwd: 'C:\\Users\\t\\.dsh\\remote-ssh\\agent-workspaces\\bbbb',
            },
          },
        }),
        subscribe: () => () => {},
      },
    },
    workspaces: {
      list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} },
    },
  }
  const effects = []
  const clientCtx = {
    slots: { register: () => () => {}, inject: () => () => {}, subscribe: () => () => {} },
    locale: { register: () => () => {}, bind: () => (k) => k },
    layout: {},
    uiWorkspace: {},
    get: (name) => clientServices[name],
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') effects.push(cleanup)
      return cleanup
    },
  }

  plugin.apply(clientCtx)

  // Lazy 1-level listing: root ("") lists only top level; expanding "src" lists only "src".
  const rootList = await workspaceFilesRemote.list('sess-b', '')
  assert.equal(rootList.ok, true)
  assert.equal(rootList.value.path, '')
  assert.deepEqual(rootList.value.entries.map((e) => `${e.name}:${e.type}`), ['src:directory', 'README.md:file'])
  assert.equal(listCalls[0].workspaceId, 'ws-host-b')
  assert.equal(listCalls[0].path, '/root/data')

  const subList = await workspaceFilesRemote.list('sess-b', 'src')
  assert.equal(subList.ok, true)
  assert.equal(subList.value.path, 'src')
  assert.deepEqual(subList.value.entries.map((e) => e.name), ['index.js'])
  assert.equal(listCalls[1].workspaceId, 'ws-host-b')
  assert.equal(listCalls[1].path, '/root/data/src')

  // Session B opens /root/data/app.js (shared remotePath with host-a!) with 1-based offset=1.
  const readRes = await workspaceFilesRemote.read('sess-b', '/root/data/app.js', { offset: 1, limit: 100 })
  assert.equal(readRes.ok, true)
  assert.equal(readRes.value.offset, 1)
  assert.equal(readRes.value.eof, false)
  assert.equal(apiCalls[0].workspaceId, 'ws-host-b')
  assert.equal(apiCalls[0].offset, 0)

  // Session B opens a relative path -> resolves against ws-host-b's /root/data.
  const relRes = await workspaceFilesRemote.read('sess-b', 'src/index.js', { offset: 3, limit: 50 })
  assert.equal(relRes.ok, true)
  assert.equal(apiCalls[1].workspaceId, 'ws-host-b')
  assert.equal(apiCalls[1].path, '/root/data/src/index.js')
  assert.equal(apiCalls[1].offset, 2)

  // readBytes with baseFile, ../, and explicit byte range forwards offset/length to filesDownload.
  const bytesRes = await workspaceFilesRemote.readBytes('sess-b', '../assets/logo.png', {
    baseFile: '/root/data/docs/guide.md',
    range: { offset: 2, length: 2 },
  })
  assert.equal(bytesRes.ok, true)
  assert.equal(downloadCalls[0].workspaceId, 'ws-host-b')
  assert.equal(downloadCalls[0].path, '/root/data/assets/logo.png')
  assert.equal(downloadCalls[0].offset, 2)
  assert.equal(downloadCalls[0].length, 2)

  // stat calls lightweight filesStat rather than filesRead.
  const statRes = await workspaceFilesRemote.stat('sess-b', 'src/index.js')
  assert.equal(statRes.ok, true)
  assert.equal(statRes.value.bytes, 1024)
  assert.equal(statCalls.length, 1)
  assert.equal(statCalls[0].path, '/root/data/src/index.js')

  // dsh-better-sidebar's own listing API (/sidebar/api/fs.tree|fs.trees) reads
  // the local disk. For a remote workspace it must be bridged onto filesList,
  // otherwise its tree renders the stale local handle directory.
  const rootLocal = 'C:\\Users\\t\\.dsh\\remote-ssh\\agent-workspaces\\bbbb'
  const treeResponse = await sandbox.fetch('/sidebar/api/fs.tree', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sess-b', cwd: rootLocal, path: rootLocal }),
  })
  const treeEnvelope = await treeResponse.json()
  assert.equal(treeEnvelope.ok, true)
  assert.deepEqual(
    treeEnvelope.value.entries.map((entry) => `${entry.name}:${entry.isDir}`),
    ['src:true', 'README.md:false'],
  )
  assert.equal(treeEnvelope.value.entries[0].path, `${rootLocal}\\src`)
  assert.equal(listCalls.at(-1).path, '/root/data')

  const batchResponse = await sandbox.fetch('/sidebar/api/fs.trees', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sess-b', cwd: rootLocal, paths: [rootLocal, `${rootLocal}\\src`] }),
  })
  const batchEnvelope = await batchResponse.json()
  assert.equal(batchEnvelope.ok, true)
  assert.deepEqual(batchEnvelope.value.levels.map((level) => level.path), [rootLocal, `${rootLocal}\\src`])
  assert.deepEqual(batchEnvelope.value.levels[1].entries.map((entry) => entry.name), ['index.js'])

  // A path outside every remote workspace keeps the untouched host route.
  await assert.rejects(
    sandbox.fetch('/sidebar/api/fs.tree', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'C:\\local\\workspace' }),
    }),
    /unexpected fetch/,
  )

  // betterSidebar.matchFileViewer is patched while active and restored on cleanup.
  assert.notEqual(betterSidebar.matchFileViewer, originalMatch)
  for (const cleanup of effects) cleanup()
  assert.equal(betterSidebar.matchFileViewer, originalMatch)
  assert.equal(sandbox.fetch, fetchMock)
})
