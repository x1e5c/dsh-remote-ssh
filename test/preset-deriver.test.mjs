import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PRESET_PLUGIN_NAME,
  RemotePresetDeriver,
  deriveRemotePreset,
  isJsExpr,
} from '../lib/preset-deriver.js'
import { RemoteSshController } from '../lib/controller.js'

const TEST_MODULES = {
  remoteFs: 'dsh-remote-ssh/remote-fs',
  remoteShell: 'dsh-remote-ssh/remote-shell',
  remoteFsApproval: 'dsh-remote-ssh/remote-fs-approval',
  remoteContext: 'dsh-remote-ssh/remote-context',
  remoteToolRestrict: 'dsh-remote-ssh/remote-tool-restrict',
}

function makeStandardSource() {
  return {
    id: 'standard',
    order: 1,
    plugins: [
      {
        id: 'persona',
        name: '@deepseek-ai/dsh-persona',
        config: { prefix: 'You are a coding agent powered by the {{model}} model.' },
      },
      {
        id: 'agent-instructions',
        name: '@deepseek-ai/dsh-agent-instructions',
        config: { maxBytes: 65536 },
      },
      { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
      {
        id: 'tool-bash',
        name: '@deepseek-ai/dsh-tool-bash',
        disabled: { __jsExpr: "process.platform === 'win32'" },
      },
      {
        id: 'tool-pwsh',
        name: '@deepseek-ai/dsh-tool-pwsh',
        disabled: { __jsExpr: "process.platform !== 'win32'" },
      },
      {
        id: 'tool-fs',
        name: '@deepseek-ai/dsh-tool-fs',
        config: { applyPatch: false },
      },
      {
        id: 'tool-fs-search',
        name: '@deepseek-ai/dsh-tool-fs-search',
        config: { sampleOverCapGlobResults: false },
      },
      { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
      {
        id: 'skill-filesystem',
        name: '@deepseek-ai/dsh-skill-filesystem',
        config: {
          customSkillDirs: [{ __jsExpr: "resolve('@deepseek-ai/dsh-agent-preset/package.json')" }],
        },
      },
      { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
      { id: 'tool-office', name: '@deepseek-ai/dsh-tool-office' },
      {
        id: 'tool-plugin-manager',
        name: '@deepseek-ai/dsh-plugin-manager/tools',
        disabled: { __jsExpr: "!ctx.get('profileContext')" },
      },
      {
        id: 'tool-plugin-market',
        name: '@deepseek-ai/dsh-plugin-market/tools',
        disabled: true,
      },
      {
        id: 'future-upstream-tool',
        name: '@deepseek-ai/dsh-future-tool',
        config: { mode: 'v2' },
      },
    ],
  }
}

function makeMinimalSource() {
  return {
    id: 'minimal',
    order: 3,
    plugins: [
      {
        id: 'persona',
        name: '@deepseek-ai/dsh-persona',
        config: {
          prefix: 'You are a helpful software engineer assistant.',
          complete: true,
          includeRuntimeContext: false,
        },
      },
      {
        id: 'tool-fs',
        name: '@deepseek-ai/dsh-tool-fs',
        config: { read: false, readImage: true, write: false, edit: false },
      },
      {
        id: 'compaction',
        name: 'cordis:group',
        group: true,
        isolate: { compaction: true },
        config: [
          { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
        ],
      },
      {
        id: 'persistent-shell',
        name: 'cordis:group',
        group: true,
        isolate: { terminals: true },
        config: [
          { id: 'pty', name: '@deepseek-ai/dsh-terminal' },
          { id: 'terminal-bash', name: '@deepseek-ai/dsh-terminal-bash' },
          { id: 'persistent-bash', name: '@deepseek-ai/dsh-tool-bash-persistent' },
          { id: 'terminal-pwsh', name: '@deepseek-ai/dsh-terminal-bash', config: { shellDialect: 'pwsh' } },
          { id: 'persistent-pwsh', name: '@deepseek-ai/dsh-tool-pwsh-persistent' },
        ],
      },
    ],
  }
}

function createFakeRegistry() {
  const definitions = new Map()
  const history = []
  class FakeRegistry {
    constructor(ctx) {
      this.ctx = ctx
    }
    async register(definition) {
      if (definitions.has(definition.id)) {
        throw new Error(`Duplicate agent preset: ${definition.id}`)
      }
      const record = { definition, baseUrl: this.ctx?.baseUrl ?? null }
      definitions.set(definition.id, record)
      history.push({ op: 'register', id: definition.id, baseUrl: record.baseUrl })
      let disposed = false
      return async () => {
        if (disposed) return
        disposed = true
        if (definitions.get(definition.id) === record) definitions.delete(definition.id)
        history.push({ op: 'unregister', id: definition.id })
      }
    }
    async resolve(id) {
      if (!definitions.has(id)) throw new Error(`Unknown agent preset: ${id}`)
      return { id }
    }
    async list() {
      return [...definitions.values()].map(({ definition }) => ({
        id: definition.id,
        name: definition.name,
        order: definition.order,
      }))
    }
    async select(agent, id) {
      if (!definitions.has(id)) throw new Error(`Unknown agent preset: ${id}`)
      history.push({ op: 'select', agentId: agent?.id ?? null, id })
      return id
    }
    async remoteExportList() {
      return { presets: await this.list() }
    }
  }
  const instance = new FakeRegistry({ baseUrl: 'file:///host/root.yml' })
  return { registry: instance, definitions, history }
}

function createFakeContext(services = {}) {
  const listeners = new Map()
  const baseCtx = {
    baseUrl: 'file:///profile/dsh-remote-ssh/index.js',
    get(name) { return services[name] },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
      return () => { listeners.get(event)?.delete(handler) }
    },
    emit(event, ...args) {
      for (const handler of listeners.get(event) ?? []) handler(...args)
    },
    extend(props) {
      const child = {
        ...baseCtx,
        ...props,
        get(name) {
          const svc = services[name]
          if (name === 'agentPresets' && svc) {
            return Object.assign(Object.create(svc), { ctx: child })
          }
          return svc
        },
      }
      return child
    },
    logger: { info() {}, warn() {}, error() {} },
  }
  return { ctx: baseCtx, listeners }
}

test('deriveRemotePreset transforms standard preset while preserving upstream additions and JsExpr', () => {
  const source = makeStandardSource()
  const derived = deriveRemotePreset(source, { modules: TEST_MODULES })

  assert.equal(derived.id, 'remote-standard')
  assert.equal(derived.name, 'Remote Standard')
  assert.equal(derived.order, 61)

  // Source object is never mutated.
  assert.equal(source.plugins[0].config.prefix, 'You are a coding agent powered by the {{model}} model.')
  assert.ok(isJsExpr(source.plugins[3].disabled))

  const persona = derived.plugins.find((row) => row.name === '@deepseek-ai/dsh-persona')
  assert.match(persona.config.prefix, /\{\{model\}\}/)
  assert.match(persona.config.prefix, /remote SSH workspace/i)

  // remote-context and remote-tool-restrict are injected right after persona.
  assert.equal(derived.plugins[1].id, 'remote-context')
  assert.equal(derived.plugins[2].id, 'remote-tool-restrict')

  // Windows-only pwsh tool is dropped.
  assert.equal(derived.plugins.some((row) => row.name === '@deepseek-ai/dsh-tool-pwsh'), false)

  // Isolated remote-fs-realm wraps fs/shell providers and consumers.
  const realm = derived.plugins.find((row) => row.id === 'remote-fs-realm')
  assert.ok(realm)
  assert.equal(realm.group, true)
  assert.deepEqual(realm.isolate, { fs: true, shell: true })
  const realmNames = realm.config.map((row) => row.name)
  assert.deepEqual(realmNames.slice(0, 2), [TEST_MODULES.remoteFs, TEST_MODULES.remoteShell])
  assert.ok(realmNames.includes(TEST_MODULES.remoteFsApproval))
  assert.ok(realmNames.includes('@deepseek-ai/dsh-tool-bash'))
  assert.ok(realmNames.includes('@deepseek-ai/dsh-tool-fs'))
  assert.ok(realmNames.includes('@deepseek-ai/dsh-tool-fs-search'))
  assert.ok(realmNames.includes('@deepseek-ai/dsh-tool-jobs'))
  assert.ok(realmNames.includes('@deepseek-ai/dsh-tool-present'))

  // tool-bash has its Win32 disabled expression cleared so it works on Windows hosts.
  const bashRow = realm.config.find((row) => row.name === '@deepseek-ai/dsh-tool-bash')
  assert.equal('disabled' in bashRow, false)

  // Host-only tools are forced disabled.
  for (const name of [
    '@deepseek-ai/dsh-tool-office',
    '@deepseek-ai/dsh-plugin-manager/tools',
    '@deepseek-ai/dsh-plugin-market/tools',
  ]) {
    const row = derived.plugins.find((entry) => entry.name === name)
    assert.equal(row?.disabled, true, `${name} should be disabled`)
  }

  // !!js expressions in other plugins survive untouched.
  const skills = derived.plugins.find((row) => row.name === '@deepseek-ai/dsh-skill-filesystem')
  assert.ok(isJsExpr(skills.config.customSkillDirs[0]))

  // Unknown future upstream plugins pass through intact.
  const future = derived.plugins.find((row) => row.name === '@deepseek-ai/dsh-future-tool')
  assert.deepEqual(future, { id: 'future-upstream-tool', name: '@deepseek-ai/dsh-future-tool', config: { mode: 'v2' } })
})

test('deriveRemotePreset adapts minimal persistent-shell group to remote tool-bash', () => {
  const derived = deriveRemotePreset(makeMinimalSource(), { modules: TEST_MODULES })
  assert.equal(derived.id, 'remote-minimal')
  assert.equal(derived.name, 'Remote Minimal')
  assert.equal(derived.order, 63)

  const persona = derived.plugins.find((row) => row.name === '@deepseek-ai/dsh-persona')
  assert.equal(persona.config.complete, true)
  assert.equal(persona.config.includeRuntimeContext, false)

  assert.equal(derived.plugins.some((row) => row.id === 'persistent-shell'), false)
  const realm = derived.plugins.find((row) => row.id === 'remote-fs-realm')
  assert.ok(realm)
  const fsRow = realm.config.find((row) => row.name === '@deepseek-ai/dsh-tool-fs')
  assert.deepEqual(fsRow.config, { read: false, readImage: true, write: false, edit: false })
  const bashRow = realm.config.find((row) => row.name === '@deepseek-ai/dsh-tool-bash')
  assert.ok(bashRow)
  assert.ok(realm.config.some((row) => row.name === TEST_MODULES.remoteFsApproval))
})

test('RemotePresetDeriver derives from loader entries, inherits baseUrl, skips excluded/static, and follows updates', async () => {
  const { registry, definitions, history } = createFakeRegistry()
  const standardConfig = makeStandardSource()
  const entries = [
    {
      options: { id: 'preset-standard', name: PRESET_PLUGIN_NAME, config: standardConfig },
      disabled: false,
      ctx: { baseUrl: 'file:///dsh/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml' },
    },
    {
      options: { id: 'preset-minimal', name: PRESET_PLUGIN_NAME, config: makeMinimalSource() },
      disabled: false,
      ctx: { baseUrl: 'file:///dsh/node_modules/@deepseek-ai/dsh-web-app/presets/minimal.patch.yml' },
    },
    {
      options: { id: 'preset-cordis', name: PRESET_PLUGIN_NAME, config: { id: 'cordis', order: 4, plugins: [] } },
      disabled: false,
      ctx: { baseUrl: 'file:///dsh/node_modules/@deepseek-ai/dsh-web-app/presets/cordis.patch.yml' },
    },
    {
      // Simulate a user static override for remote-minimal.
      options: { id: 'preset-remote-minimal', name: PRESET_PLUGIN_NAME, config: { id: 'remote-minimal', plugins: [] } },
      disabled: false,
      ctx: { baseUrl: 'file:///profile/custom.yml' },
    },
  ]
  const loader = { entries: () => entries }
  const { ctx } = createFakeContext({ agentPresets: registry, loader })
  const deriver = new RemotePresetDeriver(ctx, { modules: TEST_MODULES, debounceMs: 0 })

  await deriver.start()
  assert.deepEqual(deriver.listDerivedIds(), ['remote-standard'])
  assert.equal(definitions.has('remote-cordis'), false)
  assert.equal(definitions.has('remote-minimal'), false)
  assert.equal(
    definitions.get('remote-standard').baseUrl,
    'file:///dsh/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml',
  )

  // Re-sync with unchanged source is a no-op.
  const countBefore = history.length
  await deriver.sync()
  assert.equal(history.length, countBefore)

  // Upstream adds a new tool to standard and triggers config-reload.
  standardConfig.plugins.push({ id: 'brand-new', name: '@deepseek-ai/dsh-brand-new' })
  ctx.emit('app-boot/config-reload')
  await deriver.ensureSynced()
  const updated = definitions.get('remote-standard').definition
  assert.ok(updated.plugins.some((row) => row.name === '@deepseek-ai/dsh-brand-new'))
  assert.deepEqual(
    history.slice(-2).map((item) => `${item.op}:${item.id}`),
    ['unregister:remote-standard', 'register:remote-standard'],
  )

  // Disabling the source entry removes the derived preset.
  entries[0].disabled = true
  await deriver.sync()
  assert.equal(definitions.has('remote-standard'), false)

  await deriver.dispose()
})

test('RemotePresetDeriver observes programmatic agentPresets.register and cleans up on dispose', async () => {
  const { registry, definitions } = createFakeRegistry()
  const { ctx } = createFakeContext({ agentPresets: registry })
  const deriver = new RemotePresetDeriver(ctx, { modules: TEST_MODULES, debounceMs: 0 })
  await deriver.start()

  const unregisterSource = await registry.register({
    id: 'custom-review',
    name: 'Reviewer',
    order: 10,
    plugins: [{ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' }],
  })
  await deriver.ensureSynced()
  assert.equal(definitions.has('remote-custom-review'), true)
  assert.equal(definitions.get('remote-custom-review').definition.name, 'Remote Reviewer')

  await unregisterSource()
  await deriver.ensureSynced()
  assert.equal(definitions.has('remote-custom-review'), false)

  await deriver.dispose()
})

test('RemoteSshController wires dynamic derivation with agentPresets compatibility and clean teardown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-deriver-ctrl-'))
  const { registry, definitions } = createFakeRegistry()
  const loader = {
    entries: () => [
      {
        options: { id: 'preset-standard', name: PRESET_PLUGIN_NAME, config: makeStandardSource() },
        disabled: false,
        ctx: { baseUrl: 'file:///dsh/presets/standard.patch.yml' },
      },
    ],
  }
  const services = { agentPresets: registry, loader }
  const { ctx } = createFakeContext(services)
  ctx.dshHomePath = (...parts) => join(dir, ...parts)
  ctx.provide = () => {}
  ctx.inject = (deps, cb) => {
    const scope = {}
    for (const dep of deps) {
      if (services[dep] === undefined) return
      scope[dep] = services[dep]
    }
    cb(scope)
  }

  class TestController extends RemoteSshController {
    async checkSshAvailable() { return false }
  }

  const controller = new TestController(ctx, {})
  await controller.ready

  // Calling resolve/list immediately awaits derivation without racing.
  const resolved = await registry.resolve('remote-standard')
  assert.equal(resolved.id, 'remote-standard')

  const listed = await registry.list()
  assert.ok(listed.some((item) => item.id === 'remote-standard'))

  // Legacy remote-agent-fs still resolves to standard once registered.
  await registry.register({ id: 'standard', plugins: [] })
  const legacyResolved = await registry.resolve('remote-agent-fs')
  assert.equal(legacyResolved.id, 'standard')

  await controller.dispose()
  assert.equal(definitions.has('remote-standard'), false)
})

test('agentPresets.select enforces workspace type: maps local->remote when available and rejects incompatible picks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-select-guard-'))
  const { registry, history } = createFakeRegistry()
  const ptcSource = { ...makeStandardSource(), id: 'ptc', order: 2 }
  const cordisSource = { id: 'cordis', order: 4, plugins: [] }
  await registry.register(makeStandardSource())
  await registry.register(ptcSource)
  await registry.register(cordisSource)

  const loader = {
    entries: () => [
      {
        options: { id: 'preset-standard', name: PRESET_PLUGIN_NAME, config: makeStandardSource() },
        disabled: false,
        ctx: { baseUrl: 'file:///dsh/presets/standard.patch.yml' },
      },
      {
        options: { id: 'preset-ptc', name: PRESET_PLUGIN_NAME, config: ptcSource },
        disabled: false,
        ctx: { baseUrl: 'file:///dsh/presets/ptc.patch.yml' },
      },
      {
        options: { id: 'preset-cordis', name: PRESET_PLUGIN_NAME, config: cordisSource },
        disabled: false,
        ctx: { baseUrl: 'file:///dsh/presets/cordis.patch.yml' },
      },
    ],
  }
  const services = { agentPresets: registry, loader }
  const { ctx } = createFakeContext(services)
  ctx.dshHomePath = (...parts) => join(dir, ...parts)
  ctx.provide = () => {}
  ctx.inject = (deps, cb) => {
    const scope = {}
    for (const dep of deps) {
      if (services[dep] === undefined) return
      scope[dep] = services[dep]
    }
    cb(scope)
  }

  class TestController extends RemoteSshController {
    async checkSshAvailable() { return false }
  }

  const controller = new TestController(ctx, {})
  await controller.ready

  const remoteHandle = 'C:/Users/tester/.dsh/remote-ssh/agent-workspaces/ws123456'
  controller.agentWorkspaces.set('ws-remote', {
    hostId: 'h',
    target: 'dev-box',
    remotePath: '/srv/app',
    path: remoteHandle,
    mode: 'standard',
    preset: 'remote-standard',
  })

  const remoteAgent = { id: 'sess-remote', session: { id: 'sess-remote', header: { cwd: remoteHandle } } }
  const localAgent = { id: 'sess-local', session: { id: 'sess-local', header: { cwd: 'C:/Users/tester/local-project' } } }

  // Remote workspace: remote preset passes through directly.
  assert.equal(await registry.select(remoteAgent, 'remote-ptc'), 'remote-ptc')

  // Remote workspace: local preset with a derived remote counterpart auto-maps to remote-<id>.
  assert.equal(await registry.select(remoteAgent, 'ptc'), 'remote-ptc')
  assert.equal(await registry.select(remoteAgent, 'standard'), 'remote-standard')

  // Remote workspace: local preset without a remote counterpart (e.g. cordis) is rejected with RemoteError shape.
  await assert.rejects(
    () => registry.select(remoteAgent, 'cordis'),
    (error) => error?.isDSHRemoteError === true
      && error?.code === 'agent-preset/invalid'
      && /remote SSH workspace/i.test(error?.details?.reason ?? ''),
  )

  // Local workspace: local presets pass through.
  assert.equal(await registry.select(localAgent, 'ptc'), 'ptc')
  assert.equal(await registry.select(localAgent, 'cordis'), 'cordis')

  // Local workspace: remote presets are rejected with RemoteError shape.
  await assert.rejects(
    () => registry.select(localAgent, 'remote-standard'),
    (error) => error?.isDSHRemoteError === true
      && error?.code === 'agent-preset/invalid'
      && /only be used in a remote SSH workspace/i.test(error?.details?.reason ?? ''),
  )

  // Confirm no invalid select reached the underlying registry.
  const selectedIds = history.filter((item) => item.op === 'select').map((item) => `${item.agentId}:${item.id}`)
  assert.deepEqual(selectedIds, [
    'sess-remote:remote-ptc',
    'sess-remote:remote-ptc',
    'sess-remote:remote-standard',
    'sess-local:ptc',
    'sess-local:cordis',
  ])

  await controller.dispose()
})

