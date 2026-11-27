export const PRESET_PLUGIN_NAME = '@deepseek-ai/dsh-agent-preset'
export const REMOTE_PRESET_PREFIX = 'remote-'
export const DEFAULT_EXCLUDED_SOURCE_PRESETS = Object.freeze(['cordis'])

export const DEFAULT_REMOTE_MODULES = Object.freeze({
  remoteFs: new URL('../remote-fs.js', import.meta.url).href,
  remoteShell: new URL('../remote-shell.js', import.meta.url).href,
  remoteFsApproval: new URL('../remote-fs-approval.js', import.meta.url).href,
  remoteContext: new URL('../remote-context.js', import.meta.url).href,
  remoteToolRestrict: new URL('../remote-tool-restrict.js', import.meta.url).href,
})

export const REMOTE_PERSONA_SUFFIX =
  'You are operating on the remote SSH workspace configured for this session. '
  + 'Filesystem, search, bash, jobs, and terminal tools run on the remote host; '
  + 'never use local filesystem paths. The remote workspace is resolved from the session, not from this preset.'

const FRIENDLY_PRESET_NAMES = Object.freeze({
  standard: 'Standard',
  ptc: 'PTC',
  minimal: 'Minimal',
  cordis: 'Cordis',
})

// Plugins that consume `fs` or `shell` (or belong beside them in the isolated
// remote realm so `remote-fs` / `remote-shell` never leak to the Host realm).
const FS_SHELL_REALM_PLUGINS = new Set([
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-fs-search',
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-jobs',
  '@deepseek-ai/dsh-tool-present',
])

// Local Windows-only shell plugins that cannot target a POSIX/Linux SSH host.
const WIN_ONLY_SHELL_PLUGINS = new Set([
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-pwsh-persistent',
])

// Local persistent-terminal shell plugins (used by DSH's newer `minimal` preset)
// that spawn local PTYs instead of SSH; replaced with remote `tool-bash`.
const LOCAL_PERSISTENT_SHELL_PLUGINS = new Set([
  '@deepseek-ai/dsh-terminal-bash',
  '@deepseek-ai/dsh-tool-bash-persistent',
  '@deepseek-ai/dsh-tool-pwsh-persistent',
])

// Host-only tools that cannot operate on remote SSH paths or should stay disabled
// in remote presets.
const DISABLED_IN_REMOTE_PLUGINS = new Set([
  '@deepseek-ai/dsh-tool-office',
  '@deepseek-ai/dsh-plugin-manager/tools',
  '@deepseek-ai/dsh-plugin-market/tools',
])

export function isJsExpr(value) {
  return value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '__jsExpr')
}

function cloneEntryValue(value) {
  if (value === null || typeof value !== 'object') return value
  if (isJsExpr(value)) return { __jsExpr: value.__jsExpr }
  if (Array.isArray(value)) return value.map((item) => cloneEntryValue(item))
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  const copy = {}
  for (const [key, entry] of Object.entries(value)) {
    copy[key] = cloneEntryValue(entry)
  }
  return copy
}

