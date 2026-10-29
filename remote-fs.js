import { posix } from 'node:path'
import { resolveRemotePath, runRemote } from './remote-tools.js'
import { shellQuote } from './lib/remote.js'

export const name = 'remote-agent-fs'
export const inject = []

function fsError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeConfig(config) {
  if (typeof config?.host !== 'string' || config.host === '') throw new Error('remote-agent-fs requires config.host')
  if (typeof config?.remotePath !== 'string' || !config.remotePath.startsWith('/')) {
    throw new Error('remote-agent-fs requires an absolute config.remotePath')
  }
  return {
    host: config.host,
    remotePath: config.remotePath,
    sshExecutable: config.sshExecutable ?? 'ssh',
    connectTimeoutSec: config.connectTimeoutSec ?? 15,
  }
}

function remotePath(config, path) {
  return resolveRemotePath(config, path)
}

function targetOf(path) {
  return { targetKey: path, displayPath: path }
}

export function createRemoteFileSystem(config, run = runRemote) {
  const cfg = normalizeConfig(config)

  async function exec(script, options = {}) {
    return run(cfg, script, options)
  }

  async function stat(target, signal) {
    const path = target.targetKey
    const result = await exec(`stat -c '%F|%s|%Y' -- ${shellQuote(path)}`, { signal, timeoutMs: 30000 })
    if (result.code !== 0) {
      const stderr = String(result.stderr ?? '')
      if (stderr.includes('No such file') || stderr.includes('cannot stat')) return undefined
      throw fsError(`cannot stat ${path}: ${stderr.trim() || `exit ${result.code}`}`, 'FS_IO_ERROR')
    }
    const [kind, sizeText, mtimeText] = result.stdout.trim().split('|')
    const size = Number(sizeText)
    const mtime = Number(mtimeText)
    return {
      version: `${Number.isFinite(mtime) ? mtime : 0}:${Number.isFinite(size) ? size : 0}`,
      type: kind === 'directory' ? 'directory' : 'file',
      size: Number.isFinite(size) ? size : 0,
    }
  }

  async function readWhole(path, signal, maxBytes = 8 * 1024 * 1024) {
    const result = await exec(`base64 < ${shellQuote(path)}`, { signal, timeoutMs: 120000, maxBytes })
    if (result.code !== 0) throw fsError(`cannot read ${path}: ${String(result.stderr ?? '').trim() || `exit ${result.code}`}`, 'FS_IO_ERROR')
    return Buffer.from(result.stdout.replace(/\s+/g, ''), 'base64')
  }

  async function readText(target, signal) {
    const info = await stat(target, signal)
    if (!info) throw fsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
    if (info.type !== 'file') throw fsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
    const maxOutput = Math.min(160 * 1024 * 1024, Math.max(8 * 1024 * 1024, info.size * 2 + 1024 * 1024))
    const bytes = await readWhole(target.targetKey, signal, maxOutput)
    if (bytes.subarray(0, 8192).includes(0)) throw fsError(`cannot read "${target.displayPath}": binary file`, 'FS_NOT_TEXT')
    return bytes.toString('utf8')
  }

  async function readBytes(target, signal, maxBytes) {
    const info = await stat(target, signal)
    if (!info) throw fsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
    if (info.type !== 'file') throw fsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
    if (info.size > maxBytes) throw fsError(`cannot read "${target.displayPath}": ${info.size} bytes exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE')
    const maxOutput = Math.min(160 * 1024 * 1024, Math.max(8 * 1024 * 1024, info.size * 2 + 1024 * 1024))
    const bytes = await readWhole(target.targetKey, signal, maxOutput)
    if (bytes.length > maxBytes) throw fsError(`cannot read "${target.displayPath}": content exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE')
    return bytes
  }

  async function readByteRange(target, range, signal) {
    const offset = Number.isSafeInteger(range?.offset) ? range.offset : Number.isSafeInteger(range?.start) ? range.start : 0
    const length = Number.isSafeInteger(range?.length) ? range.length : Number.isSafeInteger(range?.end) ? range.end - offset : 64 * 1024
    const count = Math.max(0, length)
    if (count === 0) return Buffer.alloc(0)
    const maxOutput = Math.min(160 * 1024 * 1024, Math.max(8 * 1024 * 1024, Math.ceil(count * 4 / 3) + 1024 * 1024))
    const result = await exec(
      `tail -c +${offset + 1} -- ${shellQuote(target.targetKey)} | head -c ${count} | base64`,
      { signal, timeoutMs: 120000, maxBytes: maxOutput },
    )
    if (result.code !== 0) throw fsError(`cannot read "${target.displayPath}": ${String(result.stderr ?? '').trim() || `exit ${result.code}`}`, 'FS_IO_ERROR')
    return Buffer.from(result.stdout.replace(/\s+/g, ''), 'base64')
  }

  async function listDir(target, signal) {
    const info = await stat(target, signal)
    if (!info) throw fsError(`cannot list "${target.displayPath}": not found`, 'FS_NOT_FOUND')
    if (info.type !== 'directory') throw fsError(`cannot list "${target.displayPath}": not a directory`, 'FS_NOT_DIRECTORY')
    const result = await exec(
      `find ${shellQuote(target.targetKey)} -mindepth 1 -maxdepth 1 -printf '%f|%y|%s|%T@\\n'`,
      { signal, timeoutMs: 60000 },
    )
    if (result.code !== 0) throw fsError(`cannot list "${target.displayPath}": ${String(result.stderr ?? '').trim() || `exit ${result.code}`}`, 'FS_IO_ERROR')
    const entries = []
    for (const line of result.stdout.split(/\r?\n/)) {
      if (line === '') continue
      const [entryName, kind, sizeText, mtimeText] = line.split('|')
      if (!entryName) continue
      const path = posix.join(target.targetKey, entryName)
      entries.push({
        name: entryName,
        type: kind === 'd' ? 'directory' : kind === 'l' ? 'symlink' : 'file',
        target: { targetKey: path, displayPath: path },
        version: `${Number(mtimeText) || 0}:${Number(sizeText) || 0}`,
        size: Number(sizeText) || 0,
      })
    }
    return entries
  }

  async function writeWhole(path, content, signal) {
    const dir = posix.dirname(path)
    const encoded = Buffer.from(content, 'utf8').toString('base64')
    const result = await exec(
      `mkdir -p ${shellQuote(dir)} && base64 -d > ${shellQuote(path)}`,
      { signal, timeoutMs: 60000, stdin: encoded },
    )
    if (result.code !== 0) throw fsError(`cannot write "${path}": ${String(result.stderr ?? '').trim() || `exit ${result.code}`}`, 'FS_IO_ERROR')
  }

  async function writeText(target, content, expected, signal) {
    const existing = await stat(target, signal)
    if (existing && existing.type !== 'file') throw fsError(`cannot write "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
    if (expected?.kind === 'replaceIfVersion') {
      if (!existing) throw fsError(`cannot write "${target.displayPath}": file no longer exists`, 'FS_STALE_VERSION')
      if (existing.version !== expected.version) throw fsError(`cannot write "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
    } else if (expected?.kind === 'createIfAbsent' && existing) {
      throw fsError(`cannot overwrite existing "${target.displayPath}" without reading it first`, 'FS_NOT_OBSERVED')
    }
    const before = existing ? await readText(target, signal) : null
    await writeWhole(target.targetKey, content, signal)
    const after = await stat(target, signal)
    return {
      operation: existing ? 'update' : 'create',
      version: after?.version ?? `missing:${target.targetKey}`,
      before,
      after: content,
    }
  }

  async function editText(target, edit, expected, signal) {
    const existing = await stat(target, signal)
    if (!existing) throw fsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
    if (existing.type !== 'file') throw fsError(`cannot edit "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
    if (expected && existing.version !== expected.version) throw fsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
    const source = await readText(target, signal)
    if (edit.oldString.length === 0) throw fsError('old_string must be a non-empty string', 'FS_EDIT_NOT_FOUND')
    if (!source.includes(edit.oldString)) throw fsError(`old_string was not found in "${target.displayPath}"`, 'FS_EDIT_NOT_FOUND')
    const count = source.split(edit.oldString).length - 1
    if (!edit.replaceAll && count > 1) {
      throw fsError(`old_string matched ${count} times in "${target.displayPath}"; provide a more specific old_string or set replace_all to true`, 'FS_AMBIGUOUS_EDIT')
    }
    const next = edit.replaceAll ? source.split(edit.oldString).join(edit.newString) : source.replace(edit.oldString, edit.newString)
    await writeWhole(target.targetKey, next, signal)
    const after = await stat(target, signal)
    return {
      version: after?.version ?? `missing:${target.targetKey}`,
      before: source,
      after: edit.replaceAll ? next : source.replace(edit.oldString, edit.newString),
    }
  }

  async function watch(target, changed, signal) {
    let stopped = false
    let last = (await stat(target, signal))?.version
    const timer = setInterval(async () => {
      if (stopped) return
      try {
        const next = (await stat(target, signal))?.version
        if (next !== last) {
          last = next
          changed()
        }
      } catch (error) {
        changed(error)
      }
    }, 1000)
    timer.unref?.()
    signal?.addEventListener?.('abort', () => {
      stopped = true
      clearInterval(timer)
    }, { once: true })
    return async () => {
      stopped = true
      clearInterval(timer)
    }
  }

  return {
    async resolve(path, opts) {
      const base = typeof opts?.cwd === 'string' && opts.cwd.startsWith('/') ? opts.cwd : cfg.remotePath
      const value = typeof path === 'string' && path.startsWith('/')
        ? path
        : posix.join(base, typeof path === 'string' ? path : '')
      return targetOf(posix.normalize(value))
    },
    processPath(target) {
      return target.targetKey
    },
    processPathFromHostPath(path) {
      return typeof path === 'string' && path.startsWith('/') ? posix.normalize(path) : undefined
    },
    fileUrl() {
      return undefined
    },
    contains(parent, child) {
      const rel = posix.relative(parent.targetKey, child.targetKey)
      return rel === '' || (!rel.startsWith('..') && !posix.isAbsolute(rel))
    },
    stat,
    lstat: stat,
    async readText(target, signal) {
      return readText(target, signal)
    },
    async streamText(target, signal) {
      const content = await readText(target, signal)
      return (async function* () { yield content })()
    },
    async readBytes(target, signal, maxBytes) {
      return readBytes(target, signal, maxBytes)
    },
    async readByteRange(target, range, signal) {
      return readByteRange(target, range, signal)
    },
    async listDir(target, signal) {
      return listDir(target, signal)
    },
    async writeText(target, content, expected, signal) {
      return writeText(target, content, expected, signal)
    },
    async editText(target, edit, expected, signal) {
      return editText(target, edit, expected, signal)
    },
    watch,
    async close() {},
  }
}

export function createBoundRemoteFileSystem(ctx) {
  const services = new Map()

  function service() {
    const binding = ctx.get('remoteSshWorkspace')?.current?.()
    if (!binding || !binding.host || !binding.remotePath) {
      throw fsError(
        'No Remote Agent workspace is bound to the current session. Create or open a remote workspace first.',
        'FS_NO_REMOTE_WORKSPACE',
      )
    }
    const key = `${binding.host}\u0000${binding.remotePath}`
    let current = services.get(key)
    if (!current) {
      current = createRemoteFileSystem({ host: binding.host, remotePath: binding.remotePath })
      services.set(key, current)
    }
    return current
  }

  const bound = {
    async watch(...args) { return service().watch(...args) },
    async resolve(...args) { return service().resolve(...args) },
    processPath(...args) { return service().processPath(...args) },
    fileUrl(...args) { return service().fileUrl(...args) },
    contains(...args) { return service().contains(...args) },
    async stat(...args) { return service().stat(...args) },
    async lstat(...args) { return service().lstat(...args) },
    async readText(...args) { return service().readText(...args) },
    async streamText(...args) { return service().streamText(...args) },
    async readBytes(...args) { return service().readBytes(...args) },
    async readByteRange(...args) { return service().readByteRange(...args) },
    async listDir(...args) { return service().listDir(...args) },
    async writeText(...args) { return service().writeText(...args) },
    async editText(...args) { return service().editText(...args) },
    async close() {},
  }
  return bound
}

export function apply(ctx, config) {
  const service = typeof config?.host === 'string' && config?.host !== ''
    ? createRemoteFileSystem(config)
    : createBoundRemoteFileSystem(ctx)
  ctx.provide('fs', service)
}
