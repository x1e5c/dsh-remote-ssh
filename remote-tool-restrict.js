export const name = 'remote-tool-restrict'
export const inject = ['tools']

// Global Host tools that can be hidden from the agent with tools.restrict().
// Keep this list to tools that are global in every supported DSH release.
// `ops_*` tools are scope-local now and are rejected by tools.restrict();
// they are denied at pre-execute below instead.
const GLOBAL_HOST_TOOLS = [
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
  // The plugin no longer ships a remote terminal backend, so a terminal in a
  // remote workspace would open a LOCAL shell and run the command on the wrong
  // machine. Keep the tool denied here.
  'terminal_open',
]

export function apply(ctx) {
  ctx.tools.restrict({ deny: GLOBAL_HOST_TOOLS })
  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    if (!GUARDED_HOST_TOOLS.includes(exec.name)) return next()
    return {
      kind: 'deny',
      reason: `Local Host tool "${exec.name}" is disabled in this remote workspace. Use the remote bash/read/write/edit tools instead.`,
    }
  }), 'remote-tool-restrict: deny local Host tools')
}