function titleCaseId(id) {
  return String(id)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function remotePresetIdFor(sourceId) {
  return `${REMOTE_PRESET_PREFIX}${sourceId}`
}

export function isRemotePresetId(id) {
  return typeof id === 'string' && id.startsWith(REMOTE_PRESET_PREFIX)
}

function formatRemotePresetName(source) {
  const raw = typeof source?.name === 'string' && source.name.trim() !== ''
    ? source.name.trim()
    : FRIENDLY_PRESET_NAMES[source?.id] ?? titleCaseId(source?.id ?? 'custom')
  return raw.toLowerCase().startsWith('remote ') ? raw : `Remote ${raw}`
}

function formatRemotePresetDescription(source) {
  const base = typeof source?.description === 'string' ? source.description.trim() : ''
  if (base !== '') {
    return base.toLowerCase().includes('remote ssh')
      ? base
      : `${base} (Executed over the session's remote SSH workspace.)`
  }
  const label = FRIENDLY_PRESET_NAMES[source?.id] ?? source?.id ?? 'agent'
  return `Derived from the ${label} preset with filesystem, search, bash, jobs, and terminal tools routed over the session's remote SSH workspace.`
}

function isLocalPersistentShellGroup(row) {
  if (!row || row.group !== true || !Array.isArray(row.config)) return false
  return row.config.some((child) => child && typeof child.name === 'string' && LOCAL_PERSISTENT_SHELL_PLUGINS.has(child.name))
}

function augmentPersonaRow(row) {
  const next = cloneEntryValue(row)
  const cfg = next.config && typeof next.config === 'object' && !Array.isArray(next.config)
    ? next.config
    : {}
  next.config = cfg
  if (isJsExpr(cfg.prefix)) return next
  const existing = typeof cfg.prefix === 'string' ? cfg.prefix.trim() : ''
  if (existing === '') {
    cfg.prefix = `You are a coding agent. ${REMOTE_PERSONA_SUFFIX}`
  } else if (!existing.toLowerCase().includes('remote ssh workspace')) {
    cfg.prefix = `${existing}\n${REMOTE_PERSONA_SUFFIX}`
  }
  return next
}

function needsRemoteFsApproval(realmMembers) {
  for (const row of realmMembers) {
    if (row.disabled === true) continue
    if (row.name === '@deepseek-ai/dsh-tool-bash') return true
    if (row.name === '@deepseek-ai/dsh-tool-fs') {
      const cfg = row.config && typeof row.config === 'object' ? row.config : {}
      if (cfg.write !== false || cfg.edit !== false || cfg.applyPatch === true) return true
    }
  }
  return false
}

function isRemoteContextRow(row, modules) {
  return row?.id === 'remote-context'
    || row?.name === 'dsh-remote-ssh/remote-context'
    || row?.name === modules.remoteContext
}

function isRemoteToolRestrictRow(row, modules) {
  return row?.id === 'remote-tool-restrict'
    || row?.name === 'dsh-remote-ssh/remote-tool-restrict'
    || row?.name === modules.remoteToolRestrict
}

function transformGroupChildren(children, state) {
  const result = []
  for (const raw of children) {
    if (!raw || typeof raw !== 'object') continue
    if (WIN_ONLY_SHELL_PLUGINS.has(raw.name)) continue
    if (isLocalPersistentShellGroup(raw)) {
      state.hadPersistentShell = true
      continue
    }
    if (raw.group === true && Array.isArray(raw.config)) {
      const group = cloneEntryValue(raw)
      group.config = transformGroupChildren(group.config, state)
      result.push(group)
      continue
    }
    if (DISABLED_IN_REMOTE_PLUGINS.has(raw.name)) {
      const disabledRow = cloneEntryValue(raw)
      disabledRow.disabled = true
      result.push(disabledRow)
      continue
    }
    if (FS_SHELL_REALM_PLUGINS.has(raw.name)) {
      const member = cloneEntryValue(raw)
      if (member.name === '@deepseek-ai/dsh-tool-bash' && member.disabled !== true) {
        delete member.disabled
        state.hasBash = true
      }
      state.realmMembers.push(member)
      continue
    }
    result.push(cloneEntryValue(raw))
  }
  return result
}

/**
 * Derive a remote SSH preset definition from a source DSH preset definition.
 * Unknown plugins and future upstream config additions pass through unchanged.
 */
export function deriveRemotePreset(source, options = {}) {
  if (!source || typeof source !== 'object') {
    throw new Error('deriveRemotePreset requires a source preset definition')
  }
  const sourceId = typeof source.id === 'string' ? source.id.trim() : ''
  if (sourceId === '') throw new Error('deriveRemotePreset requires source.id')
  const sourcePlugins = Array.isArray(source.plugins) ? source.plugins : []
  const modules = { ...DEFAULT_REMOTE_MODULES, ...(options.modules ?? {}) }

  const state = {
    realmMembers: [],
    hasBash: false,
    hadPersistentShell: false,
  }

  const output = []
  let realmSlotIndex = -1
  let personaIndex = -1
  let hasRemoteContext = false
  let hasRemoteToolRestrict = false

  for (const raw of sourcePlugins) {
    if (!raw || typeof raw !== 'object') continue
    if (WIN_ONLY_SHELL_PLUGINS.has(raw.name)) continue

    if (isRemoteContextRow(raw, modules)) hasRemoteContext = true
    if (isRemoteToolRestrictRow(raw, modules)) hasRemoteToolRestrict = true

    if (isLocalPersistentShellGroup(raw)) {
      state.hadPersistentShell = true
      if (realmSlotIndex === -1) realmSlotIndex = output.length
      continue
    }

    if (raw.name === '@deepseek-ai/dsh-persona') {
      personaIndex = output.length
      output.push(augmentPersonaRow(raw))
      continue
    }

    if (DISABLED_IN_REMOTE_PLUGINS.has(raw.name)) {
      const disabledRow = cloneEntryValue(raw)
      disabledRow.disabled = true
      output.push(disabledRow)
      continue
    }

    if (FS_SHELL_REALM_PLUGINS.has(raw.name)) {
      if (realmSlotIndex === -1) realmSlotIndex = output.length
      const member = cloneEntryValue(raw)
      if (member.name === '@deepseek-ai/dsh-tool-bash' && member.disabled !== true) {
        delete member.disabled
        state.hasBash = true
      }
      state.realmMembers.push(member)
      continue
    }

    if (raw.group === true && Array.isArray(raw.config)) {
      const group = cloneEntryValue(raw)
      const beforeCount = state.realmMembers.length
      group.config = transformGroupChildren(group.config, state)
      if (state.realmMembers.length > beforeCount && realmSlotIndex === -1) {
        realmSlotIndex = output.length
      }
      output.push(group)
      continue
    }

    output.push(cloneEntryValue(raw))
  }

  if (state.hadPersistentShell && !state.hasBash) {
    state.realmMembers.push({
      id: 'tool-bash',
      name: '@deepseek-ai/dsh-tool-bash',
    })
    state.hasBash = true
  }

  const injectedHead = []
  if (!hasRemoteContext) injectedHead.push({ id: 'remote-context', name: modules.remoteContext })
  if (!hasRemoteToolRestrict) injectedHead.push({ id: 'remote-tool-restrict', name: modules.remoteToolRestrict })

  const headInsertAt = personaIndex >= 0 ? personaIndex + 1 : 0
  if (injectedHead.length > 0) {
    output.splice(headInsertAt, 0, ...injectedHead)
    if (realmSlotIndex >= headInsertAt) realmSlotIndex += injectedHead.length
  }

  if (state.realmMembers.length > 0) {
    const realmEntries = [
      { id: 'remote-fs', name: modules.remoteFs },
      { id: 'remote-shell', name: modules.remoteShell },
    ]
    const includeApproval = needsRemoteFsApproval(state.realmMembers)
    let approvalInserted = false
    for (const member of state.realmMembers) {
      if (includeApproval && !approvalInserted && member.name === '@deepseek-ai/dsh-tool-bash') {
        realmEntries.push({ id: 'remote-fs-approval', name: modules.remoteFsApproval })
        approvalInserted = true
      }
      realmEntries.push(member)
    }
    if (includeApproval && !approvalInserted) {
      realmEntries.push({ id: 'remote-fs-approval', name: modules.remoteFsApproval })
    }

    const realmGroup = {
      id: 'remote-fs-realm',
      name: 'cordis:group',
      group: true,
      isolate: {
        fs: true,
        shell: true,
      },
      config: realmEntries,
    }
    const insertAt = realmSlotIndex >= 0 ? realmSlotIndex : headInsertAt + injectedHead.length
    output.splice(insertAt, 0, realmGroup)
  }

  const order = typeof source.order === 'number' && Number.isFinite(source.order)
    ? 60 + source.order
    : 69

  return {
    id: remotePresetIdFor(sourceId),
    name: formatRemotePresetName(source),
    description: formatRemotePresetDescription(source),
    order,
    plugins: output,
  }
}

function stableFingerprint(value) {
  const seen = new WeakSet()
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object') {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
      if (!Array.isArray(item)) {
        const sorted = {}
        for (const key of Object.keys(item).sort()) sorted[key] = item[key]
        return sorted
      }
    }
    return item
  })
}

