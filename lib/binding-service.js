// The remote fs/shell providers run inside isolated preset groups. In recent
// DSH releases a host-provided service is not always visible through
// `ctx.get()` from those groups, so the controller also publishes the same
// service on the process-global symbol. This helper keeps the lookup in one
// place without coupling the providers to the controller module.
export const REMOTE_WORKSPACE_SERVICE = Symbol.for('dsh-remote-ssh.remoteSshWorkspace')

export function remoteWorkspaceService(ctx) {
  let service = null
  try {
    service = ctx?.get?.('remoteSshWorkspace') ?? null
  } catch {
    // Preset scopes in a newer DSH may reject lookups for host services.
  }
  return service ?? globalThis[REMOTE_WORKSPACE_SERVICE] ?? null
}

export function currentRemoteWorkspace(ctx) {
  return remoteWorkspaceService(ctx)?.current?.() ?? null
}