test('sessionController.create maps/preserves remote presets and local initiator never falls back to open remote session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-create-guard-'))
  const { registry } = createFakeRegistry()
  const ptcSource = { ...makeStandardSource(), id: 'ptc', order: 2 }
  const loader = {
    entries: () => [
      {
        options: { id: 'preset-standard', name: PRESET_PLUGIN_NAME, config: makeStandardSource() },
        disabled: false,
        ctx: { baseUrl: 'file:///dsh/presets/standard.patch.yml' },
      },
      {
        options: { id: 'preset-ptc', name: PRESET_PLUGIN_NAME, config: ptcSource },
        disabled: false,
        ctx: { baseUrl: 'file:///dsh/presets/ptc.patch.yml' },
      },
    ],
  }
  const createdRequests = []
  const sessionController = {
    async prompt() {},
    async create(request) {
      createdRequests.push(request)
      return { sessionId: `s-${createdRequests.length}` }
    },
  }
  const remoteHandle = 'C:/Users/tester/.dsh/remote-ssh/agent-workspaces/ws999999'
  const localCwd = 'C:/Users/tester/local-only'
  const localInitiator = { id: 'sess-local', session: { id: 'sess-local', header: { cwd: localCwd } } }
  const services = {
    agentPresets: registry,
    loader,
    sessionController,
    agents: { currentInitiator: () => localInitiator },
    sessions: {
      get: (id) => (id === 'sess-local' ? localInitiator.session : undefined),
      list: () => [{ id: 'sess-remote-open', header: { cwd: remoteHandle }, seq: 5 }],
    },
  }
  const { ctx } = createFakeContext(services)
  ctx.dshHomePath = (...parts) => join(dir, ...parts)
  ctx.provide = () => {}
  ctx.inject = (deps, cb) => {
    const scope = {}
    for (const dep of deps) {
      if (services[dep] === undefined) return
      scope[dep] = services[dep]
    }
    cb(scope)
  }

  class TestController extends RemoteSshController {
    async checkSshAvailable() { return false }
  }

  const controller = new TestController(ctx, {})
  await controller.ready
  controller.agentWorkspaces.set('ws-remote', {
    hostId: 'h',
    target: 'dev-box',
    remotePath: '/srv/app',
    path: remoteHandle,
    mode: 'standard',
    preset: 'remote-standard',
  })
  controller.ensureServiceBridge()

  // Remote workspace honors explicit remote-ptc, maps local ptc -> remote-ptc, falls back on cordis.
  await sessionController.create({ cwd: remoteHandle, agentPreset: 'remote-ptc' })
  await sessionController.create({ cwd: remoteHandle, agentPreset: 'ptc' })
  await sessionController.create({ cwd: remoteHandle, agentPreset: 'cordis' })
  // Local workspace intercepts remote-ptc -> standard.
  await sessionController.create({ cwd: localCwd, agentPreset: 'remote-ptc' })

  assert.deepEqual(
    createdRequests.map((req) => req.agentPreset),
    ['remote-ptc', 'remote-ptc', 'remote-standard', 'standard'],
  )

  // A local initiator must NOT fall back to an unrelated open remote session.
  assert.equal(controller.resolveCurrentRemoteWorkspace(), null)

  await controller.dispose()
})

