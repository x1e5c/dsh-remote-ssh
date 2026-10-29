export const name = 'remote-fs-approval'
export const inject = ['tools']

/**
 * Remote commands normally ask before running. When the bound host is
 * executing in the detected bwrap sandbox, bash is auto-approved: it can only
 * write the workspace and /tmp. write/edit still ask because the remote fs
 * tools write through direct SSH, outside bwrap.
 *
 * Set `sandboxAutoApprove: false` to keep the bash prompt in the sandbox.
 */
export function apply(ctx, config = {}) {
  const sandboxAutoApprove = config?.sandboxAutoApprove !== false
  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'bash') {
      if (sandboxAutoApprove) {
        let binding = null
        try {
          binding = ctx.get('remoteSshWorkspace')?.current?.() ?? null
        } catch {
          binding = null
        }
        if (binding?.sandbox === 'bwrap') return next()
      }
      return { kind: 'ask', reason: 'run a command on the remote SSH workspace' }
    }
    if (exec.name !== 'write' && exec.name !== 'edit') return next()
    const args = exec.arguments ?? {}
    const path = typeof args.file_path === 'string'
      ? args.file_path
      : typeof args.path === 'string'
        ? args.path
        : 'a remote file'
    return {
      kind: 'ask',
      reason: `${exec.name} ${path} on the remote SSH workspace`,
    }
  }), 'remote-fs: conditional sandbox approval')
}
