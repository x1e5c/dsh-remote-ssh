export const name = 'remote-tool-restrict'
export const inject = ['tools']

// Global Host tools that can be hidden from the agent with tools.restrict().
const GLOBAL_HOST_TOOLS = [
  'ops_read_files',
  'working_directory',
  'render_ui',
  'validate_dsh_ui',
]

// Scope-local Host tools that tools.restrict() cannot name; deny their calls
// at pre-execute so the model must fall back to the remote tools.
const GUARDED_HOST_TOOLS = [
  'ops_bash',
  'ops_read_files',
  'ops_discover_tools',
  'working_directory',
  'load_workspace_dependencies',
  'render_ui',
  'validate_dsh_ui',
]

export function apply(ctx, config) {
  const expectedTerminalType = typeof config?.terminalType === 'string' && config.terminalType !== ''
    ? config.terminalType
    : null
  ctx.tools.restrict({ deny: GLOBAL_HOST_TOOLS })
  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'terminal_open') {
      const type = exec.arguments?.type
      const binding = ctx.get('remoteSshWorkspace')?.current?.()
      const required = binding?.terminalType ?? expectedTerminalType
      if (required) {
        if (type === required) return next()
        return {
          kind: 'deny',
          reason: `Use terminal backend "${required}" for this remote workspace.`,
        }
      }
      if (typeof type === 'string' && type.startsWith('remote-ssh')) return next()
      return {
        kind: 'deny',
        reason: 'Only a remote-ssh terminal backend is allowed in this remote workspace.',
      }
    }
    if (!GUARDED_HOST_TOOLS.includes(exec.name)) return next()
    return {
      kind: 'deny',
      reason: `Local Host tool "${exec.name}" is disabled in this remote workspace. Use the remote bash/read/write/edit tools instead.`,
    }
  }), 'remote-tool-restrict: deny local Host tools')
}