test('client.js filters conversation.hero.agentPreset dropdown options by workspace type', async () => {
  const { readFile } = await import('node:fs/promises')
  const { Script, createContext } = await import('node:vm')
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

  let loadedModule = null
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail } },
    window: {
      __ModuleLoader__: {
        load(def) { loadedModule = def },
      },
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
  assert.ok(loadedModule && typeof loadedModule.factory === 'function')

  const plugin = loadedModule.factory((id) => {
    if (id === 'react') {
      return {
        default: { createElement: () => null, Fragment: Symbol('Fragment') },
        useEffect() {},
        useMemo: (fn) => fn(),
        useRef: (v) => ({ current: v }),
        useState: (v) => [v, () => {}],
      }
    }
    return {}
  })

  const registeredEntries = new Map()
  const effects = []
  const sessionListeners = new Set()
  let sessionSnapshot = {
    byId: {
      'sess-remote': {
        id: 'sess-remote',
        blank: true,
        cwd: 'C:\\Users\\tester\\.dsh\\remote-ssh\\agent-workspaces\\abc123',
        retainedBy: { mainView: 1 },
      },
      'sess-local': {
        id: 'sess-local',
        blank: true,
        cwd: 'C:\\Users\\tester\\my-app',
        retainedBy: { mainView: 0 },
      },
    },
  }

  class FakeSlots {
    register(options, component) {
      const list = registeredEntries.get(options.name) ?? []
      const entry = { ...options, component }
      list.push(entry)
      registeredEntries.set(options.name, list)
      return () => {
        const idx = list.indexOf(entry)
        if (idx >= 0) list.splice(idx, 1)
      }
    }
    inject() { return () => {} }
    subscribe() { return () => {} }
  }

  const slots = new FakeSlots()
  const clientServices = {
    sessions: {
      list: {
        getSnapshot: () => sessionSnapshot,
        subscribe: (fn) => { sessionListeners.add(fn); return () => sessionListeners.delete(fn) },
      },
    },
    workspaces: {
      list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} },
    },
  }
  const clientCtx = {
    slots,
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

  // Now simulate @deepseek-ai/dsh-client-ui-agent-preset registering the hero chip.
  const rawState = {
    options: [
      { id: 'standard', name: 'Standard' },
      { id: 'ptc', name: 'PTC' },
      { id: 'cordis', name: 'Creator' },
      { id: 'remote-standard', name: 'Remote Standard' },
      { id: 'remote-ptc', name: 'Remote PTC' },
    ],
    current: 'remote-standard',
    error: null,
    busy: false,
    introduce: false,
  }
  const rawStore = {
    getSnapshot: () => rawState,
    subscribe: () => () => {},
  }
  slots.register({
    name: 'conversation.hero.agentPreset',
    inject: () => ({ hooks: { agentPresetSeat: rawStore } }),
  }, () => null)

  const [entry] = registeredEntries.get('conversation.hero.agentPreset')
  const remoteFace = entry.inject('sess-remote')
  const remoteSnap1 = remoteFace.hooks.agentPresetSeat.getSnapshot()
  const remoteSnap2 = remoteFace.hooks.agentPresetSeat.getSnapshot()
  assert.strictEqual(remoteSnap1, remoteSnap2, 'filtered snapshot must be referentially stable')
  assert.deepEqual(remoteSnap1.options.map((o) => o.id), ['remote-standard', 'remote-ptc'])

  const localFace = entry.inject('sess-local')
  const localSnap = localFace.hooks.agentPresetSeat.getSnapshot()
  assert.deepEqual(localSnap.options.map((o) => o.id), ['standard', 'ptc', 'cordis'])

  // Cleanup restores slots.register cleanly.
  for (const cleanup of effects) cleanup()
})


