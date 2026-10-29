import { createHash } from 'node:crypto'

export function remoteTerminalType(target, remotePath) {
  const slug = `${target ?? ''}-${remotePath ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const digest = createHash('sha256').update(`${target ?? ''}:${remotePath ?? ''}`).digest('hex').slice(0, 6)
  return `remote-ssh-${slug || 'default'}-${digest}`
}
