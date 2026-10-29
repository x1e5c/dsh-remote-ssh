import { spawn } from 'node:child_process'
import { posix } from 'node:path'
import { shellQuote } from './lib/remote.js'

export const name = 'remote-agent-tools'
export const inject = ['tools']

const MAX_OUTPUT = 8 * 1024 * 1024
const OUTPUT_SCHEMA = { type: 'object', additionalProperties: true }

function text(value) {
  return [{ type: 'text', text: String(value) }]
}

function requireConfig(config) {
  if (typeof config?.host !== 'string' || config.host === '') throw new Error('remote-agent-tools requires config.host')
  if (typeof config?.remotePath !== 'string' || !config.remotePath.startsWith('/')) {
    throw new Error('remote-agent-tools requires an absolute config.remotePath')
  }
  return {
    host: config.host,
    remotePath: config.remotePath,
    sshExecutable: config.sshExecutable ?? 'ssh',
    connectTimeoutSec: config.connectTimeoutSec ?? 15,
    approval: config.approval !== false,
    autoApprove: config.autoApprove === true,
    tools: Array.isArray(config.tools) && config.tools.length > 0 ? config.tools.map(String) : null,
  }
}

export function resolveRemotePath(config, value) {
  if (typeof value !== 'string' || value === '') throw new Error('path is required')
  if (value.startsWith('/')) return posix.normalize(value)
  return posix.normalize(posix.join(config.remotePath, value))
}

export function buildRemoteCommand(script) {
  return `sh -lc ${shellQuote(script)}`
}

export function runRemote(config, script, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000
  const maxOutput = options.maxBytes ?? MAX_OUTPUT
  const argv = [
    '-o', 'BatchMode=yes',
    '-o', `ConnectTimeout=${config.connectTimeoutSec}`,
    '-o', 'ServerAliveInterval=15',
    config.host,
    buildRemoteCommand(script),
  ]
  return new Promise((resolve, reject) => {
    const child = spawn(config.sshExecutable, argv, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const out = []
    const err = []
    let bytes = 0
    let timedOut = false
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener?.('abort', onAbort)
      if (error) reject(error)
      else resolve(result)
    }
    const onAbort = () => {
      child.kill()
      finish(Object.assign(new Error('remote command aborted'), { code: 'aborted' }))
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    timer.unref?.()
    options.signal?.addEventListener?.('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes <= maxOutput) out.push(chunk)
      else child.kill()
    })
    child.stderr.on('data', (chunk) => {
      if (err.length < 256) err.push(chunk)
    })
    child.once('error', (error) => {
      finish(error?.code === 'ENOENT'
        ? Object.assign(new Error('The local ssh client was not found'), { code: 'ssh-missing' })
        : error)
    })
    child.once('close', (code) => {
      finish(null, {
        code: code ?? -1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
        truncated: bytes > MAX_OUTPUT,
      })
    })
    if (options.stdin === undefined) child.stdin.end()
    else child.stdin.end(options.stdin)
  })
}

async function approve(ctx, exec, cfg, toolName, reason) {
  if (cfg.autoApprove) return
  if (!cfg.approval) return
  const approval = ctx.get('approval')
  if (!approval || !exec?.agent) return
  const outcome = await approval.request({
    agent: exec.agent,
    toolName,
    callId: exec.callId,
    reason,
    signal: exec.signal,
  })
  if (outcome !== 'allowed-once') throw new Error(`remote ${toolName} was not approved (${outcome})`)
}

