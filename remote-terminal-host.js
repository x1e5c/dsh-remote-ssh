import { createRemoteTerminalBackend } from './remote-terminal.js'

export const name = 'remote-terminal-host'
export const inject = ['terminals']

export function apply(ctx, config) {
  const backend = createRemoteTerminalBackend({
    host: config?.host ?? 'aliyun',
    remotePath: config?.remotePath ?? '/root/data',
    sshExecutable: config?.sshExecutable,
    connectTimeoutSec: config?.connectTimeoutSec,
    type: config?.type,
  })
  ctx.terminals.registerBackend(backend)
}
