import { posix } from 'node:path'
import { currentRemoteWorkspace } from './lib/binding-service.js'

export const name = 'remote-fs-approval'
export const inject = ['tools']

export function isWithinRemoteWorkspace(remoteRoot, rawPath) {
  if (typeof remoteRoot !== 'string' || !remoteRoot.startsWith('/')) return false
  if (typeof rawPath !== 'string') return false
  const trimmed = rawPath.trim()
  if (trimmed === '' || trimmed.includes('\0') || /^[A-Za-z]:[\\/]/.test(trimmed)) return false
  const normalizedInput = trimmed.replace(/\\/g, '/')
  const root = posix.normalize(remoteRoot).replace(/\/+$/, '') || '/'
  const resolved = normalizedInput.startsWith('/')
    ? posix.normalize(normalizedInput)
    : posix.normalize(posix.join(root, normalizedInput))
  if (root === '/') return resolved.startsWith('/')
  return resolved === root || resolved.startsWith(`${root}/`)
}

/**
 * Remote commands normally ask before running. When the bound host is
 * executing in the detected bwrap sandbox:
 * - bash is auto-approved (bwrap restricts writes to the workspace and /tmp);
 * - write/edit targeting paths inside the bound remote workspace are
 *   auto-approved (remote-fs also rejects symlink escapes out of the workspace);
 * - write/edit targeting paths outside the remote workspace still ask.
 *
 * Set `sandboxAutoApprove: false` to keep prompts even in the sandbox.
 */
export function apply(ctx, config = {}) {
  const sandboxAutoApprove = config?.sandboxAutoApprove !== false
  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    const binding = currentRemoteWorkspace(ctx)
    const inBwrapSandbox = sandboxAutoApprove && binding?.sandbox === 'bwrap'

    if (exec.name === 'bash') {
      if (inBwrapSandbox) return next()
      return { kind: 'ask', reason: 'run a command on the remote SSH workspace' }
    }
    if (exec.name !== 'write' && exec.name !== 'edit') return next()
    const args = exec.arguments ?? {}
    const rawPath = typeof args.file_path === 'string'
      ? args.file_path
      : typeof args.path === 'string'
        ? args.path
        : ''
    const displayPath = rawPath || 'a remote file'
    if (inBwrapSandbox && isWithinRemoteWorkspace(binding?.remotePath, rawPath)) {
      return next()
    }
    return {
      kind: 'ask',
      reason: inBwrapSandbox && binding?.remotePath
        ? `${exec.name} ${displayPath} outside the remote SSH workspace (${binding.remotePath})`
        : `${exec.name} ${displayPath} on the remote SSH workspace`,
    }
  }), 'remote-fs: conditional sandbox approval')
}