function globTool(ctx, cfg) {
  return {
    name: 'glob',
    description: 'List files in the remote SSH workspace matching a shell glob pattern. Supports ** when the remote has bash.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, for example src/**/*.ts.' },
        path: { type: 'string', description: 'Directory to search; defaults to the remote workspace root.' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(value.text) },
    async execute(args, exec) {
      const root = args.path ? resolveRemotePath(cfg, args.path) : cfg.remotePath
      const script = [
        `cd -- ${shellQuote(root)}`,
        'shopt -s globstar nullglob',
        `compgen -G ${shellQuote(args.pattern)} | head -n 200`,
      ].join('\n')
      const result = await runRemote(cfg, `bash -lc ${shellQuote(script)}`, { timeoutMs: 60000, signal: exec.signal })
      if (result.code !== 0) throw new Error(`remote glob ${args.pattern}: ${result.stderr.trim() || `exit ${result.code}`}`)
      const matches = result.stdout.split(/\r?\n/).filter((line) => line !== '')
      return { text: matches.length === 0 ? '(no matches)' : matches.join('\n'), matches }
    },
  }
}

function grepTool(ctx, cfg) {
  return {
    name: 'grep',
    description: 'Search text under the remote SSH workspace with grep.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'File or directory to search; defaults to the remote workspace root.' },
        maxResults: { type: 'number', description: 'Maximum matching lines to return.' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(value.text) },
    async execute(args, exec) {
      const target = args.path ? resolveRemotePath(cfg, args.path) : cfg.remotePath
      const limit = Number.isSafeInteger(args.maxResults) && args.maxResults > 0 ? Math.min(args.maxResults, 1000) : 200
      const script = `grep -R -n -I -- ${shellQuote(args.pattern)} ${shellQuote(target)} | head -n ${limit}`
      const result = await runRemote(cfg, script, { timeoutMs: 60000, signal: exec.signal })
      if (result.code !== 0 && result.code !== 1) {
        throw new Error(`remote grep: ${result.stderr.trim() || `exit ${result.code}`}`)
      }
      return { text: result.stdout.trim() || '(no matches)' }
    },
  }
}

function readTool(ctx, cfg) {
  return {
    name: 'read',
    description: 'Read a UTF-8 text file from the remote SSH workspace. Paths may be absolute on the remote host or relative to the configured remote workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Remote file path.' },
        offset: { type: 'number', description: 'Byte offset to start reading.' },
        limit: { type: 'number', description: 'Maximum bytes to return.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(value.text) },
    async execute(args, exec) {
      const path = resolveRemotePath(cfg, args.path)
      const result = await runRemote(cfg, `base64 < ${shellQuote(path)}`, { timeoutMs: 60_000, signal: exec.signal })
      if (result.code !== 0) throw new Error(`remote read ${path}: ${result.stderr.trim() || `exit ${result.code}`}`)
      const buffer = Buffer.from(result.stdout.replace(/\s+/g, ''), 'base64')
      const offset = Number.isSafeInteger(args.offset) && args.offset > 0 ? args.offset : 0
      const limit = Number.isSafeInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 512 * 1024) : 256 * 1024
      const slice = buffer.subarray(offset, offset + limit)
      return {
        text: slice.toString('utf8'),
        path,
        bytes: buffer.length,
        truncated: buffer.length > offset + limit,
      }
    },
  }
}

function writeTool(ctx, cfg) {
  return {
    name: 'write',
    description: 'Create or replace a UTF-8 text file in the remote SSH workspace. Parent directories are created.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Remote file path.' },
        content: { type: 'string', description: 'Complete file content.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(value.text) },
    async execute(args, exec) {
      const path = resolveRemotePath(cfg, args.path)
      await approve(ctx, exec, cfg, 'write', `write ${path} on ${cfg.host}`)
      const dir = posix.dirname(path)
      const encoded = Buffer.from(args.content, 'utf8').toString('base64')
      const result = await runRemote(
        cfg,
        `mkdir -p ${shellQuote(dir)} && base64 -d > ${shellQuote(path)}`,
        { stdin: encoded, timeoutMs: 60_000, signal: exec.signal },
      )
      if (result.code !== 0) throw new Error(`remote write ${path}: ${result.stderr.trim() || `exit ${result.code}`}`)
      return { text: `Wrote ${Buffer.byteLength(args.content, 'utf8')} bytes to ${path}`, path }
    },
  }
}