function isPresetLoaderEntry(entry) {
  return entry?.options?.name === PRESET_PLUGIN_NAME
}

function findRegisterHookTarget(presets) {
  if (!presets || typeof presets.register !== 'function') return null
  if (Object.prototype.hasOwnProperty.call(presets, 'register')) {
    return { target: presets, hadOwn: true, original: presets.register }
  }
  const proto = Object.getPrototypeOf(presets)
  if (proto && proto !== Object.prototype && typeof proto.register === 'function') {
    const hadOwn = Object.prototype.hasOwnProperty.call(proto, 'register')
    return { target: proto, hadOwn, original: proto.register }
  }
  return { target: presets, hadOwn: false, original: presets.register }
}

/**
 * Watches DSH's Loader entries and AgentPresetRegistry to dynamically derive
 * and keep `remote-<id>` presets synchronized with upstream preset definitions.
 */
export class RemotePresetDeriver {
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.modules = { ...DEFAULT_REMOTE_MODULES, ...(options.modules ?? {}) }
    this.excludeIds = new Set(options.excludeIds ?? DEFAULT_EXCLUDED_SOURCE_PRESETS)
    this.debounceMs = typeof options.debounceMs === 'number' && options.debounceMs >= 0 ? options.debounceMs : 25
    this.getAgentPresets = options.getAgentPresets ?? (() => this.ctx?.get?.('agentPresets'))
    this.getLoader = options.getLoader ?? (() => this.ctx?.get?.('loader'))
    this.logger = options.logger ?? {
      info: (msg) => this.ctx?.logger?.info?.(`[remote-ssh] ${msg}`),
      warn: (msg) => this.ctx?.logger?.warn?.(`[remote-ssh] ${msg}`),
      error: (msg) => this.ctx?.logger?.error?.(`[remote-ssh] ${msg}`),
    }

