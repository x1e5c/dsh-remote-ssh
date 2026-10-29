import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { spawn } from 'node:child_process'
import { RemoteUiProxy } from './proxy.js'
import { createRemoteFileSystem } from '../remote-fs.js'
import {
  buildLaunchCommand,
  createAskpass,
  createLineReader,
  maskedUrl,
  openExternalUrl,
  parseProbeOutput,
  parseStartupUrl,
  probeCommand,
  randomRemotePort,
  reserveLocalPort,
  rewriteTunnelUrl,
  runSsh,
  shellQuote,
  sshInvocation,
  startSsh,
  stripAnsi,
  validateCommand,
  validatePort,
  validateRemotePath,
  validateTarget,
  waitForLocalPort,
  wrapPosix,
} from './remote.js'
import { decodeSessionLog, mirrorSession, mirrorWorkspacePath } from './mirror.js'
import { remoteRpc } from './remote-api.js'
import { remoteTerminalType } from '../remote-terminal-types.js'

const DEFAULTS = {
  sshExecutable: 'ssh',
  connectTimeoutSec: 15,
  probeTimeoutMs: 30000,
  launchTimeoutMs: 150000,
  installTimeoutMs: 300000,
  logLines: 500,
  bridgePrompts: true,
  mirrorNativeTree: true,
  mirrorContent: false,
}

const BUILD_STAMP = '2026-10-28T04:30:00Z'
const LIVE_BRIDGE_PROBE = false
const CREATE_BRIDGE_PROBE = false
const REMOTE_AGENT_PATH = '/root/data'
const REMOTE_AGENT_MODES = {
  standard: 'remote-standard',
  ptc: 'remote-ptc',
  minimal: 'remote-minimal',
}
const DEFAULT_REMOTE_AGENT_MODE = 'standard'
const MIRROR_CONTENT_MAX = 16 * 1024 * 1024
const LARGE_READ_APPROVAL = 8 * 1024 * 1024
const AGENT_PROBE = false
const AGENT_WRITE_PROBE = false
const AGENT_FS_PROBE = false
const AGENT_SHELL_PROBE = false
const AGENT_JOB_PROBE = false
const AGENT_JOB_KILL_PROBE = false
const DIRECT_SHELL_PROBE = false
const TERMINAL_PROBE = false
const WORKSPACE_FILES_PROBE = false
const FS_SURFACE_PROBE = false
const FILES_PANEL_PROBE = false
const FILES_ROUTE_PROBE = false
const FILES_DOWNLOAD_PROBE = false
const DYNAMIC_PRESET_PROBE = false
const TERMINAL_HOST_PROBE = false
const MULTI_TARGET_PROBE = false
const IOTA_SC_PROBE = false
const IOTA_CLEANUP_PROBE = false
const IOTA_FILES_PROBE = false
const STATIC_PRESET_PROBE = false
const LEGACY_PRESET_PROBE = false
const REMOTE_DIRS_PROBE = false
const CLIENT_GRAPH_PROBE = false
const AUTO_APPROVE_PROBE = false

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeRemoteMode(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REMOTE_AGENT_MODES, value)
    ? value
    : DEFAULT_REMOTE_AGENT_MODE
}