function editTool(ctx, cfg) {
  return {
    name: 'edit',
    description: 'Apply a literal text replacement to a UTF-8 file in the remote SSH workspace. Fails when the old text is missing.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Remote file path.' },
        old_string: { type: 'string', description: 'Exact text to replace.' },
        new_string: { type: 'string', description: 'Replacement text.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence.' },
      },
      required: ['path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(value.text) },
    async execute(args, exec) {
      const path = resolveRemotePath(cfg, args.path)
      const read = await runRemote(cfg, `base64 < ${shellQuote(path)}`, { timeoutMs: 60_000, signal: exec.signal })
      if (read.code !== 0) throw new Error(`remote edit read ${path}: ${read.stderr.trim() || `exit ${read.code}`}`)
      const source = Buffer.from(read.stdout.replace(/\s+/g, ''), 'base64').toString('utf8')
      if (!source.includes(args.old_string)) throw new Error(`remote edit ${path}: old_string was not found`)
      const next = args.replace_all === true
        ? source.split(args.old_string).join(args.new_string)
        : source.replace(args.old_string, args.new_string)
      const count = args.replace_all === true
        ? source.split(args.old_string).length - 1
        : 1
      await approve(ctx, exec, cfg, 'edit', `edit ${path} on ${cfg.host}`)
      const encoded = Buffer.from(next, 'utf8').toString('base64')
      const result = await runRemote(
        cfg,
        `base64 -d > ${shellQuote(path)}`,
        { stdin: encoded, timeoutMs: 60_000, signal: exec.signal },
      )
      if (result.code !== 0) throw new Error(`remote edit write ${path}: ${result.stderr.trim() || `exit ${result.code}`}`)
      return { text: `Replaced ${count} occurrence(s) in ${path}`, path, replacements: count }
    },
  }
}

function bashTool(ctx, cfg) {
  return {
    name: 'bash',
    description: 'Run a shell command in the configured remote SSH workspace. The command runs on the remote host, not the local machine.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run on the remote host.' },
        description: { type: 'string', description: 'Short description of what the command does.' },
        timeoutMs: { type: 'number', description: 'Maximum run time in milliseconds.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    output: { schema: OUTPUT_SCHEMA, render: (_args, value) => text(value.text) },
    async execute(args, exec) {
      await approve(ctx, exec, cfg, 'bash', args.description ?? `run on ${cfg.host}`)
      const timeoutMs = Number.isSafeInteger(args.timeoutMs) && args.timeoutMs > 0
        ? Math.min(args.timeoutMs, 600_000)
        : 120_000
      const script = `cd -- ${shellQuote(cfg.remotePath)} && sh -lc ${shellQuote(args.command)}`
      const result = await runRemote(cfg, script, { timeoutMs, signal: exec.signal })
      const parts = []
      if (result.stdout) parts.push(result.stdout)
      if (result.stderr) parts.push(`[stderr]\n${result.stderr}`)
      if (result.timedOut) parts.push(`[timed out after ${timeoutMs}ms]`)
      if (result.truncated) parts.push('[output truncated]')
      return {
        text: parts.join('\n').trim() || `exit ${result.code}`,
        exitCode: result.code,
        timedOut: result.timedOut,
      }
    },
  }
}

export function apply(ctx, config) {
  const cfg = requireConfig(config)
  const builders = {
    glob: globTool,
    grep: grepTool,
    read: readTool,
    write: writeTool,
    edit: editTool,
    bash: bashTool,
  }
  const names = cfg.tools ?? Object.keys(builders)
  for (const toolName of names) {
    const build = builders[toolName]
    if (!build) throw new Error(`remote-agent-tools: unknown tool ${JSON.stringify(toolName)}`)
    ctx.tools.register(build(ctx, cfg))
  }
}