    this.managed = new Map()
    this.programmaticSources = new Map()
    this.ownRegisterIds = new Set()
    this.cleanups = []
    this.registerHook = null
    this.started = false
    this.disposed = false
    this.syncDepth = 0
    this.syncTimer = null
    this.syncQueue = Promise.resolve()
    this.ready = Promise.resolve()
  }

  start() {
    if (this.disposed) return this.ready
    if (!this.started) {
      this.started = true
      this.installListeners()
    }
    this.installRegisterObserver()
    this.ready = this.sync()
    return this.ready
  }

  installListeners() {
    if (typeof this.ctx?.on !== 'function') return
    const listen = (event, handler) => {
      try {
        const dispose = this.ctx.on(event, handler)
        if (typeof dispose === 'function') this.cleanups.push(dispose)
      } catch {
        // ignore unsupported events on older or minimal contexts
      }
    }
    listen('app-boot/config-reload', () => { this.scheduleSync() })
    listen('loader/config-update', () => { this.scheduleSync() })
    listen('loader/entry-init', (entry) => {
      if (isPresetLoaderEntry(entry)) this.scheduleSync()
    })
    listen('loader/partial-dispose', (entry) => {
      if (isPresetLoaderEntry(entry)) this.scheduleSync()
    })
  }

  installRegisterObserver() {
    if (this.registerHook) return
    const presets = this.getAgentPresets?.()
    if (!presets || typeof presets.register !== 'function') return
    const info = findRegisterHookTarget(presets)
    if (!info) return
    const self = this
    const { target, hadOwn, original } = info
    const wrapper = async function (definition, ...rest) {
      const id = typeof definition?.id === 'string' ? definition.id.trim() : ''
      const isOwn = id !== '' && self.ownRegisterIds.has(id)
      const unregister = await original.call(this, definition, ...rest)
      if (!isOwn && !self.disposed && id !== '' && !isRemotePresetId(id) && !self.excludeIds.has(id)) {
        const baseUrl = this?.ctx?.baseUrl ?? undefined
        self.programmaticSources.set(id, { config: definition, baseUrl })
        self.scheduleSync()
        if (typeof unregister === 'function') {
          let wrappedDisposed = false
          return async (...disposeArgs) => {
            if (wrappedDisposed) return
            wrappedDisposed = true
            const current = self.programmaticSources.get(id)
            if (current && current.config === definition) {
              self.programmaticSources.delete(id)
            }
            const result = await unregister(...disposeArgs)
            if (!self.disposed) self.scheduleSync()
            return result
          }
        }
      }
      return unregister
    }
    try {
      target.register = wrapper
      if (target.register === wrapper) {
        this.registerHook = { target, hadOwn, original, wrapper }
      }
    } catch (error) {
      this.logger.warn(`could not observe agentPresets.register: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  scheduleSync() {
    if (this.disposed) return
    if (this.syncTimer) clearTimeout(this.syncTimer)
    if (this.debounceMs === 0) {
      this.syncTimer = null
      void this.sync()
      return
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      void this.sync()
    }, this.debounceMs)
    this.syncTimer.unref?.()
  }

  collectSources() {
    const sources = new Map()
    const staticRemoteIds = new Set()
    const loader = this.getLoader?.()
    if (loader && typeof loader.entries === 'function') {
      try {
        for (const entry of loader.entries()) {
          if (!isPresetLoaderEntry(entry)) continue
          if (entry.disabled) continue
          const cfg = entry.options?.config
          const id = typeof cfg?.id === 'string' ? cfg.id.trim() : ''
          if (id === '' || !Array.isArray(cfg?.plugins)) continue
          if (isRemotePresetId(id)) {
            staticRemoteIds.add(id)
            continue
          }
          if (this.excludeIds.has(id)) continue
          const baseUrl = entry.ctx?.baseUrl ?? entry.parent?.ctx?.baseUrl ?? undefined
          sources.set(id, { config: cfg, baseUrl })
        }
      } catch (error) {
        this.logger.warn(`could not scan loader preset entries: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    for (const [id, record] of this.programmaticSources) {
      if (isRemotePresetId(id) || this.excludeIds.has(id)) continue
      if (sources.has(id)) continue
      if (!record?.config || !Array.isArray(record.config.plugins)) continue
      sources.set(id, record)
    }

    return { sources, staticRemoteIds }
  }

  async registerDerivedPreset(presets, derived, baseUrl) {
    let target = presets
    if (baseUrl && typeof this.ctx?.extend === 'function') {
      try {
        const regCtx = this.ctx.extend({ baseUrl })
        const scoped = typeof regCtx.get === 'function' ? regCtx.get('agentPresets') : regCtx.agentPresets
        if (scoped && typeof scoped.register === 'function') target = scoped
      } catch {
        target = presets
      }
    }
    this.ownRegisterIds.add(derived.id)
    try {
      return await target.register(derived)
    } finally {
      this.ownRegisterIds.delete(derived.id)
    }
  }

  sync() {
    if (this.disposed) return Promise.resolve()
    const run = this.syncQueue.then(() => this.performSync())
    this.syncQueue = run.catch(() => {})
    return run
  }

  async performSync() {
    if (this.disposed) return
    const presets = this.getAgentPresets?.()
    if (!presets || typeof presets.register !== 'function') return
    this.installRegisterObserver()

    this.syncDepth += 1
    try {
      const { sources, staticRemoteIds } = this.collectSources()
      const desired = new Map()
      for (const [sourceId, record] of sources) {
        const derivedId = remotePresetIdFor(sourceId)
        if (staticRemoteIds.has(derivedId)) continue
        try {
          const derived = deriveRemotePreset(record.config, { modules: this.modules })
          const fingerprint = stableFingerprint({ derived, baseUrl: record.baseUrl ?? null })
          desired.set(derivedId, {
            sourceId,
            derived,
            baseUrl: record.baseUrl ?? null,
            fingerprint,
          })
        } catch (error) {
          this.logger.warn(`could not derive remote preset from "${sourceId}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // Retire removed, overridden, or changed derived presets first.
      for (const [derivedId, active] of [...this.managed.entries()]) {
        const next = desired.get(derivedId)
        if (next && next.fingerprint === active.fingerprint) continue
        this.managed.delete(derivedId)
        try {
          await active.unregister?.()
        } catch (error) {
          this.logger.warn(`could not unregister derived preset "${derivedId}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (this.disposed) return

      // Register newly added or updated derived presets.
      for (const [derivedId, next] of desired) {
        if (this.disposed) break
        if (this.managed.has(derivedId)) continue
        try {
          const unregister = await this.registerDerivedPreset(presets, next.derived, next.baseUrl)
          if (this.disposed) {
            await unregister?.().catch?.(() => {})
            break
          }
          this.managed.set(derivedId, {
            sourceId: next.sourceId,
            derived: next.derived,
            baseUrl: next.baseUrl,
            fingerprint: next.fingerprint,
            unregister,
          })
          this.logger.info(`derived remote preset "${derivedId}" from "${next.sourceId}"`)
        } catch (error) {
          this.logger.warn(`could not register derived preset "${derivedId}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } finally {
      this.syncDepth -= 1
    }
  }

  async ensureSynced() {
    if (this.disposed || this.syncDepth > 0) return
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
      await this.sync()
      return
    }
    await this.syncQueue
    if (this.managed.size === 0 && !this.disposed) {
      await this.sync()
    }
  }

  has(id) {
    return this.managed.has(id)
  }

  listDerivedIds() {
    return [...this.managed.keys()]
  }

  async dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
    while (this.cleanups.length > 0) {
      const cleanup = this.cleanups.pop()
      try {
        cleanup()
      } catch {
        // ignore listener cleanup errors
      }
    }
    if (this.registerHook) {
      const { target, hadOwn, original, wrapper } = this.registerHook
      this.registerHook = null
      try {
        if (target.register === wrapper) {
          if (hadOwn) target.register = original
          else delete target.register
        }
      } catch {
        // ignore hook restore errors
      }
    }
    await this.syncQueue.catch(() => {})
    const entries = [...this.managed.entries()]
    this.managed.clear()
    this.programmaticSources.clear()
    for (const [id, active] of entries) {
      try {
        await active.unregister?.()
      } catch (error) {
        this.logger.warn(`could not unregister derived preset "${id}" on dispose: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