function localPathKey(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export class AppError extends Error {
  constructor(code, message, detail, extra = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.detail = detail ?? null
    Object.assign(this, extra)
  }
}

function tail(text, limit = 1200) {
  const clean = stripAnsi(text ?? '').replace(/\r/g, '').trim()
  if (clean.length <= limit) return clean
  return clean.slice(-limit)
}

function inputValue(validate) {
  try {
    return validate()
  } catch (error) {
    throw new AppError('invalid-input', error instanceof Error ? error.message : String(error))
  }
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    timer.unref?.()
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function redact(text) {
  return stripAnsi(text ?? '').replace(/([?&](?:token|access_token)=)[^&#\s]+/gi, '$1••••')
}

function normalizeProfile(record, id) {
  if (typeof record.profile === 'string' && /^[a-z0-9][a-z0-9-]{0,30}$/.test(record.profile)) {
    return record.profile
  }
  const slug = String(id).replace(/[^a-z0-9]/g, '').slice(0, 12) || randomUUID().slice(0, 8)
  return `dsh-rs-${slug}`
}

function classifySshFailure(result) {
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
  const detail = tail(text)
  if (result.error?.code === 'ENOENT') {
    return new AppError('ssh-missing', 'The local ssh client was not found', detail)
  }
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(text)) {
    return new AppError('host-key-changed', 'The remote host key changed or is not trusted', detail)
  }
  if (/Permission denied|Authentication failed|Too many authentication failures|no more authentication methods/i.test(text)) {
    return new AppError('auth-failed', 'SSH authentication failed', detail)
  }
  if (/Could not resolve hostname|Name or service not known|nodename nor servname/i.test(text)) {
    return new AppError('dns', 'The SSH host name could not be resolved', detail)
  }
  if (/Connection refused|Connection timed out|Operation timed out|No route to host|Network is unreachable|Connection closed|Broken pipe/i.test(text)) {
    return new AppError('connect-failed', 'The SSH connection could not be established', detail)
  }
  if (result.timedOut) {
    return new AppError('connect-failed', 'The SSH connection timed out', detail)
  }
  return new AppError('ssh-error', `SSH exited with code ${result.code ?? 'unknown'}${result.signal ? ` (${result.signal})` : ''}`, detail)
}

function classifyLaunchFailure(result, remotePort) {
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
  const detail = tail(text)
  if (/EADDRINUSE|address already in use/i.test(text)) {
    return new AppError('launch-failed', `Remote port ${remotePort} is already in use`, detail, { retryable: true })
  }
  if (/__DSHRS_CD__missing/.test(text)) {
    return new AppError('path-missing', 'The remote workspace directory does not exist', detail)
  }
  if (/command not found|No such file or directory/i.test(text)) {
    return new AppError('launch-failed', 'The remote dsh command could not be started', detail)
  }
  if (/Cannot listen|listen EACCES|EACCES/i.test(text)) {
    return new AppError('launch-failed', 'The remote dsh process could not bind its port', detail)
  }
  return new AppError('launch-failed', `The remote dsh process exited with code ${result.code ?? 'unknown'}`, detail)
}

export class RemoteSshController {
  constructor(ctx, config = {}) {
    this.ctx = ctx
    this.config = { ...DEFAULTS }
    for (const key of Object.keys(DEFAULTS)) {
      const value = config?.[key]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) this.config[key] = value
      if (typeof value === 'string' && value.trim() !== '') this.config[key] = value.trim()
      if (typeof value === 'boolean' && typeof DEFAULTS[key] === 'boolean') this.config[key] = value
    }
    this.dir = this.resolveDir()
    this.hostsFile = join(this.dir, 'hosts.json')
    this.mirrorFile = join(this.dir, 'mirror.json')
    this.agentWorkspacesFile = join(this.dir, 'agent-workspaces.json')
    this.mirrorRoot = join(this.dir, 'mirror')
    this.hosts = []
    this.mirrorIds = new Set()
    this.mirrorRecords = new Map()
    this.agentWorkspaces = new Map()
    this.remoteWorkspaceService = null
    this.serviceBridge = null
    this.fileSurfaceBridges = null
    this.remoteFileSystems = new Map()
    this.fileSurfaceCalls = []
    this.mirrorSyncs = new Set()
    this.mirrorTimer = null
    this.liveMirrors = new Map()
    this.mirrorHandles = new Map()
    this.polling = new Set()
    this.promptCount = 0
    this.gatewayProbeAttempted = false
    this.liveProbeAttempted = false
    this.createProbeAttempted = false
    this.agentProbeAttempted = false
    this.agentWriteProbeAttempted = false
    this.agentFsProbeAttempted = false
    this.agentShellProbeAttempted = false
    this.agentJobProbeAttempted = false
    this.agentJobKillProbeAttempted = false
    this.autoApproveProbe = AUTO_APPROVE_PROBE
    this.remoteRpc = remoteRpc
    this.autoMirrorAttempted = false
    this.runtime = new Map()
    this.proxy = new RemoteUiProxy()
    this.sshAvailable = true
    this.disposed = false
    this.ready = this.initialize()
      .then(() => this.installFileSurfaceBridges())
      .then(() => this.installRemoteWorkspaceService())
      .then(() => this.installAgentPresetCompatibility())
      .then(() => this.installWorkspaceControllerBridge())
      .then(() => this.migrateAgentWorkspaceModes())
      .then(() => {
        if (this.config.mirrorNativeTree) void this.syncAllAgentWorkspaceMirrors()
      })
      .catch((error) => {
        this.warn(`initialization failed: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  resolveDir() {
    try {
      const homePath = this.ctx.dshHomePath
      if (typeof homePath === 'function') return homePath('remote-ssh')
    } catch {
      // fall through to the environment-based default
    }
    return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'remote-ssh')
  }

  info(message) {
    try {
      this.ctx.logger?.info?.(`[remote-ssh] ${message}`)
    } catch {
      // logging must never break a connection attempt
    }
  }

  warn(message) {
    try {
      this.ctx.logger?.warn?.(`[remote-ssh] ${message}`)
    } catch {
      // ignore
    }
  }

  async initialize() {
    await mkdir(this.dir, { recursive: true }).catch(() => {})
    await writeFile(join(this.dir, 'last-load.json'), JSON.stringify({ build: BUILD_STAMP, at: new Date().toISOString() }, null, 2))
      .catch(() => {})
    try {
      const raw = await readFile(this.hostsFile, 'utf8')
      const parsed = JSON.parse(raw)
      const records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.hosts) ? parsed.hosts : []
      const ids = new Set()
      for (const record of records) {
        try {
          const normalized = this.normalizeHostRecord(record)
          if (!normalized || ids.has(normalized.id)) continue
          ids.add(normalized.id)
          this.hosts.push(normalized)
        } catch (error) {
          this.warn(`ignored an invalid host record: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        this.warn(`could not read ${this.hostsFile}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    try {
      const raw = await readFile(this.agentWorkspacesFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed?.workspaces && typeof parsed.workspaces === 'object') {
        for (const [id, record] of Object.entries(parsed.workspaces)) {
          if (typeof id !== 'string' || id === '') continue
          this.agentWorkspaces.set(id, {
            hostId: typeof record?.hostId === 'string' ? record.hostId : null,
            target: typeof record?.target === 'string' ? record.target : null,
            remotePath: typeof record?.remotePath === 'string' ? record.remotePath : null,
            path: typeof record?.path === 'string' ? record.path : null,
            preset: typeof record?.preset === 'string' ? record.preset : null,
            mode: typeof record?.mode === 'string' ? record.mode : null,
            sandbox: record?.sandbox === 'bwrap' ? 'bwrap' : null,
          })
        }
      }
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        this.warn(`could not read ${this.agentWorkspacesFile}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.sshAvailable = await this.checkSshAvailable()
  }

  normalizeHostRecord(record) {
    if (!record || typeof record !== 'object') return null
    const id = typeof record.id === 'string' && /^[a-f0-9]{8}$/.test(record.id)
      ? record.id
      : randomUUID().slice(0, 8)
    const target = validateTarget(record.target)
    const port = validatePort(record.port)
    const remotePath = validateRemotePath(record.remotePath)
    const identityFile = String(record.identityFile ?? '').trim()
    const dshCommand = validateCommand(record.dshCommand)
    const name = String(record.name ?? '').trim() || target
    return {
      id,
      name: name.slice(0, 80),
      target,
      port,
      identityFile,
      remotePath,
      dshCommand,
      sandbox: record.sandbox === 'bwrap' ? 'bwrap' : null,
      sandboxReason: typeof record.sandboxReason === 'string' ? record.sandboxReason.slice(0, 400) : null,
      profile: normalizeProfile(record, id),
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
      lastUsedAt: typeof record.lastUsedAt === 'string' ? record.lastUsedAt : null,
      lastOpenedAt: typeof record.lastOpenedAt === 'string' ? record.lastOpenedAt : null,
    }
  }

  checkSshAvailable() {
    return new Promise((resolve) => {
      let settled = false
      const done = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      let child
      try {
        child = spawn(this.config.sshExecutable, ['-V'], { stdio: 'ignore', windowsHide: true })
      } catch {
        done(false)
        return
      }
      child.once('error', () => done(false))
      child.once('exit', () => done(true))
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
        done(false)
      }, 3000)
      timer.unref?.()
    })
  }

  credentials() {
    try {
      return this.ctx.get('credentials')
    } catch {
      return undefined
    }
  }

  secretRef(id) {
    return `REMOTE_SSH_${String(id).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`
  }

  async hasSecret(host) {
    const credentials = this.credentials()
    if (typeof credentials?.describe !== 'function') return false
    try {
      const info = await credentials.describe(this.secretRef(host.id))
      return Boolean(info?.configured)
    } catch {
      return false
    }
  }

  async getSecret(host) {
    const credentials = this.credentials()
    if (typeof credentials?.resolve !== 'function') return null
    try {
      const resolved = await credentials.resolve(this.secretRef(host.id))
      const value = resolved?.value
      return typeof value === 'string' && value.length > 0 ? value : null
    } catch {
      return null
    }
  }

  async setSecret(host, value) {
    const credentials = this.credentials()
    if (typeof credentials?.set !== 'function') {
      throw new AppError('credentials-unavailable', 'The local credential store is unavailable')
    }
    const secret = String(value ?? '')
    if (secret.length === 0) throw new AppError('invalid-input', 'The secret is empty')
    if (secret.length > 8192) throw new AppError('invalid-input', 'The secret is too long')
    if (secret.includes('\u0000')) throw new AppError('invalid-input', 'The secret contains a NUL byte')
    await credentials.set(this.secretRef(host.id), secret)
  }

  async clearSecret(host) {
    const credentials = this.credentials()
    if (typeof credentials?.unset !== 'function') return
    await credentials.unset(this.secretRef(host.id)).catch(() => {})
  }

  publicHost(host) {
    return {
      id: host.id,
      name: host.name,
      target: host.target,
      port: host.port,
      identityFile: host.identityFile,
      remotePath: host.remotePath,
      dshCommand: host.dshCommand,
      sandbox: host.sandbox ?? null,
      sandboxReason: host.sandboxReason ?? null,
      profile: host.profile,
      createdAt: host.createdAt,
      lastUsedAt: host.lastUsedAt,
      lastOpenedAt: host.lastOpenedAt,
    }
  }

  requireHost(id) {
    const host = this.hosts.find((candidate) => candidate.id === id)
    if (!host) throw new AppError('not-found', 'Connection not found')
    return host
  }

  async detectSandbox(host) {
    if (!this.sshAvailable || !host?.target) {
      return { sandbox: null, reason: 'The local ssh client is unavailable.' }
    }
    const script = [
      'if ! command -v bwrap >/dev/null 2>&1; then printf missing; exit 0; fi',
      'if out=$(bwrap --ro-bind / / --dev /dev --proc /proc --die-with-parent true 2>&1); then printf bwrap; else printf "unusable:%s" "$out"; fi',
    ].join('; ')
    try {
      const result = await runSsh(
        this.config.sshExecutable,
        sshInvocation(host, wrapPosix(script), {
          connectTimeoutSec: this.config.connectTimeoutSec,
          batchMode: true,
        }),
        { timeoutMs: 20000, maxBytes: 4096 },
      )
      const value = String(result.stdout ?? '').trim()
      if (value === 'bwrap') return { sandbox: 'bwrap', reason: null }
      if (value === 'missing') return { sandbox: null, reason: 'bwrap is not installed on the remote host.' }
      if (value.startsWith('unusable:')) {
        return { sandbox: null, reason: value.slice('unusable:'.length).trim().slice(0, 400) }
      }
      return { sandbox: null, reason: value === '' ? 'The sandbox probe returned no output.' : value.slice(0, 400) }
    } catch (error) {
      return { sandbox: null, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  async detectSandboxHost(input) {
    await this.ready
    const host = this.requireHost(input?.id)
    const detection = await this.detectSandbox(host)
    host.sandbox = detection.sandbox
    host.sandboxReason = detection.reason
    for (const record of this.agentWorkspaces.values()) {
      if (record.hostId === host.id) record.sandbox = detection.sandbox
    }
    await this.saveHosts()
    await this.saveAgentWorkspaces()
    return { host: this.publicHost(host) }
  }

  async readSandboxLog(input = {}) {
    await this.ready
    const limit = Number.isSafeInteger(input?.limit) && input.limit > 0
      ? Math.min(input.limit, 1000)
      : 200
    const file = join(this.dir, 'sandbox-log.jsonl')
    try {
      const raw = await readFile(file, 'utf8')
      const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '')
      return { path: file, lines: lines.slice(-limit) }
    } catch (error) {
      if (error?.code === 'ENOENT') return { path: file, lines: [] }
      throw error
    }
  }

  ensureRuntime(host) {
    let runtime = this.runtime.get(host.id)
    if (!runtime) {
      runtime = {
        phase: 'idle',
        error: null,
        logs: [],
        url: null,
        info: null,
        child: null,
        askpass: null,
        runId: 0,
        localPort: null,
        remotePort: null,
        proxy: null,
        startedAt: null,
      }
      this.runtime.set(host.id, runtime)
    }
    return runtime
  }

  log(runtime, stream, text) {
    const line = redact(String(text ?? '')).trimEnd()
    if (line.length === 0) return
    runtime.logs.push({ time: Date.now(), stream, text: line })
    const limit = Math.max(50, Number(this.config.logLines) || 500)
    if (runtime.logs.length > limit) runtime.logs.splice(0, runtime.logs.length - limit)
  }

  async saveHosts() {
    await mkdir(this.dir, { recursive: true }).catch(() => {})
    const payload = JSON.stringify({ version: 1, hosts: this.hosts }, null, 2)
    const temp = `${this.hostsFile}.tmp`
    try {
      await writeFile(temp, payload, { mode: 0o600 })
      await rename(temp, this.hostsFile)
    } catch {
      await writeFile(this.hostsFile, payload, { mode: 0o600 })
    }
  }

  async list() {
    await this.ready
    this.ensureServiceBridge()
    const connections = await Promise.all(this.hosts.map(async (host) => {
      const runtime = this.runtime.get(host.id)
      return {
        ...this.publicHost(host),
        hasSecret: await this.hasSecret(host),
        phase: runtime?.phase ?? 'idle',
        error: runtime?.error ?? null,
        url: runtime?.phase === 'ready' ? runtime.url : null,
        maskedUrl: runtime?.phase === 'ready' && runtime.url ? maskedUrl(runtime.url) : null,
        info: runtime?.info ?? null,
        logCount: runtime?.logs.length ?? 0,
      }
    }))
    return {
      connections,
      sshAvailable: this.sshAvailable,
      credentialsAvailable: Boolean(this.credentials()),
      mirrorSessionIds: [...this.mirrorIds],
      mirrorCount: this.mirrorIds.size,
    }
  }

  isMirrorSession(id) {
    return this.mirrorIds.has(String(id))
  }

  isMirrorPath(path) {
    if (typeof path !== 'string' || path === '') return false
    try {
      const normalized = path.replace(/\\/g, '/').toLowerCase()
      return normalized.startsWith(this.mirrorRoot.replace(/\\/g, '/').toLowerCase())
    } catch {
      return false
    }
  }

  async saveMirrorState() {
    await mkdir(this.dir, { recursive: true }).catch(() => {})
    const sessions = {}
    for (const [id, record] of this.mirrorRecords) {
      sessions[id] = {
        hostId: record.hostId ?? null,
        remotePath: record.remotePath ?? null,
        cwd: record.cwd ?? null,
        lastSeq: Number.isSafeInteger(record.lastSeq) ? record.lastSeq : -1,
        remoteSessionId: record.remoteSessionId ?? id,
      }
    }
    const payload = JSON.stringify({ version: 3, sessions }, null, 2)
    await writeFile(this.mirrorFile, payload, { mode: 0o600 }).catch(() => {})
  }

  parseMirrorDump(text) {
    const entries = []
    const pattern = /@@DSHRS_BEGIN@@([^\n\r]*)\r?\n([\s\S]*?)\r?\n@@DSHRS_END@@/g
    let match
    while ((match = pattern.exec(text)) !== null) {
      const remotePath = match[1].trim()
      const base64 = match[2].replace(/\s+/g, '')
      if (!remotePath || base64 === '') continue
      entries.push({ path: remotePath, buffer: Buffer.from(base64, 'base64') })
    }
    return entries
  }

  async saveAgentWorkspaces() {
    await mkdir(this.dir, { recursive: true }).catch(() => {})
    const workspaces = {}
    for (const [id, record] of this.agentWorkspaces) {
      workspaces[id] = {
        hostId: record.hostId ?? null,
        target: record.target ?? null,
        remotePath: record.remotePath ?? null,
        path: record.path ?? null,
        preset: record.preset ?? null,
        mode: record.mode ?? null,
        sandbox: record.sandbox ?? null,
      }
    }
    await writeFile(this.agentWorkspacesFile, JSON.stringify({ version: 1, workspaces }, null, 2), { mode: 0o600 }).catch(() => {})
  }

  async createAgentWorkspace(id, remotePathInput, modeInput) {
    await this.ready
    const host = this.requireHost(id)
    const workspaceRegistry = this.ctx.get('workspaceRegistry')
    if (!workspaceRegistry) throw new AppError('bridge-unavailable', 'The local workspace registry is unavailable')
    const mode = normalizeRemoteMode(modeInput)
    const requested = typeof remotePathInput === 'string' ? remotePathInput.trim() : ''
    const remotePath = posix.normalize(
      requested.startsWith('/')
        ? requested.replace(/\/+$/, '') || '/'
        : host.remotePath?.startsWith('/')
          ? host.remotePath
          : REMOTE_AGENT_PATH,
    )
    if (!remotePath.startsWith('/')) throw new AppError('invalid-input', 'The remote path must be absolute')
    const probe = this.remoteFileSystemFor({ target: host.target, remotePath })
    const probeInfo = await probe.stat({ targetKey: remotePath, displayPath: remotePath }).catch(() => null)
    if (!probeInfo || probeInfo.type !== 'directory') {
      throw new AppError('path-missing', `The remote directory does not exist: ${remotePath}`)
    }
    const hash = createHash('sha256').update(`${host.id}:${host.target}:${remotePath}`).digest('hex').slice(0, 12)
    const handle = join(this.dir, 'agent-workspaces', hash)
    await mkdir(handle, { recursive: true })
    const title = `Remote Agent (${mode}) · ${host.target}:${remotePath}`
    const workspace = await workspaceRegistry.create(handle, title)
    const preset = REMOTE_AGENT_MODES[mode]
    const record = {
      hostId: host.id,
      target: host.target,
      remotePath,
      path: workspace.path,
      mode,
      preset,
      sandbox: host.sandbox ?? null,
    }
    this.agentWorkspaces.set(workspace.id, record)
    await this.saveAgentWorkspaces()
    if (this.config.mirrorNativeTree) void this.syncAgentWorkspaceMirror(record)
    return {
      workspaceId: workspace.id,
      path: workspace.path,
      title: workspace.title,
      preset,
      mode,
      remotePath,
      target: host.target,
    }
  }

  async migrateAgentWorkspaceModes() {
    let changed = false
    for (const record of this.agentWorkspaces.values()) {
      const mode = normalizeRemoteMode(record.mode)
      const preset = REMOTE_AGENT_MODES[mode]
      if (record.mode !== mode || record.preset !== preset) {
        record.mode = mode
        record.preset = preset
        changed = true
      }
    }
    if (changed) await this.saveAgentWorkspaces()
  }

  installRemoteWorkspaceService() {
    if (this.remoteWorkspaceService) return
    const service = {
      resolve: (session) => this.resolveRemoteWorkspace(session),
      current: () => this.resolveCurrentRemoteWorkspace(),
      list: () => [...this.agentWorkspaces.entries()].map(([workspaceId, record]) => ({
        workspaceId,
        ...this.remoteWorkspaceBinding(workspaceId, record),
      })),
    }
    try {
      this.ctx.provide('remoteSshWorkspace', service)
      this.remoteWorkspaceService = service
      this.info('remoteSshWorkspace service installed')
    } catch (error) {
      this.warn(`could not provide remoteSshWorkspace: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  installClientPickerSelection() {
    const clientModules = this.ctx.get('clientModules')
    if (!clientModules || typeof clientModules.graph !== 'function') return
    const nativePicker = '@deepseek-ai/dsh-client-ui-directory-picker-native'
    const originalGraph = clientModules.graph
    const filter = (graph) => {
      if (!graph || typeof graph !== 'object') return graph
      const entries = Array.isArray(graph.entries)
        ? graph.entries.filter((entry) => entry?.id !== nativePicker)
        : graph.entries
      const batches = Array.isArray(graph.batches)
        ? graph.batches.map((batch) => {
          let url = batch?.url
          if (typeof url === 'string' && url.includes(nativePicker)) {
            const parts = url.split(',').filter((part) => !part.includes(nativePicker))
            url = parts.join(',')
          }
          const batchEntries = Array.isArray(batch?.entries)
            ? batch.entries.filter((id) => id !== nativePicker)
            : batch?.entries
          return { ...batch, url, entries: batchEntries }
        }).filter((batch) => !Array.isArray(batch.entries) || batch.entries.length > 0)
        : graph.batches
      return { ...graph, entries, batches }
    }
    try {
      clientModules.graph = function () {
        return filter(originalGraph.apply(this, arguments))
      }
      this.info('selected remote directory picker; native picker filtered from the client graph')
    } catch (error) {
      this.warn(`could not select the remote directory picker: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  installWorkspaceControllerBridge() {
    const workspaceController = this.ctx.get('workspaceController')
    if (!workspaceController || typeof workspaceController.create !== 'function') return
    const self = this
    const original = workspaceController.create
    const wrapper = async function (request) {
      const match = typeof request?.path === 'string'
        ? /^(?:[A-Za-z]:)?[\\/]+__dsh_remote_ssh__[\\/]+([a-f0-9]{8})[\\/]+([^\\/]+)[\\/]+(standard|ptc|minimal)$/.exec(request.path)
        : null
      if (match) {
        let remotePath
        try {
          remotePath = decodeURIComponent(match[2])
        } catch {
          return original.call(this, request)
        }
        const created = await self.createAgentWorkspace(match[1], remotePath, match[3])
        const now = new Date().toISOString()
        return {
          workspaceId: created.workspaceId,
          path: created.path,
          title: created.title,
          sessionIds: [],
          createdAt: now,
          updatedAt: now,
        }
      }
      return original.call(this, request)
    }
    try {
      workspaceController.create = wrapper
      if (workspaceController.create !== wrapper) {
        const proto = Object.getPrototypeOf(workspaceController)
        if (proto && typeof proto.create === 'function') proto.create = wrapper
      }
    } catch (error) {
      this.warn(`could not patch workspaceController.create: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  installAgentPresetCompatibility() {
    const presets = this.ctx.get('agentPresets')
    if (!presets) return
    const self = this
    const legacy = (id) => {
      if (typeof id !== 'string') return id
      if (id === 'remote-agent' || id === 'remote-agent-fs' || id.startsWith('remote-agent-fs-')) return 'standard'
      return id
    }
    const patch = (name, makeWrapper) => {
      const original = presets[name]
      if (typeof original !== 'function') return
      const wrapper = makeWrapper(original)
      try {
        presets[name] = wrapper
        if (presets[name] !== wrapper) {
          const proto = Object.getPrototypeOf(presets)
          if (proto && typeof proto[name] === 'function') proto[name] = wrapper
        }
      } catch (error) {
        self.warn(`could not patch agentPresets.${name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    patch('retain', (original) => async function (id, ...args) {
      return original.call(this, legacy(id), ...args)
    })
    patch('resolve', (original) => async function (id, ...args) {
      return original.call(this, legacy(id), ...args)
    })
    patch('readDocument', (original) => async function (id, ...args) {
      return original.call(this, legacy(id), ...args)
    })
    patch('mount', (original) => async function (context, id, ...args) {
      return original.call(this, context, legacy(id), ...args)
    })
    patch('select', (original) => async function (agent, id, ...args) {
      return original.call(this, agent, legacy(id), ...args)
    })
  }

  remoteWorkspaceBinding(workspaceId, record) {
    if (!record?.target || !record.remotePath) return null
    const mode = normalizeRemoteMode(record.mode)
    const host = this.hosts.find((candidate) => candidate.id === record.hostId)
    return {
      workspaceId,
      host: record.target,
      remotePath: record.remotePath,
      localPath: record.path ?? null,
      mode,
      preset: REMOTE_AGENT_MODES[mode],
      terminalType: remoteTerminalType(record.target, record.remotePath),
      sandbox: host?.sandbox === 'bwrap' || record.sandbox === 'bwrap' ? 'bwrap' : null,
    }
  }

  resolveRemoteWorkspace(session) {
    const cwd = session?.header?.cwd ?? session?.cwd
    if (typeof cwd !== 'string' || cwd === '') return null
    const key = localPathKey(cwd)
    let best = null
    for (const [workspaceId, record] of this.agentWorkspaces) {
      if (!record?.target || !record.remotePath || !record.path) continue
      const recordKey = localPathKey(record.path)
      if (recordKey === '' || (key !== recordKey && !key.startsWith(`${recordKey}/`))) continue
      if (!best || recordKey.length > best.recordKey.length) best = { workspaceId, record, recordKey }
    }
    if (!best) return null
    return this.remoteWorkspaceBinding(best.workspaceId, best.record)
  }

  resolveCurrentRemoteWorkspace() {
    try {
      const agents = this.ctx.get('agents')
      const agent = agents && typeof agents.currentInitiator === 'function' ? agents.currentInitiator() : null
      if (!agent) return null
      const sessions = this.ctx.get('sessions')
      const session = sessions && typeof sessions.get === 'function' ? sessions.get(agent.id) : null
      return this.resolveRemoteWorkspace(session)
    } catch {
      return null
    }
  }

  agentWorkspaceFor(request) {
    const registry = this.ctx.get('workspaceRegistry')
    let path = typeof request?.cwd === 'string' ? request.cwd : null
    if (!path && request?.workspaceId && typeof registry?.get === 'function') {
      path = registry.get(request.workspaceId)?.path ?? null
    }
    if (!path) return null
    const normalized = path.replace(/\\/g, '/').toLowerCase()
    for (const record of this.agentWorkspaces.values()) {
      if (record.path && record.path.replace(/\\/g, '/').toLowerCase() === normalized) return record
    }
    return null
  }

  listAgentWorkspaces() {
    const registry = this.ctx.get('workspaceRegistry')
    return [...this.agentWorkspaces.entries()].map(([workspaceId, record]) => ({
      workspaceId,
      title: registry?.get?.(workspaceId)?.title ?? `Remote Agent · ${record.target}:${record.remotePath}`,
      target: record.target,
      remotePath: record.remotePath,
      path: record.path,
      preset: record.preset ?? null,
      mode: normalizeRemoteMode(record.mode),
    }))
  }

  requireAgentWorkspace(id) {
    const record = this.agentWorkspaces.get(id)
    if (!record) throw new AppError('not-found', 'Remote Agent workspace not found')
    return record
  }

  async listRemoteDirs(body) {
    await this.ready
    const host = this.requireHost(body?.id)
    const requested = typeof body?.path === 'string' ? body.path.trim() : ''
    const path = posix.normalize(
      requested.startsWith('/')
        ? requested.replace(/\/+$/, '') || '/'
        : host.remotePath?.startsWith('/')
          ? host.remotePath
          : '/',
    )
    const fs = this.remoteFileSystemFor({ target: host.target, remotePath: path })
    const entries = await fs.listDir({ targetKey: path, displayPath: path })
    const directories = entries
      .filter((entry) => entry.type === 'directory')
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      path,
      home: host.remotePath?.startsWith('/') ? host.remotePath : path,
      entries: directories.slice(0, 2000).map((entry) => ({
        name: entry.name,
        path: posix.join(path, entry.name),
        type: 'directory',
      })),
      truncated: directories.length > 2000,
    }
  }

  async listAgentFiles(body) {
    const record = this.requireAgentWorkspace(body?.workspaceId)
    const fs = this.remoteFileSystemFor(record)
    const remote = this.remotePathForRecord(record, body?.path ?? '.')
    const entries = await fs.listDir({ targetKey: remote, displayPath: remote })
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return {
      workspaceId: body.workspaceId,
      target: record.target,
      remotePath: record.remotePath,
      path: remote,
      entries: entries.slice(0, 1000).map((entry) => ({
        name: entry.name,
        path: posix.join(remote, entry.name),
        type: entry.type === 'directory' ? 'directory' : entry.type === 'file' ? 'file' : 'other',
        size: entry.size,
      })),
      truncated: entries.length > 1000,
    }
  }

  async readAgentFile(body) {
    const record = this.requireAgentWorkspace(body?.workspaceId)
    const fs = this.remoteFileSystemFor(record)
    const remote = this.remotePathForRecord(record, body?.path ?? '')
    const info = await fs.stat({ targetKey: remote, displayPath: remote })
    if (!info) throw new AppError('not-found', `Remote file not found: ${remote}`)
    if (info.type !== 'file') throw new AppError('invalid-input', 'Only regular files can be previewed')
    const offset = Number.isSafeInteger(body?.offset) && body.offset >= 0 ? body.offset : 0
    const limit = Number.isSafeInteger(body?.limit) && body.limit > 0 ? Math.min(body.limit, 1000) : 200
    const start = offset + 1
    const end = start + limit - 1
    const result = await this.runRemoteBuffer(
      record,
      `sed -n '${start},${end}p' -- ${shellQuote(remote)}`,
      { maxBytes: 2 * 1024 * 1024, timeoutMs: 30_000 },
    )
    if (result.code !== 0) throw new AppError('ssh-error', `Cannot read ${remote}: ${result.stderr.trim() || result.code}`)
    const binary = result.stdout.subarray(0, 8192).includes(0)
    const text = binary ? '' : result.stdout.toString('utf8')
    return {
      workspaceId: body.workspaceId,
      path: remote,
      size: info.size,
      version: info.version,
      offset,
      text,
      binary,
      lines: text === '' ? 0 : text.split(/\r?\n/).length,
      truncated: result.stdout.length >= 2 * 1024 * 1024,
    }
  }

  async writeAgentFile(body) {
    const record = this.requireAgentWorkspace(body?.workspaceId)
    const fs = this.remoteFileSystemFor(record)
    const remote = this.remotePathForRecord(record, body?.path ?? '')
    if (!remote || remote === record.remotePath) throw new AppError('invalid-input', 'A file path is required')
    const content = typeof body?.content === 'string' ? body.content : ''
    if (content.length > 256 * 1024) throw new AppError('invalid-input', 'The editor only saves files up to 256 KB')
    const expected = typeof body?.version === 'string' && body.version !== ''
      ? { kind: 'replaceIfVersion', version: body.version }
      : undefined
    const result = await fs.writeText({ targetKey: remote, displayPath: remote }, content, expected)
    return {
      workspaceId: body.workspaceId,
      path: remote,
      version: result.version,
      operation: result.operation,
    }
  }

  async downloadAgentFile(body, signal) {
    const record = this.requireAgentWorkspace(body?.workspaceId)
    const fs = this.remoteFileSystemFor(record)
    const remote = this.remotePathForRecord(record, body?.path ?? '')
    const info = await fs.stat({ targetKey: remote, displayPath: remote })
    if (!info) throw new AppError('not-found', `Remote file not found: ${remote}`)
    if (info.type !== 'file') throw new AppError('invalid-input', 'Only regular files can be downloaded')
    const host = this.hosts.find((entry) => entry.target === record.target) ?? {
      target: record.target,
      port: null,
      identityFile: '',
    }
    const args = sshInvocation(host, wrapPosix(`cat -- ${shellQuote(remote)}`), {
      connectTimeoutSec: this.config.connectTimeoutSec,
      batchMode: true,
    })
    const child = spawn(this.config.sshExecutable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let closed = false
    const abort = () => {
      if (!closed) child.kill()
    }
    signal?.addEventListener?.('abort', abort, { once: true })
    const stream = new ReadableStream({
      start(controller) {
        child.stdout.on('data', (chunk) => {
          if (!closed) controller.enqueue(new Uint8Array(chunk))
        })
        child.stderr.on('data', () => {})
        child.once('error', (error) => {
          if (closed) return
          closed = true
          controller.error(error)
        })
        child.once('close', (code) => {
          if (closed) return
          closed = true
          signal?.removeEventListener?.('abort', abort)
          if (code === 0) controller.close()
          else controller.error(new Error(`remote download exited with code ${code ?? 'unknown'}`))
        })
      },
      cancel() {
        closed = true
        child.kill()
      },
    })
    const filename = posix.basename(remote).replace(/["\r\n]/g, '_')
    return new Response(stream, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(info.size),
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  }

  workspaceRecordForRoot(root) {
    if (typeof root !== 'string') return null
    const normalized = root.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    for (const record of this.agentWorkspaces.values()) {
      const local = record.path?.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
      if (local && (normalized === local || normalized.startsWith(`${local}/`))) return record
    }
    return null
  }

  workspaceRecordForPath(value) {
    if (typeof value !== 'string' || value === '') return null
    const normalized = value.replace(/\\/g, '/')
    const lower = normalized.toLowerCase()
    for (const record of this.agentWorkspaces.values()) {
      const local = record.path?.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
      const remote = record.remotePath.replace(/\/+$/, '')
      if (local && (lower === local || lower.startsWith(`${local}/`))) return record
      if (lower === remote.toLowerCase() || lower.startsWith(`${remote.toLowerCase()}/`)) return record
    }
    return null
  }

  workspaceRecordForTarget(target) {
    return this.workspaceRecordForPath(target?.targetKey) ?? this.workspaceRecordForRoot(target?.displayPath)
  }

  remoteTargetForRecord(record, value) {
    const remote = this.remotePathForRecord(record, value)
    return { targetKey: remote, displayPath: remote }
  }

  mirrorRootForRecord(record) {
    const base = join(this.dir, 'agent-workspaces')
    const root = record?.path
    if (typeof root !== 'string') return null
    const normalizedBase = base.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    const normalizedRoot = root.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
    if (normalizedRoot === normalizedBase || !normalizedRoot.startsWith(`${normalizedBase}/`)) return null
    return root
  }

  runRemoteBuffer(record, script, options = {}) {
    const host = this.hosts.find((entry) => entry.target === record.target) ?? {
      target: record.target,
      port: null,
      identityFile: '',
    }
    const args = sshInvocation(host, wrapPosix(script), {
      connectTimeoutSec: this.config.connectTimeoutSec,
      batchMode: true,
    })
    const maxBytes = options.maxBytes ?? 128 * 1024 * 1024
    const timeoutMs = options.timeoutMs ?? 180_000
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.sshExecutable, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const stdout = []
      const stderr = []
      let stdoutBytes = 0
      let stderrText = ''
      let settled = false
      let timedOut = false
      const finish = (error, code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve({ code, stdout: Buffer.concat(stdout), stderr: stderrText, timedOut })
      }
      const timer = setTimeout(() => {
        timedOut = true
        child.kill()
        finish(new Error('remote file listing timed out'))
      }, timeoutMs)
      timer.unref?.()
      child.stdout.on('data', (chunk) => {
        stdoutBytes += chunk.length
        if (stdoutBytes > maxBytes) {
          child.kill()
          finish(new Error(`remote output exceeded ${maxBytes} bytes`))
          return
        }
        stdout.push(chunk)
      })
      child.stderr.on('data', (chunk) => {
        stderrText = (stderrText + chunk.toString('utf8')).slice(-8192)
      })
      child.once('error', (error) => finish(error))
      child.once('close', (code) => finish(null, code))
    })
  }

  async extractTarBuffer(buffer, staging, counters) {
    let offset = 0
    let longName = null
    while (offset + 512 <= buffer.length) {
      const header = buffer.subarray(offset, offset + 512)
      if (header.every((value) => value === 0)) break
      const rawName = header.toString('utf8', 0, 100).replace(/\0[\s\S]*$/, '').trim()
      const sizeText = header.toString('ascii', 124, 136).replace(/\0[\s\S]*$/, '').trim()
      const size = Number.parseInt(sizeText || '0', 8)
      const type = String.fromCharCode(header[156] || 48)
      const rawPrefix = header.toString('utf8', 345, 500).replace(/\0[\s\S]*$/, '').trim()
      const dataStart = offset + 512
      const dataEnd = dataStart + (Number.isFinite(size) ? size : 0)
      const padded = dataStart + Math.ceil((Number.isFinite(size) ? size : 0) / 512) * 512
      if (type === 'L') {
        longName = buffer.toString('utf8', dataStart, dataEnd).replace(/\0[\s\S]*$/, '')
        offset = padded
        continue
      }
      if (type === 'x') {
        const pax = buffer.toString('utf8', dataStart, dataEnd)
        const match = pax.match(/(?:^|\n)\d+ path=([^\n]+)/)
        if (match) longName = match[1]
        offset = padded
        continue
      }
      const fullName = longName ?? (rawPrefix ? `${rawPrefix}/${rawName}` : rawName)
      longName = null
      const relative = fullName.replace(/^\.\/+/, '')
      if (!relative || relative.split('/').includes('..')) {
        offset = padded
        continue
      }
      const destination = join(staging, relative)
      const normalizedStaging = staging.endsWith('\\') ? staging : `${staging}\\`
      if (!destination.startsWith(normalizedStaging)) {
        offset = padded
        continue
      }
      if (type === '5') {
        await mkdir(destination, { recursive: true })
      } else if (type === '0' || type === '\0') {
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, buffer.subarray(dataStart, dataEnd))
        counters.contentFiles += 1
      }
      offset = padded
    }
  }

  async syncAgentWorkspaceMirror(record) {
    if (!this.config.mirrorNativeTree) return
    const root = this.mirrorRootForRecord(record)
    if (!root || this.mirrorSyncs.has(root)) return
    this.mirrorSyncs.add(root)
    const staging = `${root}.sync`
    try {
      await rm(staging, { recursive: true, force: true })
      await mkdir(staging, { recursive: true })
      const manifest = await this.runRemoteBuffer(
        record,
        `cd -- ${shellQuote(record.remotePath)} && find . -mindepth 1 \\( -name .snakemake -o -name .cache -o -name .git -o -name node_modules -o -name .venv -o -name __pycache__ \\) -prune -o -printf '%y|%s|%p\\n'`,
        { maxBytes: 8 * 1024 * 1024, timeoutMs: 60_000 },
      )
      if (manifest.code !== 0) throw new Error(`remote find failed: ${manifest.stderr.trim() || manifest.code}`)
      const counters = { entries: 0, contentFiles: 0 }
      for (const line of manifest.stdout.toString('utf8').split(/\r?\n/)) {
        if (line === '') continue
        const first = line.indexOf('|')
        const second = line.indexOf('|', first + 1)
        if (first < 0 || second < 0) continue
        const kind = line.slice(0, first)
        const size = Number(line.slice(first + 1, second))
        const relative = line.slice(second + 1).replace(/^\.\/+/, '')
        if (!relative || relative.split('/').includes('..')) continue
        if (/[<>:"|?*\u0000-\u001f]/.test(relative)) continue
        const destination = join(staging, relative)
        counters.entries += 1
        try {
          if (kind === 'd') {
            await mkdir(destination, { recursive: true })
          } else {
            await mkdir(dirname(destination), { recursive: true })
            await writeFile(destination, '', { mode: 0o644 })
          }
        } catch (error) {
          this.warn(`skipped mirror entry ${relative}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const tar = this.config.mirrorContent === false
        ? null
        : await this.runRemoteBuffer(
          record,
          `cd -- ${shellQuote(record.remotePath)} && find . -type f -size -${MIRROR_CONTENT_MAX}c -print0 | tar --null -T - -cf - 2>/dev/null`,
          { maxBytes: MIRROR_CONTENT_MAX * 8, timeoutMs: 180_000 },
        )
      if (tar) {
        if (tar.code !== 0) throw new Error(`remote tar failed: ${tar.stderr.trim() || tar.code}`)
        await this.extractTarBuffer(tar.stdout, staging, counters)
      }
      await mkdir(root, { recursive: true })
      for (const entry of await readdir(root).catch(() => [])) {
        await rm(join(root, entry), { recursive: true, force: true }).catch(() => {})
      }
      for (const entry of await readdir(staging).catch(() => [])) {
        await rename(join(staging, entry), join(root, entry)).catch(() => {})
      }
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      await writeFile(join(this.dir, 'mirror-sync.json'), JSON.stringify({
        at: new Date().toISOString(),
        target: record.target,
        remotePath: record.remotePath,
        localPath: root,
        entries: counters.entries,
        contentFiles: counters.contentFiles,
        contentMax: MIRROR_CONTENT_MAX,
      }, null, 2), { mode: 0o600 }).catch(() => {})
      await rm(join(this.dir, 'mirror-error.json'), { force: true }).catch(() => {})
      this.info(`mirrored ${counters.entries} remote entries (${counters.contentFiles} with content) into ${root}`)
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      this.warn(`mirror sync failed: ${error instanceof Error ? error.message : String(error)}`)
      await writeFile(join(this.dir, 'mirror-error.json'), JSON.stringify({
        at: new Date().toISOString(),
        target: record?.target ?? null,
        remotePath: record?.remotePath ?? null,
        localPath: root,
        error: error instanceof Error ? error.message : String(error),
      }, null, 2), { mode: 0o600 }).catch(() => {})
    } finally {
      this.mirrorSyncs.delete(root)
    }
  }

  syncAllAgentWorkspaceMirrors() {
    if (!this.config.mirrorNativeTree) return
    for (const record of this.agentWorkspaces.values()) void this.syncAgentWorkspaceMirror(record)
  }

  async clearAgentWorkspaceMirrors() {
    if (this.config.mirrorNativeTree) return
    for (const record of this.agentWorkspaces.values()) {
      const root = this.mirrorRootForRecord(record)
      if (!root) continue
      try {
        await rm(root, { recursive: true, force: true })
        await mkdir(root, { recursive: true })
      } catch (error) {
        this.warn(`could not clear mirrored workspace: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    await writeFile(join(this.dir, 'mirror-sync.json'), JSON.stringify({
      disabled: true,
      at: new Date().toISOString(),
      reason: 'Remote Files panel is the source of truth; local handle mirror is disabled.',
    }, null, 2), { mode: 0o600 }).catch(() => {})
  }

  remoteFileSystemFor(record) {
    const key = `${record.target}\0${record.remotePath}`
    let service = this.remoteFileSystems.get(key)
    if (!service) {
      service = createRemoteFileSystem({
        host: record.target,
        remotePath: record.remotePath,
        connectTimeoutSec: this.config.connectTimeoutSec,
        sshExecutable: this.config.sshExecutable,
      })
      this.remoteFileSystems.set(key, service)
    }
    return service
  }

  remotePathForRecord(record, value) {
    const raw = typeof value === 'string' && value.trim() !== '' ? value.replace(/\\/g, '/') : '.'
    if (raw.startsWith('/')) return posix.normalize(raw)
    const local = record.path.replace(/\\/g, '/').toLowerCase()
    const lower = raw.toLowerCase()
    if (lower === local || lower.startsWith(`${local}/`)) {
      const rel = raw.slice(record.path.replace(/\\/g, '/').length).replace(/^\/+/, '')
      return posix.normalize(posix.join(record.remotePath, rel || '.'))
    }
    return posix.normalize(posix.join(record.remotePath, raw))
  }

  async fileReferenceCwd(agent) {
    const session = agent?.session
    return session?.header?.cwd ?? session?.cwd ?? null
  }

  recordFileSurfaceCall(method, scopeRoot, path, record) {
    try {
      this.fileSurfaceCalls.push({
        at: new Date().toISOString(),
        method,
        scopeRoot: typeof scopeRoot === 'string' ? scopeRoot : null,
        path: typeof path === 'string' ? path : null,
        matched: Boolean(record),
        remotePath: record ? this.remotePathForRecord(record, path) : null,
      })
      if (this.fileSurfaceCalls.length > 50) this.fileSurfaceCalls.shift()
      void writeFile(join(this.dir, 'file-surface-calls.json'), JSON.stringify(this.fileSurfaceCalls, null, 2), { mode: 0o600 }).catch(() => {})
    } catch {
      // diagnostics must never break a file read
    }
  }

  formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size'
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} bytes`
  }

  async ensureRemoteReadApproval(scope, remote, size, signal) {
    if (!Number.isFinite(size) || size <= LARGE_READ_APPROVAL) return
    const agents = this.ctx.get('agents')
    const agent = agents?.get?.(scope?.sessionId)
      ?? agents?.list?.().find((candidate) => {
        const cwd = candidate?.session?.header?.cwd
        return this.workspaceRecordForRoot(cwd)
      })
    if (!agent) return
    const approval = this.ctx.get('approval')
    if (!approval) return
    const outcome = await approval.request({
      agent,
      toolName: 'read',
      callId: `remote-large-file-${randomUUID()}`,
      reason: `Large remote file (${this.formatBytes(size)}): sync ${remote} and show its content? This may take time and memory.`,
      signal,
    })
    if (outcome !== 'allowed-once') {
      throw Object.assign(new Error(`Reading ${remote} was not approved (${outcome})`), { code: 'FS_APPROVAL_DENIED' })
    }
  }

  installFileSurfaceBridges() {
    if (this.disposed || this.fileSurfaceBridges) return
    const workspaceFiles = this.ctx.get('workspaceFiles')
    const fileReferences = this.ctx.get('fileReferences')
    const fsService = this.ctx.get('fs')
    const directoryPicker = this.ctx.get('directoryPickerController')
    const self = this
    const bridge = { workspaceFiles: workspaceFiles ?? null, fileReferences: fileReferences ?? null, fs: fsService ?? null, directoryPicker: directoryPicker ?? null, restores: [] }
    const patch = (service, name, wrapper) => {
      if (!service) return
      const proto = Object.getPrototypeOf(service)
      const target = typeof proto?.[name] === 'function' ? proto : service
      if (typeof target[name] !== 'function') return
      const original = target[name]
      target[name] = wrapper(original)
      bridge.restores.push(() => {
        try {
          target[name] = original
        } catch {
          // best-effort restore
        }
      })
    }

    patch(workspaceFiles, 'read', (original) => async function (scope, path, range, signal) {
      const record = self.workspaceRecordForRoot(scope?.workspaceRoot)
      self.recordFileSurfaceCall('read', scope?.workspaceRoot, path, record)
      if (!record) return original.apply(this, [scope, path, range, signal])
      const fs = self.remoteFileSystemFor(record)
      const remote = self.remotePathForRecord(record, path)
      const info = await fs.stat({ targetKey: remote, displayPath: remote }, signal)
      if (!info) throw Object.assign(new Error(`cannot read "${remote}": not found`), { code: 'FS_NOT_FOUND' })
      await self.ensureRemoteReadApproval(scope, remote, info.size, signal)
      const content = await fs.readText({ targetKey: remote, displayPath: remote }, signal)
      const lines = content.split(/\r?\n/)
      const offset = Number.isSafeInteger(range?.offset) && range.offset >= 0 ? range.offset : 0
      const limit = Number.isSafeInteger(range?.limit) && range.limit > 0 ? range.limit : 2000
      const page = lines.slice(offset, offset + limit)
      return {
        absolutePath: remote,
        version: info.version,
        bytes: info.size,
        offset,
        text: page.join('\n'),
        lines: page.length,
        eof: offset + page.length >= lines.length,
      }
    })

    patch(workspaceFiles, 'stat', (original) => async function (scope, path, signal) {
      const record = self.workspaceRecordForRoot(scope?.workspaceRoot)
      self.recordFileSurfaceCall('stat', scope?.workspaceRoot, path, record)
      if (!record) return original.apply(this, [scope, path, signal])
      const fs = self.remoteFileSystemFor(record)
      const remote = self.remotePathForRecord(record, path)
      const info = await fs.stat({ targetKey: remote, displayPath: remote }, signal)
      if (!info) throw Object.assign(new Error(`cannot stat "${remote}": not found`), { code: 'FS_NOT_FOUND' })
      return { absolutePath: remote, version: info.version, bytes: info.size }
    })

    patch(workspaceFiles, 'list', (original) => async function (scope, path, signal) {
      const record = self.workspaceRecordForRoot(scope?.workspaceRoot)
      self.recordFileSurfaceCall('list', scope?.workspaceRoot, path, record)
      if (!record) return original.apply(this, [scope, path, signal])
      const fs = self.remoteFileSystemFor(record)
      const remote = self.remotePathForRecord(record, path)
      const entries = await fs.listDir({ targetKey: remote, displayPath: remote }, signal)
      entries.sort((a, b) => a.name.localeCompare(b.name))
      const truncated = entries.length > 1000
      return {
        path: remote,
        entries: entries.slice(0, 1000).map((entry) => ({
          name: entry.name,
          type: entry.type === 'directory' ? 'directory' : entry.type === 'file' ? 'file' : 'other',
          ...(Number.isFinite(entry.size) ? { size: entry.size } : {}),
        })),
        truncated,
      }
    })

    patch(workspaceFiles, 'readBytes', (original) => async function (scope, path, options, signal) {
      const record = self.workspaceRecordForRoot(scope?.workspaceRoot)
      self.recordFileSurfaceCall('readBytes', scope?.workspaceRoot, path, record)
      if (!record) return original.apply(this, [scope, path, options, signal])
      const fs = self.remoteFileSystemFor(record)
      const remote = self.remotePathForRecord(record, path)
      const info = await fs.stat({ targetKey: remote, displayPath: remote }, signal)
      if (!info) throw Object.assign(new Error(`cannot read "${remote}": not found`), { code: 'FS_NOT_FOUND' })
      await self.ensureRemoteReadApproval(scope, remote, info.size, signal)
      const range = options?.range
      const data = range
        ? await fs.readByteRange({ targetKey: remote, displayPath: remote }, { offset: range.offset ?? 0, length: range.length ?? 64 * 1024 }, signal)
        : await fs.readBytes({ targetKey: remote, displayPath: remote }, signal, 128 * 1024 * 1024)
      const offset = range?.offset ?? 0
      return {
        absolutePath: remote,
        version: info.version,
        bytes: info.size,
        offset,
        data,
        eof: range ? offset + data.length >= info.size : true,
      }
    })

    patch(workspaceFiles, 'changes', (original) => function (scope, path, signal) {
      const record = self.workspaceRecordForRoot(scope?.workspaceRoot)
      self.recordFileSurfaceCall('changes', scope?.workspaceRoot, path, record)
      if (!record) return original.apply(this, [scope, path, signal])
      const fs = self.remoteFileSystemFor(record)
      const remote = self.remotePathForRecord(record, path)
      return (async function* () {
        yield { kind: 'ready' }
        let last = (await fs.stat({ targetKey: remote, displayPath: remote }, signal))?.version ?? null
        while (!signal?.aborted) {
          await delay(1000)
          if (signal?.aborted) return
          let info = null
          try {
            info = await fs.stat({ targetKey: remote, displayPath: remote }, signal)
          } catch {
            continue
          }
          if ((info?.version ?? null) !== last) {
            last = info?.version ?? null
            yield {
              kind: 'change',
              change: info
                ? { absolutePath: remote, version: info.version }
                : { absolutePath: remote, absent: true },
            }
          }
        }
      })()
    })

    patch(fileReferences, 'list', (original) => async function (agent, query, signal) {
      const cwd = await self.fileReferenceCwd(agent)
      const record = self.workspaceRecordForRoot(cwd)
      self.recordFileSurfaceCall('fileReferences', cwd, query, record)
      if (!record) return original.apply(this, [agent, query, signal])
      const fs = self.remoteFileSystemFor(record)
      let text = String(query ?? '').replace(/^@/, '').replace(/^"/, '').replace(/"$/, '').replace(/\\/g, '/')
      if (text.startsWith('/')) text = text.slice(1)
      const slash = text.lastIndexOf('/')
      let dir = slash >= 0 ? text.slice(0, slash) : ''
      let prefix = slash >= 0 ? text.slice(slash + 1) : text
      if (text.endsWith('/')) {
        dir = text.slice(0, -1)
        prefix = ''
      }
      const remoteDir = posix.normalize(posix.join(record.remotePath, dir || '.'))
      const entries = await fs.listDir({ targetKey: remoteDir, displayPath: remoteDir }, signal)
      return entries
        .filter((entry) => entry.name.toLowerCase().startsWith(prefix.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 100)
        .map((entry) => ({
          path: dir ? posix.join(dir, entry.name) : entry.name,
          kind: entry.type === 'directory' ? 'directory' : 'file',
        }))
    })

    patch(directoryPicker, 'list', (original) => async function (path, signal) {
      const record = self.workspaceRecordForPath(path)
      self.recordFileSurfaceCall('directoryPicker.list', path, path, record)
      if (!record) return original.apply(this, [path, signal])
      const fs = self.remoteFileSystemFor(record)
      const remote = self.remotePathForRecord(record, path)
      const entries = await fs.listDir({ targetKey: remote, displayPath: remote })
      entries.sort((a, b) => a.name.localeCompare(b.name))
      return {
        path: remote,
        home: record.remotePath,
        crumbs: [],
        entries: entries.slice(0, 1000).map((entry) => ({
          name: entry.name,
          path: posix.join(remote, entry.name),
          hidden: entry.name.startsWith('.'),
        })),
        truncated: entries.length > 1000,
      }
    })

    patch(fsService, 'resolve', (original) => async function (path, opts) {
      const record = self.workspaceRecordForPath(path) ?? self.workspaceRecordForRoot(opts?.cwd)
      self.recordFileSurfaceCall('fs.resolve', opts?.cwd, path, record)
      if (!record) return original.apply(this, [path, opts])
      return self.remoteTargetForRecord(record, path)
    })

    patch(fsService, 'stat', (original) => async function (target, signal) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.stat', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, signal])
      const fs = self.remoteFileSystemFor(record)
      const info = await fs.stat(self.remoteTargetForRecord(record, target.targetKey), signal)
      return info ? { ...info, mode: info.type === 'directory' ? 0o755 : 0o644 } : undefined
    })

    patch(fsService, 'lstat', (original) => async function (path, opts, signal) {
      const record = self.workspaceRecordForPath(path) ?? self.workspaceRecordForRoot(opts?.cwd)
      self.recordFileSurfaceCall('fs.lstat', opts?.cwd, path, record)
      if (!record) return original.apply(this, [path, opts, signal])
      const fs = self.remoteFileSystemFor(record)
      const info = await fs.lstat(self.remoteTargetForRecord(record, path), signal)
      return info ? { ...info, mode: info.type === 'directory' ? 0o755 : 0o644 } : undefined
    })

    patch(fsService, 'readText', (original) => async function (target, signal) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.readText', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, signal])
      const fs = self.remoteFileSystemFor(record)
      return fs.readText(self.remoteTargetForRecord(record, target.targetKey), signal)
    })

    patch(fsService, 'readBytes', (original) => async function (target, signal, maxBytes) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.readBytes', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, signal, maxBytes])
      const fs = self.remoteFileSystemFor(record)
      return fs.readBytes(self.remoteTargetForRecord(record, target.targetKey), signal, Math.max(Number.isFinite(maxBytes) ? maxBytes : 0, 128 * 1024 * 1024))
    })

    patch(fsService, 'readByteRange', (original) => async function (target, range, signal) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.readByteRange', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, range, signal])
      const fs = self.remoteFileSystemFor(record)
      return fs.readByteRange(self.remoteTargetForRecord(record, target.targetKey), range, signal)
    })

    patch(fsService, 'listDir', (original) => async function (target, signal) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.listDir', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, signal])
      const fs = self.remoteFileSystemFor(record)
      const entries = await fs.listDir(self.remoteTargetForRecord(record, target.targetKey), signal)
      entries.sort((a, b) => a.name.localeCompare(b.name))
      return entries
    })

    patch(fsService, 'watch', (original) => async function (target, changed, signal) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.watch', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, changed, signal])
      const fs = self.remoteFileSystemFor(record)
      return fs.watch(self.remoteTargetForRecord(record, target.targetKey), changed, signal)
    })

    patch(fsService, 'writeText', (original) => async function (target, content, expected, signal, sandboxPolicy) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.writeText', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, content, expected, signal, sandboxPolicy])
      const fs = self.remoteFileSystemFor(record)
      return fs.writeText(self.remoteTargetForRecord(record, target.targetKey), content, expected, signal)
    })

    patch(fsService, 'editText', (original) => async function (target, edit, expected, signal, sandboxPolicy) {
      const record = self.workspaceRecordForTarget(target)
      self.recordFileSurfaceCall('fs.editText', target?.targetKey, target?.targetKey, record)
      if (!record) return original.apply(this, [target, edit, expected, signal, sandboxPolicy])
      const fs = self.remoteFileSystemFor(record)
      return fs.editText(self.remoteTargetForRecord(record, target.targetKey), edit, expected, signal)
    })

    patch(fsService, 'processPath', (original) => function (target) {
      const record = self.workspaceRecordForTarget(target)
      if (!record) return original.apply(this, [target])
      return self.remotePathForRecord(record, target.targetKey)
    })

    patch(fsService, 'processPathFromHostPath', (original) => function (hostPath) {
      const record = self.workspaceRecordForPath(hostPath)
      if (!record) return original.apply(this, [hostPath])
      return self.remotePathForRecord(record, hostPath)
    })

    patch(fsService, 'contains', (original) => function (parent, child) {
      const parentRecord = self.workspaceRecordForTarget(parent)
      const childRecord = self.workspaceRecordForTarget(child)
      if (!parentRecord || !childRecord || parentRecord !== childRecord) return original.apply(this, [parent, child])
      const fs = self.remoteFileSystemFor(parentRecord)
      return fs.contains(self.remoteTargetForRecord(parentRecord, parent.targetKey), self.remoteTargetForRecord(childRecord, child.targetKey))
    })

    this.fileSurfaceBridges = bridge
    if (workspaceFiles || fileReferences) this.info('workspace file surfaces bridged to remote filesystems')
  }

  uninstallFileSurfaceBridges() {
    const bridge = this.fileSurfaceBridges
    if (!bridge) return
    this.fileSurfaceBridges = null
    for (const restore of bridge.restores.reverse()) restore()
    bridge.restores.length = 0
    this.remoteFileSystems.clear()
  }

  ensureServiceBridge() {
    if (this.disposed) return null
    if (this.serviceBridge) return this.serviceBridge
    if (this.config.bridgePrompts === false) return null
    const sessionController = this.ctx.get('sessionController')
    if (!sessionController || typeof sessionController.prompt !== 'function') return null
    this.installServiceBridge(sessionController)
    return this.serviceBridge
  }

  installServiceBridge(sessionController) {
    const self = this
    const proto = Object.getPrototypeOf(sessionController)
    const hadOwnPrompt = Object.prototype.hasOwnProperty.call(sessionController, 'prompt')
    const originalOwnPrompt = hadOwnPrompt ? sessionController.prompt : null
    const originalPrompt = sessionController.prompt ?? proto.prompt
    const originalList = sessionController.list ?? proto.list
    const hadOwnCreate = Object.prototype.hasOwnProperty.call(sessionController, 'create')
    const originalOwnCreate = hadOwnCreate ? sessionController.create : null
    const originalCreate = sessionController.create ?? proto.create
    const hadOwnCancel = Object.prototype.hasOwnProperty.call(sessionController, 'cancel')
    const originalOwnCancel = hadOwnCancel ? sessionController.cancel : null
    const originalCancel = sessionController.cancel ?? proto.cancel
    const promptWrapper = async function (request, signal) {
      return originalPrompt.apply(this, [request, signal])
    }
    const createWrapper = typeof originalCreate === 'function'
      ? async function (request) {
        await self.ready
        const agentWorkspace = self.agentWorkspaceFor(request)
        if (agentWorkspace) {
          const preset = typeof agentWorkspace.preset === 'string' && agentWorkspace.preset !== ''
            ? agentWorkspace.preset
            : REMOTE_AGENT_MODES[normalizeRemoteMode(agentWorkspace.mode)]
          return originalCreate.call(this, { ...request, agentPreset: preset })
        }
        const requestedPreset = typeof request.agentPreset === 'string' ? request.agentPreset : ''
        const remotePreset = Object.values(REMOTE_AGENT_MODES).includes(requestedPreset)
          || requestedPreset.startsWith('remote-agent-fs-')
          || requestedPreset === 'remote-agent'
          || requestedPreset === 'remote-agent-fs'
        if (remotePreset) {
          return originalCreate.call(this, { ...request, agentPreset: 'standard' })
        }
        return originalCreate.call(this, request)
      }
      : null
    const cancelWrapper = typeof originalCancel === 'function'
      ? async function (request) {
        return originalCancel.call(this, request)
      }
      : null
    const listWrapper = null

    let patchedPrompt = false
    let patchedList = false
    let promptWritable = false
    let listWritable = false
    let protoPromptPatched = false
    let protoListPatched = false
    try {
      const descriptor = Object.getOwnPropertyDescriptor(sessionController, 'prompt')
      promptWritable = descriptor === undefined || descriptor.writable !== false
      sessionController.prompt = promptWrapper
      patchedPrompt = sessionController.prompt === promptWrapper
    } catch {
      patchedPrompt = false
    }
    try {
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'prompt')
      promptWritable = promptWritable || descriptor === undefined || descriptor.writable !== false
      if (proto !== Object.prototype && proto.prompt !== promptWrapper) {
        proto.prompt = promptWrapper
        protoPromptPatched = proto.prompt === promptWrapper
      }
      patchedPrompt = patchedPrompt || protoPromptPatched
    } catch {
      protoPromptPatched = false
    }
    if (!patchedPrompt) this.warn('remote bridge could not patch sessionController.prompt; prompt routing is inactive')
    if (listWrapper) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(sessionController, 'list')
        listWritable = descriptor === undefined || descriptor.writable !== false
        sessionController.list = listWrapper
        patchedList = sessionController.list === listWrapper
      } catch {
        patchedList = false
      }
      try {
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'list')
        listWritable = listWritable || descriptor === undefined || descriptor.writable !== false
        if (proto !== Object.prototype && proto.list !== listWrapper) {
          proto.list = listWrapper
          protoListPatched = proto.list === listWrapper
        }
        patchedList = patchedList || protoListPatched
      } catch {
        protoListPatched = false
      }
    }
    let patchedCreate = false
    let protoCreatePatched = false
    let createWritable = false
    if (createWrapper) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(sessionController, 'create')
        createWritable = descriptor === undefined || descriptor.writable !== false
        sessionController.create = createWrapper
        patchedCreate = sessionController.create === createWrapper
      } catch {
        patchedCreate = false
      }
      try {
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'create')
        createWritable = createWritable || descriptor === undefined || descriptor.writable !== false
        if (proto !== Object.prototype && proto.create !== createWrapper) {
          proto.create = createWrapper
          protoCreatePatched = proto.create === createWrapper
        }
        patchedCreate = patchedCreate || protoCreatePatched
      } catch {
        protoCreatePatched = false
      }
    }
    let patchedCancel = false
    let protoCancelPatched = false
    let cancelWritable = false
    if (cancelWrapper) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(sessionController, 'cancel')
        cancelWritable = descriptor === undefined || descriptor.writable !== false
        sessionController.cancel = cancelWrapper
        patchedCancel = sessionController.cancel === cancelWrapper
      } catch {
        patchedCancel = false
      }
      try {
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'cancel')
        cancelWritable = cancelWritable || descriptor === undefined || descriptor.writable !== false
        if (proto !== Object.prototype && proto.cancel !== cancelWrapper) {
          proto.cancel = cancelWrapper
          protoCancelPatched = proto.cancel === cancelWrapper
        }
        patchedCancel = patchedCancel || protoCancelPatched
      } catch {
        protoCancelPatched = false
      }
    }
    this.serviceBridge = {
      sessionController,
      proto,
      hadOwnPrompt,
      originalOwnPrompt,
      originalPrompt,
      originalList,
      hadOwnCreate,
      originalOwnCreate,
      originalCreate,
      hadOwnCancel,
      originalOwnCancel,
      originalCancel,
      patchedPrompt,
      patchedList,
      patchedCreate,
      patchedCancel,
      protoPromptPatched,
      protoListPatched,
      protoCreatePatched,
      protoCancelPatched,
    }
    const status = {
      at: new Date().toISOString(),
      patchedPrompt,
      patchedList,
      patchedCreate,
      patchedCancel,
      protoPromptPatched,
      protoListPatched,
      protoCreatePatched,
      protoCancelPatched,
      promptWritable,
      listWritable,
      createWritable,
      cancelWritable,
      hasList: typeof originalList === 'function',
    }
    void writeFile(join(this.dir, 'bridge.json'), JSON.stringify(status, null, 2), { mode: 0o600 }).catch(() => {})
    if (patchedPrompt) void this.probeGateway()
  }

  async probeGateway() {
    if (this.gatewayProbeAttempted || this.disposed) return
    this.gatewayProbeAttempted = true
    const connection = this.ctx.get('connection')
    if (!connection || typeof connection.createSharedFetchHandler !== 'function' || typeof connection.createPeer !== 'function') {
      return
    }
    const probe = { at: new Date().toISOString(), list: null, prompt: null, reachedWrapper: false }
    let peer = null
    try {
      peer = connection.createPeer({ principal: { kind: 'owner' }, interactions: 'answer' })
      const handler = connection.createSharedFetchHandler('/api')
      const listResponse = await handler.fetch(new Request('http://localhost/api/session/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'rs-gateway-probe-list',
          method: 'session/list',
          payload: { args: { _request: {} } },
        }),
      }), peer)
      const listBody = await listResponse.json()
      const listValue = listBody?.result?.ok ? listBody.result.value : null
      const mirror = listValue?.items?.find((item) => this.isMirrorSession(item.sessionId))
      probe.list = {
        ok: listBody?.result?.ok === true,
        count: Array.isArray(listValue?.items) ? listValue.items.length : null,
        mirrorTitle: mirror?.projections?.values?.title ?? null,
        mirrorAgentAvailable: mirror?.agentAvailable ?? null,
      }

      const mirrorId = [...this.mirrorRecords.keys()][0]
      if (mirrorId) {
        const before = this.promptCount
        const promptResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'rs-gateway-probe-prompt',
            method: 'session/prompt',
            payload: {
              args: {
                request: {
                  requestId: 'rs-gateway-probe',
                  sessionId: mirrorId,
                  mode: 'queue',
                  content: [{ type: 'text', text: ' ' }],
                },
              },
            },
          }),
        }), peer)
        const promptBody = await promptResponse.json()
        this.promptCount = before
        const error = promptBody?.result?.ok === false ? promptBody.result.error : null
        probe.prompt = { ok: promptBody?.result?.ok === true, code: error?.code ?? null, message: error?.message ?? null }
        probe.reachedWrapper = typeof error?.message === 'string'
          && error.message.includes('remote bridge currently accepts text prompts only')

        if (LIVE_BRIDGE_PROBE && !this.liveProbeAttempted) {
          this.liveProbeAttempted = true
          const liveResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'rs-gateway-live-probe',
              method: 'session/prompt',
              payload: {
                args: {
                  request: {
                    requestId: 'rs-gateway-live-probe',
                    sessionId: mirrorId,
                    mode: 'queue',
                    content: [{ type: 'text', text: '[bridge self-test] hi' }],
                  },
                },
              },
            }),
          }), peer)
          const liveBody = await liveResponse.json()
          const liveError = liveBody?.result?.ok === false ? liveBody.result.error : null
          probe.livePrompt = {
            ok: liveBody?.result?.ok === true,
            code: liveError?.code ?? null,
            message: liveError?.message ?? null,
            promptCount: this.promptCount,
          }
        }

        if (CREATE_BRIDGE_PROBE && !this.createProbeAttempted) {
          this.createProbeAttempted = true
          const record = this.mirrorRecords.get(mirrorId)
          if (record?.cwd) {
            const fakeCwd = mirrorWorkspacePath(join(this.dir, 'mirror'), record.cwd)
            const createResponse = await handler.fetch(new Request('http://localhost/api/session/create', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-gateway-create-probe',
                method: 'session/create',
                payload: { args: { request: { cwd: fakeCwd, agentPreset: 'standard' } } },
              }),
            }), peer)
            const createBody = await createResponse.json()
            const createError = createBody?.result?.ok === false ? createBody.result.error : null
            probe.create = {
              ok: createBody?.result?.ok === true,
              sessionId: createBody?.result?.ok === true ? createBody.result.value?.sessionId ?? null : null,
              code: createError?.code ?? null,
              message: createError?.message ?? null,
            }
          }
        }
      }

      if (AGENT_PROBE && !this.agentProbeAttempted) {
        this.agentProbeAttempted = true
        const host = this.hosts[0]
        if (host) {
          const probeFile = '/root/data/bridge-agent-test.txt'
          let askpass = null
          const secret = await this.getSecret(host)
          if (secret) askpass = await createAskpass(secret)
          try {
            await runSsh(
              this.config.sshExecutable,
              sshInvocation(host, wrapPosix(`printf 'remote-agent-bridge-ok\\n' > ${shellQuote(probeFile)}`), {
                connectTimeoutSec: this.config.connectTimeoutSec,
                batchMode: !secret,
              }),
              { env: askpass?.env ?? {}, timeoutMs: 30000, maxBytes: 64 * 1024 },
            )
          } finally {
            await askpass?.dispose().catch(() => {})
          }
          const workspace = await this.createAgentWorkspace(host.id)
          const createResponse = await handler.fetch(new Request('http://localhost/api/session/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'rs-agent-create-probe',
              method: 'session/create',
              payload: { args: { request: { workspaceId: workspace.workspaceId } } },
            }),
          }), peer)
          const createBody = await createResponse.json()
          const createError = createBody?.result?.ok === false ? createBody.result.error : null
          probe.agentWorkspace = {
            workspaceId: workspace.workspaceId,
            title: workspace.title,
            preset: workspace.preset,
            createOk: createBody?.result?.ok === true,
            sessionId: createBody?.result?.ok === true ? createBody.result.value?.sessionId ?? null : null,
            code: createError?.code ?? null,
            message: createError?.message ?? null,
          }
          const sessionId = probe.agentWorkspace.sessionId
          if (sessionId) {
            const promptResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-agent-prompt-probe',
                method: 'session/prompt',
                payload: {
                  args: {
                    request: {
                      requestId: 'rs-agent-prompt-probe',
                      sessionId,
                      mode: 'queue',
                      content: [{ type: 'text', text: 'Use the read tool to read /root/data/bridge-agent-test.txt and reply with its exact contents. Do not use bash.' }],
                    },
                  },
                },
              }),
            }), peer)
            const promptBody = await promptResponse.json()
            const promptError = promptBody?.result?.ok === false ? promptBody.result.error : null
            probe.agentWorkspace.prompt = {
              ok: promptBody?.result?.ok === true,
              code: promptError?.code ?? null,
              message: promptError?.message ?? null,
            }
          }
        }
      }

      if (AGENT_WRITE_PROBE && !this.agentWriteProbeAttempted) {
        this.agentWriteProbeAttempted = true
        const host = this.hosts[0]
        if (host) {
          let workspaceId = [...this.agentWorkspaces.keys()][0]
          if (!workspaceId) {
            const created = await this.createAgentWorkspace(host.id)
            workspaceId = created.workspaceId
          }
          const createResponse = await handler.fetch(new Request('http://localhost/api/session/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'rs-agent-write-create',
              method: 'session/create',
              payload: { args: { request: { workspaceId } } },
            }),
          }), peer)
          const createBody = await createResponse.json()
          const createError = createBody?.result?.ok === false ? createBody.result.error : null
          probe.agentWrite = {
            workspaceId,
            createOk: createBody?.result?.ok === true,
            sessionId: createBody?.result?.ok === true ? createBody.result.value?.sessionId ?? null : null,
            code: createError?.code ?? null,
            message: createError?.message ?? null,
          }
          const sessionId = probe.agentWrite.sessionId
          if (sessionId) {
            const promptResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-agent-write-prompt',
                method: 'session/prompt',
                payload: {
                  args: {
                    request: {
                      requestId: 'rs-agent-write-prompt',
                      sessionId,
                      mode: 'queue',
                      content: [{
                        type: 'text',
                        text: 'Use write to create /root/data/agent-probe.txt with exactly the content "alpha". Then use edit to replace "alpha" with "beta". Then use bash to run `cat /root/data/agent-probe.txt` and reply with the command output.',
                      }],
                    },
                  },
                },
              }),
            }), peer)
            const promptBody = await promptResponse.json()
            const promptError = promptBody?.result?.ok === false ? promptBody.result.error : null
            probe.agentWrite.prompt = {
              ok: promptBody?.result?.ok === true,
              code: promptError?.code ?? null,
              message: promptError?.message ?? null,
            }
          }
        }
      }

      if (AGENT_FS_PROBE && !this.agentFsProbeAttempted) {
        this.agentFsProbeAttempted = true
        const host = this.hosts[0]
        if (host) {
          const probeFile = '/root/data/agent-fs-probe.txt'
          let askpass = null
          const secret = await this.getSecret(host)
          if (secret) askpass = await createAskpass(secret)
          try {
            await runSsh(
              this.config.sshExecutable,
              sshInvocation(host, wrapPosix(`printf 'fs-alpha' > ${shellQuote(probeFile)}`), {
                connectTimeoutSec: this.config.connectTimeoutSec,
                batchMode: !secret,
              }),
              { env: askpass?.env ?? {}, timeoutMs: 30000, maxBytes: 64 * 1024 },
            )
          } finally {
            await askpass?.dispose().catch(() => {})
          }
          let workspaceId = [...this.agentWorkspaces.keys()][0]
          if (!workspaceId) {
            const created = await this.createAgentWorkspace(host.id)
            workspaceId = created.workspaceId
          }
          const createResponse = await handler.fetch(new Request('http://localhost/api/session/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'rs-agent-fs-create',
              method: 'session/create',
              payload: { args: { request: { workspaceId, agentPreset: 'remote-standard' } } },
            }),
          }), peer)
          const createBody = await createResponse.json()
          const createError = createBody?.result?.ok === false ? createBody.result.error : null
          probe.agentFs = {
            workspaceId,
            createOk: createBody?.result?.ok === true,
            sessionId: createBody?.result?.ok === true ? createBody.result.value?.sessionId ?? null : null,
            code: createError?.code ?? null,
            message: createError?.message ?? null,
          }
          const sessionId = probe.agentFs.sessionId
          if (sessionId) {
            const promptResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-agent-fs-prompt',
                method: 'session/prompt',
                payload: {
                  args: {
                    request: {
                      requestId: 'rs-agent-fs-prompt',
                      sessionId,
                      mode: 'queue',
                      content: [{
                        type: 'text',
                        text: 'Use read to read /root/data/agent-fs-probe.txt, then use write to replace it with the exact content "fs-beta", then use read again and reply with its contents.',
                      }],
                    },
                  },
                },
              }),
            }), peer)
            const promptBody = await promptResponse.json()
            const promptError = promptBody?.result?.ok === false ? promptBody.result.error : null
            probe.agentFs.prompt = {
              ok: promptBody?.result?.ok === true,
              code: promptError?.code ?? null,
              message: promptError?.message ?? null,
            }
          }
        }
      }

      if (AGENT_SHELL_PROBE && !this.agentShellProbeAttempted) {
        this.agentShellProbeAttempted = true
        const host = this.hosts[0]
        if (host) {
          let workspaceId = [...this.agentWorkspaces.keys()][0]
          if (!workspaceId) {
            const created = await this.createAgentWorkspace(host.id)
            workspaceId = created.workspaceId
          }
          const createResponse = await handler.fetch(new Request('http://localhost/api/session/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'rs-agent-shell-create',
              method: 'session/create',
              payload: { args: { request: { workspaceId, agentPreset: 'remote-standard' } } },
            }),
          }), peer)
          const createBody = await createResponse.json()
          const createError = createBody?.result?.ok === false ? createBody.result.error : null
          probe.agentShell = {
            workspaceId,
            createOk: createBody?.result?.ok === true,
            sessionId: createBody?.result?.ok === true ? createBody.result.value?.sessionId ?? null : null,
            code: createError?.code ?? null,
            message: createError?.message ?? null,
          }
          const sessionId = probe.agentShell.sessionId
          if (sessionId) {
            const promptResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-agent-shell-prompt',
                method: 'session/prompt',
                payload: {
                  args: {
                    request: {
                      requestId: 'rs-agent-shell-prompt',
                      sessionId,
                      mode: 'queue',
                      content: [{
                        type: 'text',
                        text: 'Use bash to run exactly `pwd; echo shell-ok` in the remote workspace and reply with the output.',
                      }],
                    },
                  },
                },
              }),
            }), peer)
            const promptBody = await promptResponse.json()
            const promptError = promptBody?.result?.ok === false ? promptBody.result.error : null
            probe.agentShell.prompt = {
              ok: promptBody?.result?.ok === true,
              code: promptError?.code ?? null,
              message: promptError?.message ?? null,
            }
          }
        }
      }

      if (AGENT_JOB_PROBE && !this.agentJobProbeAttempted) {
        this.agentJobProbeAttempted = true
        const host = this.hosts[0]
        if (host) {
          let workspaceId = [...this.agentWorkspaces.keys()][0]
          if (!workspaceId) {
            const created = await this.createAgentWorkspace(host.id)
            workspaceId = created.workspaceId
          }
          const createResponse = await handler.fetch(new Request('http://localhost/api/session/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'rs-agent-job-create',
              method: 'session/create',
              payload: { args: { request: { workspaceId, agentPreset: 'remote-standard' } } },
            }),
          }), peer)
          const createBody = await createResponse.json()
          const createError = createBody?.result?.ok === false ? createBody.result.error : null
          probe.agentJob = {
            workspaceId,
            createOk: createBody?.result?.ok === true,
            sessionId: createBody?.result?.ok === true ? createBody.result.value?.sessionId ?? null : null,
            code: createError?.code ?? null,
            message: createError?.message ?? null,
          }
          const sessionId = probe.agentJob.sessionId
          if (sessionId) {
            const promptResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-agent-job-prompt',
                method: 'session/prompt',
                payload: {
                  args: {
                    request: {
                      requestId: 'rs-agent-job-prompt',
                      sessionId,
                      mode: 'queue',
                      content: [{
                        type: 'text',
                        text: 'Use bash with run_in_background to run exactly `sleep 2; echo job-ok`. Then use job_output to collect its output, wait until it finishes, and reply with the collected output. If job_kill is still available, use it only if the job is still running.',
                      }],
                    },
                  },
                },
              }),
            }), peer)
            const promptBody = await promptResponse.json()
            const promptError = promptBody?.result?.ok === false ? promptBody.result.error : null
            probe.agentJob.prompt = {
              ok: promptBody?.result?.ok === true,
              code: promptError?.code ?? null,
              message: promptError?.message ?? null,
            }
          }
        }
      }

      if (AGENT_JOB_KILL_PROBE && !this.agentJobKillProbeAttempted) {
        this.agentJobKillProbeAttempted = true
        const host = this.hosts[0]
        if (host) {
          let workspaceId = [...this.agentWorkspaces.keys()][0]
          if (!workspaceId) {
            const created = await this.createAgentWorkspace(host.id)
            workspaceId = created.workspaceId
          }
          const createResponse = await handler.fetch(new Request('http://localhost/api/session/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'rs-agent-job-kill-create',
              method: 'session/create',
              payload: { args: { request: { workspaceId, agentPreset: 'remote-standard' } } },
            }),
          }), peer)
          const createBody = await createResponse.json()
          const createError = createBody?.result?.ok === false ? createBody.result.error : null
          probe.agentJobKill = {
            workspaceId,
            createOk: createBody?.result?.ok === true,
            sessionId: createBody?.result?.ok === true ? createBody.result.value?.sessionId ?? null : null,
            code: createError?.code ?? null,
            message: createError?.message ?? null,
          }
          const sessionId = probe.agentJobKill.sessionId
          if (sessionId) {
            const promptResponse = await handler.fetch(new Request('http://localhost/api/session/prompt', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-agent-job-kill-prompt',
                method: 'session/prompt',
                payload: {
                  args: {
                    request: {
                      requestId: 'rs-agent-job-kill-prompt',
                      sessionId,
                      mode: 'queue',
                      content: [{
                        type: 'text',
                        text: 'Use bash with run_in_background to run exactly `sleep 30; echo never`. Immediately use job_kill on the returned job id, then use job_output to confirm the job is stopped and reply with its status.',
                      }],
                    },
                  },
                },
              }),
            }), peer)
            const promptBody = await promptResponse.json()
            const promptError = promptBody?.result?.ok === false ? promptBody.result.error : null
            probe.agentJobKill.prompt = {
              ok: promptBody?.result?.ok === true,
              code: promptError?.code ?? null,
              message: promptError?.message ?? null,
            }
          }
        }
      }

      if (DIRECT_SHELL_PROBE) {
        const host = this.hosts[0]
        if (host) {
          try {
            const { createRemoteShell } = await import('../remote-shell.js')
            const shell = createRemoteShell({
              host: host.target,
              remotePath: REMOTE_AGENT_PATH,
              connectTimeoutSec: this.config.connectTimeoutSec,
            })
            const spec = shell.resolve({
              command: 'pwd; echo shell-ok',
              workdir: REMOTE_AGENT_PATH,
              timeoutMs: 15000,
            })
            const execution = await shell.execute(spec)
            const result = await execution.result()
            probe.shellDirect = {
              status: execution.status,
              exitCode: result.exitCode,
              timedOut: result.timedOut,
              stdout: result.stdout?.text ?? '',
              stderr: result.stderr?.text ?? '',
              stdoutTruncated: result.stdout?.truncated ?? false,
            }
          } catch (error) {
            probe.shellDirect = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (TERMINAL_PROBE) {
        const host = this.hosts[0]
        if (host) {
          try {
            const { createRemoteTerminalBackend } = await import('../remote-terminal.js')
            const backend = createRemoteTerminalBackend({
              host: host.target,
              remotePath: REMOTE_AGENT_PATH,
              connectTimeoutSec: this.config.connectTimeoutSec,
            })
            const session = await backend.spawn({
              sessionId: 'terminal-probe',
              owner: { id: 'terminal-probe' },
              type: backend.type,
              cwd: REMOTE_AGENT_PATH,
            })
            const before = session.status()
            const send = session.startSend({ text: 'pwd; echo term-ok', submit: true })
            const sendResult = await send.done
            const read = session.read({ count: 40 })
            const after = session.status()
            await session.close('probe complete')
            const afterClose = session.status()
            probe.terminal = {
              type: backend.type,
              motd: session.motd,
              before,
              send: {
                viewport: sendResult.viewport,
                waitReason: sendResult.waitReason,
                sessionStatus: sendResult.sessionStatus,
                truncated: sendResult.truncated,
              },
              read: {
                text: read.text,
                totalLines: read.totalLines,
                lineBegin: read.lineBegin,
                lineEnd: read.lineEnd,
                truncated: read.truncated,
              },
              after,
              afterClose,
            }
          } catch (error) {
            probe.terminal = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (WORKSPACE_FILES_PROBE) {
        const record = [...this.agentWorkspaces.values()][0]
        if (record) {
          const workspaceFiles = this.ctx.get('workspaceFiles')
          const fileReferences = this.ctx.get('fileReferences')
          probe.workspaceFiles = { record: { host: record.target, path: record.remotePath } }
          try {
            const scope = { sessionId: 'workspace-files-probe', workspaceRoot: record.path }
            const list = await workspaceFiles.list(scope, '.', AbortSignal.timeout(15000))
            probe.workspaceFiles.list = {
              path: list.path,
              count: list.entries.length,
              entries: list.entries.slice(0, 10),
              truncated: list.truncated,
            }
          } catch (error) {
            probe.workspaceFiles.list = { error: error instanceof Error ? error.message : String(error) }
          }
          try {
            const scope = { sessionId: 'workspace-files-probe', workspaceRoot: record.path }
            const read = await workspaceFiles.read(scope, 'split/d.sh', { offset: 0, limit: 5 }, AbortSignal.timeout(15000))
            probe.workspaceFiles.read = {
              absolutePath: read.absolutePath,
              version: read.version,
              offset: read.offset,
              lines: read.lines,
              text: read.text.slice(0, 300),
            }
          } catch (error) {
            probe.workspaceFiles.read = { error: error instanceof Error ? error.message : String(error) }
          }
          try {
            const agent = { id: 'workspace-files-probe', session: { header: { cwd: record.path } } }
            const candidates = await fileReferences.list(agent, 'split/', AbortSignal.timeout(15000))
            probe.fileReferences = { count: candidates.length, candidates: candidates.slice(0, 10) }
          } catch (error) {
            probe.fileReferences = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (FS_SURFACE_PROBE) {
        const record = [...this.agentWorkspaces.values()][0]
        if (record) {
          const fsService = this.ctx.get('fs')
          const directoryPicker = this.ctx.get('directoryPickerController')
          probe.fsSurface = { record: { host: record.target, path: record.remotePath } }
          try {
            const localPath = join(record.path, 't.txt')
            const target = await fsService.resolve(localPath)
            const text = await fsService.readText(target)
            const info = await fsService.stat(target)
            probe.fsSurface.read = {
              localPath,
              targetKey: target.targetKey,
              displayPath: target.displayPath,
              version: info?.version ?? null,
              size: info?.size ?? null,
              text,
            }
          } catch (error) {
            probe.fsSurface.read = { error: error instanceof Error ? error.message : String(error) }
          }
          try {
            const listing = await directoryPicker.list(record.path, AbortSignal.timeout(15000))
            probe.fsSurface.directoryPicker = {
              path: listing.path,
              count: listing.entries.length,
              entries: listing.entries.slice(0, 10),
            }
          } catch (error) {
            probe.fsSurface.directoryPicker = { error: error instanceof Error ? error.message : String(error) }
          }
          try {
            const workspaceFiles = this.ctx.get('workspaceFiles')
            const scope = { sessionId: 'workspace-files-probe', workspaceRoot: record.path }
            const bytes = await workspaceFiles.readBytes(scope, 'c95_c5.gtdb_representative_metadata.tsv', {}, AbortSignal.timeout(120000))
            probe.fsSurface.tsv = {
              bytes: bytes.bytes,
              offset: bytes.offset,
              length: bytes.data?.length ?? 0,
              eof: bytes.eof,
            }
          } catch (error) {
            probe.fsSurface.tsv = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (FILES_PANEL_PROBE) {
        const entry = [...this.agentWorkspaces.entries()][0]
        if (entry) {
          const [workspaceId, record] = entry
          try {
            const list = await this.listAgentFiles({ workspaceId, path: record.remotePath })
            probe.filesPanel = {
              workspaceId,
              path: list.path,
              count: list.entries.length,
              entries: list.entries.slice(0, 10),
            }
            const file = await this.readAgentFile({ workspaceId, path: 't.txt', offset: 0, limit: 20 })
            probe.filesPanel.read = {
              path: file.path,
              size: file.size,
              lines: file.lines,
              text: file.text,
            }
          } catch (error) {
            probe.filesPanel = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (FILES_ROUTE_PROBE) {
        const entry = [...this.agentWorkspaces.entries()][0]
        if (entry) {
          const [workspaceId, record] = entry
          const post = async (name, body) => {
            const response = await handler.fetch(new Request(`http://localhost/api/remote-ssh/${name}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }), peer)
            return await response.json()
          }
          try {
            const workspaces = await post('agentWorkspaces', {})
            const list = await post('filesList', { workspaceId, path: record.remotePath })
            const read = await post('filesRead', { workspaceId, path: 't.txt', offset: 0, limit: 20 })
            probe.filesRoute = {
              workspacesOk: workspaces?.ok === true,
              workspaceCount: Array.isArray(workspaces?.workspaces) ? workspaces.workspaces.length : null,
              listOk: list?.ok === true,
              listPath: list?.path ?? null,
              listCount: Array.isArray(list?.entries) ? list.entries.length : null,
              readOk: read?.ok === true,
              readPath: read?.path ?? null,
              readText: read?.text ?? null,
            }
          } catch (error) {
            probe.filesRoute = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (FILES_DOWNLOAD_PROBE) {
        const entry = [...this.agentWorkspaces.entries()][0]
        if (entry) {
          const [workspaceId] = entry
          try {
            const response = await this.downloadAgentFile({ workspaceId, path: 't.txt' }, AbortSignal.timeout(30_000))
            const text = await response.text()
            probe.filesDownload = {
              status: response.status,
              contentLength: response.headers.get('content-length'),
              text,
            }
          } catch (error) {
            probe.filesDownload = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (TERMINAL_HOST_PROBE) {
        try {
          const terminals = this.ctx.get('terminals')
          probe.terminalHost = {
            available: Boolean(terminals),
            backends: typeof terminals?.listBackends === 'function' ? terminals.listBackends() : null,
          }
        } catch (error) {
          probe.terminalHost = { error: error instanceof Error ? error.message : String(error) }
        }
      }

      if (MULTI_TARGET_PROBE) {
        const host = this.hosts[0]
        if (host) {
          try {
            const created = await this.createAgentWorkspace(host.id, '/root')
            const response = await handler.fetch(new Request('http://localhost/api/session/create', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-multi-target-create',
                method: 'session/create',
                payload: { args: { request: { workspaceId: created.workspaceId, agentPreset: created.preset } } },
              }),
            }), peer)
            const body = await response.json()
            const error = body?.result?.ok === false ? body.result.error : null
            probe.multiTarget = {
              workspaceId: created.workspaceId,
              preset: created.preset,
              remotePath: created.remotePath,
              sessionOk: body?.result?.ok === true,
              sessionId: body?.result?.ok === true ? body.result.value?.sessionId ?? null : null,
              code: error?.code ?? null,
              message: error?.message ?? null,
            }
          } catch (error) {
            probe.multiTarget = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (IOTA_SC_PROBE) {
        const host = this.hosts.find((item) => item.target === 'iota-sc'
          && typeof item.remotePath === 'string'
          && item.remotePath.startsWith('/'))
        if (host) {
          try {
            const existing = [...this.agentWorkspaces.entries()].find(([, record]) => (
              record.target === host.target && record.remotePath === host.remotePath
            ))
            const created = existing
              ? {
                workspaceId: existing[0],
                preset: existing[1].preset,
                remotePath: existing[1].remotePath,
              }
              : await this.createAgentWorkspace(host.id, host.remotePath)
            const response = await handler.fetch(new Request('http://localhost/api/session/create', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-iota-sc-create',
                method: 'session/create',
                payload: { args: { request: { workspaceId: created.workspaceId, agentPreset: created.preset } } },
              }),
            }), peer)
            const body = await response.json()
            const error = body?.result?.ok === false ? body.result.error : null
            probe.iotaSc = {
              hostId: host.id,
              hostName: host.name,
              target: host.target,
              remotePath: host.remotePath,
              workspaceId: created.workspaceId,
              preset: created.preset,
              sessionOk: body?.result?.ok === true,
              sessionId: body?.result?.ok === true ? body.result.value?.sessionId ?? null : null,
              code: error?.code ?? null,
              message: error?.message ?? null,
            }
          } catch (error) {
            probe.iotaSc = { error: error instanceof Error ? error.message : String(error) }
          }
        } else {
          probe.iotaSc = { error: 'no iota-sc host with an absolute remotePath' }
        }
      }

      if (IOTA_CLEANUP_PROBE) {
        try {
          const removed = []
          for (const host of [...this.hosts]) {
            const invalid = host.target === 'iota'
              || (host.target === 'iota-sc' && host.remotePath === '~')
            if (!invalid) continue
            await this.remove(host.id)
            removed.push({ id: host.id, name: host.name, target: host.target, remotePath: host.remotePath })
          }
          const main = this.hosts.find((host) => host.target === 'iota-sc'
            && typeof host.remotePath === 'string'
            && host.remotePath.startsWith('/'))
          let renamed = false
          if (main && main.name !== 'iota-sc') {
            main.name = 'iota-sc'
            await this.saveHosts()
            renamed = true
          }
          probe.iotaCleanup = { removed, renamed, hostId: main?.id ?? null }
        } catch (error) {
          probe.iotaCleanup = { error: error instanceof Error ? error.message : String(error) }
        }
      }

      if (IOTA_FILES_PROBE) {
        const entry = [...this.agentWorkspaces.entries()].find(([, record]) => record.target === 'iota-sc')
        if (entry) {
          try {
            const [workspaceId] = entry
            const listing = await this.listAgentFiles({ workspaceId, path: '.' })
            const small = await this.readAgentFile({ workspaceId, path: 'a.txt', offset: 0, limit: 5 })
            const large = await this.readAgentFile({ workspaceId, path: 'bac.tax.tsv', offset: 0, limit: 3 })
            probe.iotaFiles = {
              count: listing.entries.length,
              names: listing.entries.slice(0, 8).map((item) => item.name),
              small: { size: small.size, text: small.text.trim() },
              large: {
                size: large.size,
                lines: large.lines,
                truncated: large.truncated,
                preview: large.text.slice(0, 300),
              },
            }
          } catch (error) {
            probe.iotaFiles = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (STATIC_PRESET_PROBE) {
        const entry = [...this.agentWorkspaces.entries()].find(([, record]) => record.target === 'iota-sc')
          ?? [...this.agentWorkspaces.entries()][0]
        if (entry) {
          try {
            const [workspaceId, record] = entry
            const response = await handler.fetch(new Request('http://localhost/api/session/create', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                type: 'client-request',
                rpcId: 'rs-static-preset',
                method: 'session/create',
                payload: { args: { request: { workspaceId, agentPreset: record.preset } } },
              }),
            }), peer)
            const body = await response.json()
            const error = body?.result?.ok === false ? body.result.error : null
            const sessionId = body?.result?.ok === true ? body.result.value?.sessionId ?? null : null
            let stat = null
            let binding = null
            let serviceAvailable = false
            if (sessionId) {
              await delay(500)
              const agents = this.ctx.get('agents')
              const agent = agents?.get?.(sessionId)
              const presets = this.ctx.get('agentPresets')
              const fsService = agent && presets?.serviceFor ? presets.serviceFor(agent, 'fs') : null
              serviceAvailable = Boolean(fsService)
              binding = this.resolveRemoteWorkspace(agent?.session)
              if (agent && fsService?.stat) {
                stat = await agents.withInitiator(agent, () => fsService.stat({
                  targetKey: record.remotePath,
                  displayPath: record.remotePath,
                }))
              }
            }
            probe.staticPreset = {
              workspaceId,
              preset: record.preset,
              mode: record.mode,
              remotePath: record.remotePath,
              sessionOk: body?.result?.ok === true,
              sessionId,
              code: error?.code ?? null,
              message: error?.message ?? null,
              serviceAvailable,
              binding,
              stat: stat ? { type: stat.type, size: stat.size } : null,
            }
          } catch (error) {
            probe.staticPreset = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (LEGACY_PRESET_PROBE) {
        try {
          const presets = this.ctx.get('agentPresets')
          const resolved = await presets.resolve('remote-agent-fs')
          probe.legacyPreset = {
            resolved: resolved.id,
            available: typeof presets.list === 'function'
              ? (await presets.list()).map((preset) => preset.id)
              : null,
          }
        } catch (error) {
          probe.legacyPreset = { error: error instanceof Error ? error.message : String(error) }
        }
      }

      if (REMOTE_DIRS_PROBE) {
        const host = this.hosts.find((item) => item.target === 'iota-sc')
        if (host) {
          try {
            const listing = await this.listRemoteDirs({ id: host.id, path: host.remotePath })
            probe.remoteDirs = {
              path: listing.path,
              count: listing.entries.length,
              names: listing.entries.slice(0, 8).map((entry) => entry.name),
            }
          } catch (error) {
            probe.remoteDirs = { error: error instanceof Error ? error.message : String(error) }
          }
        }
      }

      if (CLIENT_GRAPH_PROBE) {
        try {
          const clientModules = this.ctx.get('clientModules')
          probe.clientGraph = clientModules && typeof clientModules.graph === 'function'
            ? clientModules.graph()
            : { error: 'clientModules.graph unavailable' }
        } catch (error) {
          probe.clientGraph = { error: error instanceof Error ? error.message : String(error) }
        }
      }
    } catch (error) {
      probe.error = error instanceof Error ? error.message : String(error)
    } finally {
      await peer?.dispose?.().catch(() => {})
    }
    await writeFile(join(this.dir, 'gateway-probe.json'), JSON.stringify(probe, null, 2), { mode: 0o600 }).catch(() => {})
  }

  uninstallServiceBridge() {
    const bridge = this.serviceBridge
    if (!bridge) return
    this.serviceBridge = null
    try {
      if (bridge.protoPromptPatched && bridge.proto?.prompt !== bridge.originalPrompt) bridge.proto.prompt = bridge.originalPrompt
      if (bridge.patchedPrompt) {
        if (bridge.hadOwnPrompt) bridge.sessionController.prompt = bridge.originalOwnPrompt
        else delete bridge.sessionController.prompt
      }
      if (bridge.protoListPatched && bridge.proto?.list !== bridge.originalList) bridge.proto.list = bridge.originalList
      if (bridge.patchedList) delete bridge.sessionController.list
      if (bridge.protoCreatePatched && bridge.proto?.create !== bridge.originalCreate) bridge.proto.create = bridge.originalCreate
      if (bridge.patchedCreate) {
        if (bridge.hadOwnCreate) bridge.sessionController.create = bridge.originalOwnCreate
        else delete bridge.sessionController.create
      }
      if (bridge.protoCancelPatched && bridge.proto?.cancel !== bridge.originalCancel) bridge.proto.cancel = bridge.originalCancel
      if (bridge.patchedCancel) {
        if (bridge.hadOwnCancel) bridge.sessionController.cancel = bridge.originalOwnCancel
        else delete bridge.sessionController.cancel
      }
    } catch {
      // best-effort restore
    }
  }

  async ensureLiveMirror(id, record) {
    const sessions = this.ctx.get('sessions')
    if (!sessions) return null
    const existing = sessions.get(id)
    if (existing) return existing
    let remote = null
    try {
      remote = await this.fetchRemoteSession(record)
    } catch (error) {
      if ((record.lastSeq ?? -1) >= 0) throw error
      // A freshly created remote session may not have materialized its log yet.
    }
    const cwd = record.cwd ?? (typeof remote?.header.cwd === 'string' && remote.header.cwd.startsWith('/') ? remote.header.cwd : null)
    if (!cwd) throw new AppError('bridge-cwd-missing', 'The remote session has no absolute cwd')
    const mirrorDir = mirrorWorkspacePath(join(this.dir, 'mirror'), cwd)
    const live = sessions.create(id, {
      seed: remote?.events ?? [],
      meta: {
        cwd: mirrorDir,
        createdAt: typeof remote?.header.createdAt === 'number' ? remote.header.createdAt : Date.now(),
        agentPreset: 'standard',
      },
    })
    this.liveMirrors.set(id, live)
    return live
  }

  async restoreLiveMirrors() {
    if (this.disposed) return
    const sessions = this.ctx.get('sessions')
    if (!sessions) return
    const root = this.ctx.dshHomePath('sessions')
    let entries
    try {
      entries = await readdir(root, { recursive: true, withFileTypes: true })
    } catch {
      return
    }
    for (const [id, record] of this.mirrorRecords) {
      if (this.disposed) return
      if (sessions.get(id)) continue
      const entry = entries.find((candidate) => candidate.isFile()
        && candidate.name === 'session.v4.jsonl.zstd'
        && typeof candidate.parentPath === 'string'
        && candidate.parentPath.includes(id))
      if (!entry) continue
      try {
        const parsed = decodeSessionLog(await readFile(join(entry.parentPath, entry.name)))
        const cwd = record.cwd ?? (typeof parsed.header.cwd === 'string' && parsed.header.cwd.startsWith('/') ? parsed.header.cwd : null)
        if (!cwd) continue
        const live = sessions.create(id, {
          seed: parsed.events,
          meta: {
            cwd: mirrorWorkspacePath(join(this.dir, 'mirror'), cwd),
            createdAt: typeof parsed.header.createdAt === 'number' ? parsed.header.createdAt : Date.now(),
            agentPreset: 'standard',
          },
        })
        this.liveMirrors.set(id, live)
      } catch (error) {
        this.warn(`restore live mirror ${id} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    void this.writeBridgeState()
  }

  writeBridgeState() {
    void writeFile(join(this.dir, 'bridge-state.json'), JSON.stringify({
      at: new Date().toISOString(),
      live: [...this.liveMirrors.keys()],
      records: [...this.mirrorRecords.keys()],
      promptCount: this.promptCount,
      patchedPrompt: this.serviceBridge?.patchedPrompt === true,
      patchedList: this.serviceBridge?.patchedList === true,
    }, null, 2), { mode: 0o600 }).catch(() => {})
  }

  async discoverRemotePath(record) {
    if (record.remotePath) return record.remotePath
    if (!record.hostId || !record.remoteSessionId) return null
    const host = this.requireHost(record.hostId)
    const secret = await this.getSecret(host)
    let askpass = null
    if (secret) askpass = await createAskpass(secret)
    try {
      const script = [
        'root="${DSH_HOME:-$HOME/.dsh}/sessions"',
        '[ -d "$root" ] || exit 0',
        `find "$root" -type f -name "session.v*.jsonl.zstd" | grep -F ${shellQuote(`/${record.remoteSessionId}/`)} | head -n 1`,
      ].join('\n')
      const result = await runSsh(
        this.config.sshExecutable,
        sshInvocation(host, wrapPosix(script), {
          connectTimeoutSec: this.config.connectTimeoutSec,
          batchMode: !secret,
        }),
        { env: askpass?.env ?? {}, timeoutMs: 30000, maxBytes: 64 * 1024 },
      )
      if (result.code === 0) {
        const path = result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== '')
        if (path) {
          record.remotePath = path
          await this.saveMirrorState()
          return path
        }
      }
      return null
    } finally {
      await askpass?.dispose().catch(() => {})
    }
  }

  async fetchRemoteSession(record) {
    if (!record.hostId) throw new AppError('bridge-host-missing', 'The mirrored session has no host')
    if (!record.remotePath) await this.discoverRemotePath(record)
    if (!record.remotePath) throw new AppError('bridge-path-missing', 'The mirrored session has no remote log path; run Sync sessions again')
    const host = this.requireHost(record.hostId)
    const secret = await this.getSecret(host)
    let askpass = null
    if (secret) askpass = await createAskpass(secret)
    try {
      const result = await runSsh(
        this.config.sshExecutable,
        sshInvocation(host, wrapPosix(`base64 < ${shellQuote(record.remotePath)}`), {
          connectTimeoutSec: this.config.connectTimeoutSec,
          batchMode: !secret,
        }),
        {
          env: askpass?.env ?? {},
          timeoutMs: 60000,
          maxBytes: 32 * 1024 * 1024,
        },
      )
      if (result.error?.code === 'ENOENT') throw new AppError('ssh-missing', 'The local ssh client was not found')
      if (result.code !== 0) throw classifySshFailure(result)
      const buffer = Buffer.from(result.stdout.replace(/\s+/g, ''), 'base64')
      return decodeSessionLog(buffer)
    } finally {
      await askpass?.dispose().catch(() => {})
    }
  }

  mirrorWorkspaceFor(request) {
    const registry = this.ctx.get('workspaceRegistry')
    let path = typeof request?.cwd === 'string' ? request.cwd : null
    if (!path && request?.workspaceId && typeof registry?.get === 'function') {
      path = registry.get(request.workspaceId)?.path ?? null
    }
    if (!path || !this.isMirrorPath(path)) return null
    const normalized = path.replace(/\\/g, '/').toLowerCase()
    for (const record of this.mirrorRecords.values()) {
      if (!record.cwd) continue
      const candidate = mirrorWorkspacePath(join(this.dir, 'mirror'), record.cwd).replace(/\\/g, '/').toLowerCase()
      if (candidate === normalized) return record
    }
    return null
  }

  async createMirrorSession(request, originalCreate) {
    const workspace = this.mirrorWorkspaceFor(request)
    if (!workspace) return originalCreate(request)
    if (!workspace.hostId) throw new AppError('bridge-host-missing', 'The mirror workspace has no remote host')
    await this.ensureRuntimeReady(workspace.hostId)
    const proxy = await this.createProxy(workspace.hostId)
    const remoteRequest = {
      cwd: workspace.cwd,
      ...(typeof request.agentPreset === 'string' && request.agentPreset !== '' ? { agentPreset: request.agentPreset } : {}),
    }
    const remote = await this.remoteRpc(proxy.url, 'session/create', { request: remoteRequest }, { timeoutMs: 60000 })
    const remoteSessionId = typeof remote?.sessionId === 'string' ? remote.sessionId : null
    if (!remoteSessionId) throw new AppError('bridge-create-failed', 'The remote Host did not return a session id')
    const local = await originalCreate(request)
    const localSessionId = typeof local?.sessionId === 'string' ? local.sessionId : typeof local === 'string' ? local : null
    if (!localSessionId) throw new AppError('bridge-create-failed', 'The local Host did not return a session id')
    if (!this.mirrorRecords.has(localSessionId)) {
      const record = {
        hostId: workspace.hostId,
        remotePath: null,
        cwd: workspace.cwd,
        lastSeq: -1,
        remoteSessionId,
      }
      this.mirrorRecords.set(localSessionId, record)
      this.mirrorIds.add(localSessionId)
      await this.saveMirrorState()
      await this.discoverRemotePath(record).catch(() => {})
      await this.ensureLiveMirror(localSessionId, record).catch((error) => {
        this.warn(`could not create live mirror for new session ${localSessionId}: ${error instanceof Error ? error.message : String(error)}`)
      })
      this.writeBridgeState()
    }
    return local
  }

  async cancelMirror(id) {
    const record = this.mirrorRecords.get(id)
    if (!record) throw new AppError('bridge-unknown-session', 'This session is not a remote mirror')
    if (!record.hostId) throw new AppError('bridge-host-missing', 'The mirror has no owning remote workspace')
    await this.ensureRuntimeReady(record.hostId)
    const proxy = await this.createProxy(record.hostId)
    try {
      await this.remoteRpc(proxy.url, 'session/cancel', {
        request: { sessionId: record.remoteSessionId ?? id },
      }, { timeoutMs: 30000 })
    } catch (error) {
      throw new AppError(error.code ?? 'remote-cancel-failed', error.message, error.detail ?? null)
    }
    return { accepted: true }
  }

  async promptMirror(request, _signal) {
    this.promptCount += 1
    this.writeBridgeState()
    const id = String(request?.sessionId ?? '')
    const record = this.mirrorRecords.get(id)
    if (!record) throw new AppError('bridge-unknown-session', 'This session is not a remote mirror')
    if (!record.hostId) throw new AppError('bridge-host-missing', 'The mirror has no owning remote workspace; run Sync sessions again')
    const content = Array.isArray(request?.content) ? request.content : []
    const text = content.filter((part) => part?.type === 'text').map((part) => part.text).join('\n').trim()
    if (text === '') throw new AppError('invalid-input', 'The remote bridge currently accepts text prompts only')
    if (content.some((part) => part?.type !== 'text')) throw new AppError('bridge-unsupported-content', 'The remote bridge currently accepts text prompts only')
    if (!record.remotePath) throw new AppError('bridge-path-missing', 'The mirror has no remote log path; run Sync sessions again')

    await this.ensureRuntimeReady(record.hostId)
    const proxy = await this.createProxy(record.hostId)
    await this.ensureLiveMirror(id, record)
    const remoteRequest = {
      requestId: typeof request.requestId === 'string' && request.requestId !== '' ? request.requestId : `rs-${randomUUID()}`,
      sessionId: record.remoteSessionId ?? id,
      mode: request.mode === 'steer' ? 'steer' : 'queue',
      content: [{ type: 'text', text }],
      ...(typeof request.clientTimeZone === 'string' ? { clientTimeZone: request.clientTimeZone } : {}),
    }
    try {
      await this.remoteRpc(proxy.url, 'session/prompt', { request: remoteRequest }, { timeoutMs: 60000 })
    } catch (error) {
      throw new AppError(error.code ?? 'remote-prompt-failed', error.message, error.detail ?? null)
    }
    void this.pollMirror(id, record)
    return { accepted: true }
  }

  async pollMirror(id, record) {
    if (this.polling.has(id)) return
    this.polling.add(id)
    const persistence = this.ctx.get('sessionPersistence')
    let handle = null
    try {
      if (persistence) handle = await persistence.open(id, 'write')
    } catch (error) {
      this.warn(`mirror poll could not open persistence for ${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
    let lastSeq = Number.isSafeInteger(record.lastSeq) ? record.lastSeq : -1
    const deadline = Date.now() + 180000
    try {
      while (!this.disposed && Date.now() < deadline) {
        const remote = await this.fetchRemoteSession(record)
        const fresh = remote.events.filter((event) => event.seq > lastSeq)
        if (fresh.length > 0) {
          await this.applyMirrorEvents(id, fresh, handle)
          lastSeq = fresh.at(-1).seq
          record.lastSeq = lastSeq
          await this.saveMirrorState()
          if (fresh.some((event) => event.type === 'turn/end')) break
        }
        await delay(1500)
      }
    } catch (error) {
      this.warn(`mirror poll ${id} failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (handle) await handle.close().catch(() => {})
      this.polling.delete(id)
    }
  }

  async applyMirrorEvents(id, fresh, handle) {
    const live = this.liveMirrors.get(id) ?? this.ctx.get('sessions')?.get(id)
    if (live) {
      for (const event of fresh) {
        try {
          const surface = event.type === 'system/message' || event.type === 'developer/message'
            || event.type === 'user/message' || event.type === 'assistant/message' || event.type === 'tool/result'
          if (surface) {
            live.append(event.type, event.data, {
              surfaceOp: event.surfaceOp ?? 'append',
              ...(Array.isArray(event.sourceEventSeqs) ? { sourceEventSeqs: event.sourceEventSeqs } : {}),
            })
          } else {
            live.append(event.type, event.data)
          }
        } catch (error) {
          this.warn(`mirror live append ${id} ${event.type}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
    if (handle) {
      try {
        await handle.append(fresh)
        await handle.flush()
      } catch (error) {
        this.warn(`mirror persistence append ${id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  scheduleAutoMirror() {
    if (this.config.autoMirror === false || this.autoMirrorAttempted || this.hosts.length === 0) return
    this.autoMirrorAttempted = true
    const host = this.hosts[0]
    const timer = setTimeout(() => {
      void (async () => {
        if (this.mirrorRecords.size > 0
          && [...this.mirrorRecords.values()].every((record) => record.remotePath)) {
          return
        }
        try {
          const result = await this.mirror(host.id)
          this.info(`auto-mirror ${host.name}: ${result.mirrored} mirrored, ${result.skipped} skipped`)
          await this.restoreLiveMirrors()
        } catch (error) {
          this.warn(`auto-mirror ${host.name} failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      })()
    }, 4000)
    if (typeof timer.unref === 'function') timer.unref()
  }

  async mirror(id) {
    await this.ready
    const host = this.requireHost(id)
    const workspaceRegistry = this.ctx.get('workspaceRegistry')
    const sessionPersistence = this.ctx.get('sessionPersistence')
    if (!workspaceRegistry || !sessionPersistence) {
      throw new AppError('bridge-unavailable', 'Local workspace or session persistence is unavailable')
    }
    const secret = await this.getSecret(host)
    let askpass = null
    if (secret) askpass = await createAskpass(secret)
    try {
      const script = [
        'root="${DSH_HOME:-$HOME/.dsh}/sessions"',
        '[ -d "$root" ] || exit 0',
        'find "$root" -type f -name "session.v*.jsonl.zstd" -print | head -n 40 | while IFS= read -r f; do',
        '  printf "@@DSHRS_BEGIN@@%s\\n" "$f"',
        '  base64 < "$f" | tr -d "\\n"',
        '  printf "\\n@@DSHRS_END@@\\n"',
        'done',
      ].join('\n')
      const result = await runSsh(
        this.config.sshExecutable,
        sshInvocation(host, wrapPosix(script), {
          connectTimeoutSec: this.config.connectTimeoutSec,
          batchMode: !secret,
        }),
        {
          env: askpass?.env ?? {},
          timeoutMs: 180000,
          maxBytes: 64 * 1024 * 1024,
        },
      )
      if (result.error?.code === 'ENOENT') throw new AppError('ssh-missing', 'The local ssh client was not found')
      if (result.code !== 0) throw classifySshFailure(result)
      const entries = this.parseMirrorDump(`${result.stdout}\n${result.stderr}`)
      let mirrored = 0
      let skipped = 0
      const failures = []
      const baseDir = join(this.dir, 'mirror')
      for (const entry of entries) {
        try {
          let decoded = null
          try {
            decoded = decodeSessionLog(entry.buffer)
          } catch {
            decoded = null
          }
          if (decoded) {
            const existing = [...this.mirrorRecords.entries()].find(([key, record]) =>
              (record.remoteSessionId ?? key) === decoded.header.id)
            if (existing) {
              const [, record] = existing
              record.remotePath = entry.path
              if (!record.cwd && decoded.header.cwd?.startsWith('/')) record.cwd = decoded.header.cwd
              record.lastSeq = decoded.events.at(-1)?.seq ?? record.lastSeq
              skipped += 1
              continue
            }
          }
          const outcome = await mirrorSession({
            sessionPersistence,
            workspaceRegistry,
            baseDir,
            remotePath: entry.path,
            log: entry.buffer,
            notice: (message) => this.info(message),
          })
          if (outcome.skipped) skipped += 1
          else mirrored += 1
          this.mirrorIds.add(outcome.id)
          const previous = this.mirrorRecords.get(outcome.id)
          this.mirrorRecords.set(outcome.id, {
            hostId: host.id,
            remotePath: entry.path,
            cwd: outcome.cwd ?? previous?.cwd ?? null,
            lastSeq: Number.isSafeInteger(outcome.lastSeq) ? outcome.lastSeq : previous?.lastSeq ?? -1,
            remoteSessionId: previous?.remoteSessionId ?? outcome.id,
          })
        } catch (error) {
          failures.push({
            path: entry.path,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
      await this.saveMirrorState()
      return { mirrored, skipped, failures, scanned: entries.length }
    } finally {
      await askpass?.dispose().catch(() => {})
    }
  }

  async save(input) {
    await this.ready
    const data = input?.host && typeof input.host === 'object' ? input.host : input
    if (!data || typeof data !== 'object') throw new AppError('invalid-input', 'Missing connection fields')
    const id = typeof data.id === 'string' && data.id.trim() !== '' ? data.id.trim() : null
    const existing = id ? this.requireHost(id) : null
    if (!existing && this.hosts.length >= 100) {
      throw new AppError('invalid-input', 'Too many saved connections')
    }

    const target = inputValue(() => validateTarget(data.target))
    const port = inputValue(() => validatePort(data.port))
    const remotePath = inputValue(() => validateRemotePath(data.remotePath))
    const identityFile = String(data.identityFile ?? '').trim()
    if (/[\x00\r\n]/.test(identityFile)) throw new AppError('invalid-input', 'The key path contains control characters')
    const dshCommand = inputValue(() => validateCommand(data.dshCommand))
    const name = (String(data.name ?? '').trim() || target).slice(0, 80)
    const secret = typeof input?.secret === 'string' ? input.secret : ''
    const clearSecret = input?.clearSecret === true
    const copySecretFrom = typeof input?.copySecretFrom === 'string' && input.copySecretFrom.trim() !== ''
      ? input.copySecretFrom.trim()
      : null
    const sourceHost = copySecretFrom && copySecretFrom !== existing?.id ? this.requireHost(copySecretFrom) : null
    if (secret.length > 0 && typeof this.credentials()?.set !== 'function') {
      throw new AppError('credentials-unavailable', 'The local credential store is unavailable')
    }

    const sandboxDetection = await this.detectSandbox({
      id: existing?.id ?? 'probe',
      target,
      port,
      remotePath,
      identityFile,
    })
    const sandbox = sandboxDetection.sandbox ?? existing?.sandbox ?? null
    const sandboxReason = sandboxDetection.sandbox
      ? null
      : sandboxDetection.reason ?? existing?.sandboxReason ?? null

    if (existing) {
      const runtime = this.runtime.get(existing.id)
      if (runtime && runtime.phase !== 'idle' && runtime.phase !== 'error') {
        await this.disconnect(existing.id, { quiet: true })
      }
    }

    let host
    if (existing) {
      Object.assign(existing, { name, target, port, remotePath, identityFile, dshCommand, sandbox, sandboxReason })
      host = existing
    } else {
      const newId = randomUUID().slice(0, 8)
      host = {
        id: newId,
        name,
        target,
        port,
        remotePath,
        identityFile,
        dshCommand,
        sandbox,
        sandboxReason,
        profile: `dsh-rs-${newId}`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        lastOpenedAt: null,
      }
      this.hosts.push(host)
    }

    await this.saveHosts()
    for (const record of this.agentWorkspaces.values()) {
      if (record.hostId === host.id) record.sandbox = sandbox
    }
    await this.saveAgentWorkspaces()
    if (secret.length > 0) await this.setSecret(host, secret)
    if (!existing && secret.length === 0 && !clearSecret && sourceHost
      && sourceHost.target === target && (sourceHost.port ?? null) === port) {
      const sourceSecret = await this.getSecret(sourceHost)
      if (sourceSecret) await this.setSecret(host, sourceSecret)
    }
    if (clearSecret) await this.clearSecret(host)
    return { host: this.publicHost(host), hasSecret: await this.hasSecret(host) }
  }

  async remove(id) {
    await this.ready
    const host = this.requireHost(id)
    await this.disconnect(id, { quiet: true })
    this.hosts = this.hosts.filter((candidate) => candidate.id !== id)
    this.runtime.delete(id)
    await this.clearSecret(host)
    await this.saveHosts()
    return { removed: true }
  }

  async connect(id) {
    await this.ready
    const host = this.requireHost(id)
    if (!this.sshAvailable) throw new AppError('ssh-missing', 'The local ssh client was not found')
    const runtime = this.ensureRuntime(host)
    if (['connecting', 'probing', 'launching', 'ready', 'installing', 'disconnecting'].includes(runtime.phase)) {
      return { phase: runtime.phase, already: true }
    }
    runtime.runId += 1
    const runId = runtime.runId
    runtime.phase = 'connecting'
    runtime.error = null
    runtime.url = null
    runtime.info = null
    runtime.logs = []
    runtime.startedAt = Date.now()
    runtime.localPort = null
    runtime.remotePort = null
    this.proxy.destroy(id)
    runtime.proxy = null
    await runtime.askpass?.dispose().catch(() => {})
    runtime.askpass = null
    void this.runConnect(host, runtime, runId)
    return { phase: runtime.phase }
  }

  async ensureRuntimeReady(id, timeoutMs = 90_000) {
    await this.ready
    const host = this.requireHost(id)
    let runtime = this.ensureRuntime(host)
    if (runtime.phase === 'ready' && runtime.url && runtime.proxy) return runtime
    if (!['connecting', 'probing', 'launching', 'installing'].includes(runtime.phase)) {
      await this.connect(id)
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.disposed) throw new AppError('disposed', 'The remote SSH plugin was disposed')
      runtime = this.ensureRuntime(host)
      if (runtime.phase === 'ready' && runtime.url) return runtime
      if (runtime.phase === 'error') {
        throw new AppError(runtime.error?.code ?? 'connect-failed', runtime.error?.message ?? 'Remote dsh failed to start', runtime.error?.detail ?? null)
      }
      await delay(500)
    }
    throw new AppError('connect-timeout', `Remote dsh did not become ready within ${Math.round(timeoutMs / 1000)}s`)
  }

  async runConnect(host, runtime, runId) {
    const alive = () => !this.disposed && runtime.runId === runId
    try {
      const probe = await this.probeHost(host, runtime, alive)
      if (!probe) return
      if (!host.dshCommand && !probe.info.dsh) {
        runtime.info = probe.info
        throw new AppError('dsh-missing', 'dsh was not found on the remote host')
      }

      let lastError = null
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (!alive()) return
        try {
          await this.launchOnce(host, runtime, probe, alive)
          if (!alive()) return
          if (runtime.phase === 'error') {
            throw new AppError('tunnel-closed', 'The SSH tunnel closed immediately after startup')
          }
          runtime.phase = 'ready'
          runtime.error = null
          runtime.startedAt = Date.now()
          host.lastUsedAt = new Date().toISOString()
          await this.saveHosts().catch(() => {})
          if (!alive()) return
          if (runtime.phase === 'error' || (runtime.child && runtime.child.exitCode !== null)) return
          await runtime.askpass?.dispose().catch(() => {})
          runtime.askpass = null
          this.log(runtime, 'info', `Remote dsh is ready at ${runtime.url}`)
          return
        } catch (error) {
          lastError = error
          this.killChild(runtime)
          if (!alive()) return
          const retryable = error instanceof AppError && error.retryable && attempt < 3
          if (!retryable) throw error
          this.log(runtime, 'info', `Retrying the remote dsh launch (attempt ${attempt + 1}/3)`)
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }
      throw lastError ?? new AppError('launch-failed', 'Remote dsh did not start')
    } catch (error) {
      if (!alive()) return
      const failure = error instanceof AppError
        ? error
        : new AppError('unknown', error instanceof Error ? error.message : String(error))
      runtime.phase = 'error'
      runtime.url = null
      runtime.error = { code: failure.code, message: failure.message, detail: failure.detail ?? null }
      if (failure.info) runtime.info = failure.info
      this.log(runtime, 'error', `${failure.message}${failure.detail ? `: ${failure.detail}` : ''}`)
      this.killChild(runtime)
      await runtime.askpass?.dispose().catch(() => {})
      runtime.askpass = null
    }
  }

  async probeHost(host, runtime, alive) {
    runtime.phase = 'probing'
    this.log(runtime, 'info', `Connecting to ${host.target} ...`)
    const secret = await this.getSecret(host)
    let askpass = null
    if (secret) {
      askpass = await createAskpass(secret)
      runtime.askpass = askpass
    }
    const result = await runSsh(
      this.config.sshExecutable,
      sshInvocation(host, probeCommand({ remotePath: host.remotePath, profile: host.profile }), {
        connectTimeoutSec: this.config.connectTimeoutSec,
        batchMode: !secret,
      }),
      {
        env: askpass?.env ?? {},
        timeoutMs: this.config.probeTimeoutMs,
        onLine: (line) => this.log(runtime, 'ssh', line),
      },
    )
    if (!alive()) return null
    if (result.error?.code === 'ENOENT' || !this.sshAvailable) {
      throw new AppError('ssh-missing', 'The local ssh client was not found', tail(result.stderr))
    }
    if (result.code !== 0) throw classifySshFailure(result)
    const parsed = parseProbeOutput(`${result.stdout}\n${result.stderr}`)
    if (!parsed.end) {
      throw new AppError('ssh-error', 'The remote probe did not complete', tail(`${result.stderr}\n${result.stdout}`))
    }
    const info = {
      os: parsed.os,
      arch: parsed.arch,
      hostname: parsed.hostname,
      user: parsed.user,
      home: parsed.home,
      dsh: parsed.dsh,
      dshVersion: parsed.dshVersion,
      node: parsed.node,
      npm: parsed.npm,
      pathExists: parsed.dir === 'ok',
      profileExists: parsed.profile === 'exists',
    }
    runtime.info = info
    if (info.os && !/^(Linux|Darwin)$/i.test(info.os)) {
      throw new AppError('unsupported-remote', `Remote operating system ${info.os} is not supported`, null, { info })
    }
    if (!info.pathExists) {
      throw new AppError('path-missing', 'The remote workspace directory does not exist', host.remotePath, { info })
    }
    return { info, secret, askpass }
  }

  async launchOnce(host, runtime, probe, alive) {
    const localPort = await reserveLocalPort()
    const remotePort = randomRemotePort()
    const command = buildLaunchCommand({
      remotePath: host.remotePath,
      dsh: probe.info.dsh,
      dshCommand: host.dshCommand,
      profile: host.profile,
      profileExists: probe.info.profileExists,
      port: remotePort,
    })
    const invocation = sshInvocation(host, command, {
      connectTimeoutSec: this.config.connectTimeoutSec,
      batchMode: !probe.secret,
      forward: true,
      tty: true,
    })
    const marker = invocation.indexOf('--')
    invocation.splice(marker, 0, '-L', `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`)
    this.log(runtime, 'info', `Starting remote dsh on port ${remotePort} ...`)
    runtime.phase = 'launching'
    const myRun = runtime.runId
    const child = startSsh(this.config.sshExecutable, invocation, { env: probe.askpass?.env ?? {} })
    runtime.child = child
    runtime.localPort = localPort
    runtime.remotePort = remotePort
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')

    let stderr = ''
    let stdout = ''
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-64 * 1024)
    })

    const remoteUrl = await new Promise((resolve, reject) => {
      let settled = false
      let found = false
      let timer = null
      const onExit = (code, signal) => {
        if (!settled) {
          settled = true
          if (timer) clearTimeout(timer)
          reject(classifyLaunchFailure({ code, signal, stderr, stdout }, remotePort))
          return
        }
        if (this.disposed || runtime.runId !== myRun || runtime.phase !== 'ready') return
        runtime.phase = 'error'
        runtime.url = null
        runtime.error = {
          code: 'tunnel-closed',
          message: `The SSH tunnel closed${code === null ? '' : ` (exit ${code})`}${signal ? ` (${signal})` : ''}`,
          detail: tail(stderr),
        }
        this.log(runtime, 'error', runtime.error.message)
        this.killChild(runtime)
        this.proxy.destroy(id)
        runtime.proxy = null
        void runtime.askpass?.dispose().catch(() => {})
        runtime.askpass = null
      }
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        fn(value)
      }
      const onLine = (line) => {
        const url = parseStartupUrl(line)
        if (!url) {
          this.log(runtime, 'remote', line)
          return
        }
        if (found) return
        found = true
        this.log(runtime, 'info', 'Remote dsh reported its startup URL')
        const reportedPort = Number(url.port || (url.protocol === 'http:' ? 80 : 443))
        if (reportedPort !== remotePort) {
          finish(reject, new AppError('launch-failed', `Remote dsh reported port ${reportedPort}, expected ${remotePort}`))
          return
        }
        void waitForLocalPort(localPort, 6000).then((ok) => {
          if (!ok) {
            finish(reject, new AppError('forward-failed', 'The local SSH tunnel did not become reachable'))
            return
          }
          if (this.disposed || runtime.runId !== myRun) {
            finish(reject, new AppError('cancelled', 'The connection attempt was cancelled'))
            return
          }
          const localUrl = rewriteTunnelUrl(url, localPort)
          runtime.url = localUrl
          runtime.phase = 'ready'
          finish(resolve, url)
        })
      }
      const outReader = createLineReader(onLine)
      const errReader = createLineReader(onLine)
      child.stdout?.on('data', (chunk) => {
        stdout = (stdout + chunk).slice(-64 * 1024)
        outReader.push(chunk)
      })
      child.stderr?.on('data', (chunk) => errReader.push(chunk))
      child.once('error', (error) => {
        finish(reject, error?.code === 'ENOENT'
          ? new AppError('ssh-missing', 'The local ssh client was not found', String(error.message ?? ''))
          : new AppError('launch-failed', 'The SSH process failed to start', String(error?.message ?? error)))
      })
      child.once('exit', onExit)
      timer = setTimeout(() => {
        finish(reject, new AppError('launch-timeout', 'Timed out waiting for remote dsh to start', tail(stderr)))
        this.killChild(runtime)
      }, this.config.launchTimeoutMs)
      timer.unref?.()
    })

    if (!alive()) return
    if (runtime.phase !== 'ready') {
      throw new AppError('tunnel-closed', 'The SSH tunnel closed immediately after startup')
    }
    this.log(runtime, 'info', `SSH tunnel established on 127.0.0.1:${localPort}`)
    return remoteUrl
  }

  async disconnect(id, options = {}) {
    await this.ready
    const runtime = this.runtime.get(id)
    if (!runtime) return { phase: 'idle' }
    runtime.runId += 1
    runtime.phase = 'disconnecting'
    this.proxy.destroy(id)
    runtime.proxy = null
    const child = runtime.child
    this.killChild(runtime)
    await waitForChildExit(child, 3000)
    await runtime.askpass?.dispose().catch(() => {})
    runtime.askpass = null
    runtime.url = null
    runtime.info = null
    runtime.error = null
    if (!options.quiet) this.log(runtime, 'info', 'Disconnected')
    runtime.phase = 'idle'
    return { phase: 'idle' }
  }

  async install(id) {
    await this.ready
    const host = this.requireHost(id)
    if (!this.sshAvailable) throw new AppError('ssh-missing', 'The local ssh client was not found')
    const runtime = this.ensureRuntime(host)
    if (['connecting', 'probing', 'launching', 'installing'].includes(runtime.phase)) {
      throw new AppError('busy', 'This connection is busy')
    }
    if (runtime.phase === 'ready') await this.disconnect(id, { quiet: true })
    runtime.runId += 1
    const runId = runtime.runId
    runtime.phase = 'installing'
    runtime.error = null
    runtime.url = null
    runtime.info = null
    runtime.logs = []
    await runtime.askpass?.dispose().catch(() => {})
    runtime.askpass = null
    void this.runInstall(host, runtime, runId)
    return { phase: runtime.phase }
  }

  async runInstall(host, runtime, runId) {
    const alive = () => !this.disposed && runtime.runId === runId
    try {
      const secret = await this.getSecret(host)
      let askpass = null
      if (secret) {
        askpass = await createAskpass(secret)
        runtime.askpass = askpass
      }
      this.log(runtime, 'info', `Installing @deepseek-ai/dsh on ${host.target} ...`)
      const command = `sh -lc 'npm install -g @deepseek-ai/dsh'`
      const result = await runSsh(
        this.config.sshExecutable,
        sshInvocation(host, command, {
          connectTimeoutSec: this.config.connectTimeoutSec,
          batchMode: !secret,
        }),
        {
          env: askpass?.env ?? {},
          timeoutMs: this.config.installTimeoutMs,
          onLine: (line) => this.log(runtime, 'ssh', line),
        },
      )
      if (!alive()) return
      if (result.error?.code === 'ENOENT') throw new AppError('ssh-missing', 'The local ssh client was not found')
      if (result.code !== 0) {
        const text = `${result.stderr}\n${result.stdout}`
        if (/npm: (command )?not found|npm: not found/i.test(text)) {
          throw new AppError('npm-missing', 'npm was not found on the remote host', tail(text))
        }
        if (/EACCES|permission denied/i.test(text)) {
          throw new AppError('install-failed', 'npm could not write to its global prefix on the remote host', tail(text))
        }
        if (/Permission denied \(publickey|password|keyboard-interactive\)|Authentication failed|Too many authentication failures/i.test(text)) {
          throw new AppError('auth-failed', 'SSH authentication failed', tail(text))
        }
        if (/Could not resolve hostname|Connection refused|Connection timed out|No route to host|Network is unreachable/i.test(text)) {
          throw classifySshFailure(result)
        }
        throw new AppError('install-failed', 'Installing remote dsh failed', tail(text))
      }
      this.log(runtime, 'info', 'Remote dsh installed. Reconnect to start it.')
      runtime.phase = 'idle'
      runtime.error = null
    } catch (error) {
      if (!alive()) return
      const failure = error instanceof AppError
        ? error
        : new AppError('install-failed', error instanceof Error ? error.message : String(error))
      runtime.phase = 'error'
      runtime.error = { code: failure.code, message: failure.message, detail: failure.detail ?? null }
      this.log(runtime, 'error', `${failure.message}${failure.detail ? `: ${failure.detail}` : ''}`)
    } finally {
      await runtime.askpass?.dispose().catch(() => {})
      runtime.askpass = null
    }
  }

  async logs(id) {
    await this.ready
    this.requireHost(id)
    const runtime = this.runtime.get(id)
    return {
      phase: runtime?.phase ?? 'idle',
      error: runtime?.error ?? null,
      lines: runtime?.logs ?? [],
    }
  }

  async createProxy(id) {
    await this.ready
    const runtime = this.runtime.get(id)
    if (!runtime || runtime.phase !== 'ready' || !runtime.url || !runtime.localPort || !runtime.remotePort) {
      throw new AppError('not-ready', 'This workspace is not ready')
    }
    if (runtime.proxy && runtime.proxy.server
      && runtime.proxy.localPort === runtime.localPort
      && runtime.proxy.remotePort === runtime.remotePort) {
      return { url: this.proxy.urlFor(runtime.proxy) }
    }
    try {
      runtime.proxy = await this.proxy.createSession({
        id,
        localPort: runtime.localPort,
        remotePort: runtime.remotePort,
        remoteUrl: runtime.url,
      })
      return { url: this.proxy.urlFor(runtime.proxy) }
    } catch (error) {
      runtime.proxy = null
      throw new AppError('proxy-failed', 'The embedded remote UI could not authenticate', error instanceof Error ? error.message : String(error))
    }
  }

  async markOpened(id) {
    await this.ready
    const host = this.requireHost(id)
    host.lastOpenedAt = new Date().toISOString()
    await this.saveHosts().catch(() => {})
    return { lastOpenedAt: host.lastOpenedAt }
  }

  async open(id) {
    await this.ready
    const runtime = this.runtime.get(id)
    if (!runtime || runtime.phase !== 'ready' || !runtime.url) {
      throw new AppError('not-ready', 'This connection is not ready')
    }
    let parsed
    try {
      parsed = new URL(runtime.url)
    } catch {
      throw new AppError('not-ready', 'The remote URL is invalid')
    }
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || Number(parsed.port) !== runtime.localPort) {
      throw new AppError('not-ready', 'The remote URL is not an owned tunnel address')
    }
    if (!openExternalUrl(runtime.url)) {
      throw new AppError('open-failed', 'Could not open the default browser')
    }
    const marked = await this.markOpened(id).catch(() => null)
    return { opened: true, lastOpenedAt: marked?.lastOpenedAt ?? null }
  }

  killChild(runtime) {
    const child = runtime.child
    runtime.child = null
    if (!child || child.exitCode !== null) return
    try {
      child.stdin?.write('\u0003')
    } catch {
      // the remote side may already be gone
    }
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
      }
    }, 2500)
    timer.unref?.()
  }

  async dispose() {
    this.disposed = true
    clearInterval(this.mirrorTimer)
    this.mirrorTimer = null
    this.uninstallServiceBridge()
    this.uninstallFileSurfaceBridges()
    for (const runtime of this.runtime.values()) {
      runtime.runId += 1
      this.killChild(runtime)
      await runtime.askpass?.dispose().catch(() => {})
      runtime.askpass = null
    }
    this.runtime.clear()
    this.proxy.close()
  }
}
