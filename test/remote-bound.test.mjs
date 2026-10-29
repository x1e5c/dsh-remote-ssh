import assert from 'node:assert/strict'
import test from 'node:test'
import { createBoundRemoteFileSystem } from '../remote-fs.js'
import { createBoundRemoteShell } from '../remote-shell.js'

function ctxWithBinding(binding) {
  return {
    get(name) {
      if (name === 'remoteSshWorkspace') return { current: () => binding }
      return undefined
    },
  }
}

test('remote fs resolves paths from the session-bound workspace', () => {
  const fs = createBoundRemoteFileSystem(ctxWithBinding({
    host: 'iota-sc',
    remotePath: '/home/shichang/working/tttest',
    terminalType: 'remote-ssh-iota-sc-home-shichang-working-tttest-8368ba',
  }))
  assert.equal(fs.processPath({ targetKey: '/home/shichang/working/tttest/a.txt', displayPath: 'a.txt' }), '/home/shichang/working/tttest/a.txt')
  assert.throws(
    () => createBoundRemoteFileSystem(ctxWithBinding(null)).processPath({ targetKey: '/x', displayPath: 'x' }),
    (error) => error.code === 'FS_NO_REMOTE_WORKSPACE',
  )
})

test('remote shell resolves the remote workdir from the session binding', () => {
  const shell = createBoundRemoteShell(ctxWithBinding({
    host: 'iota-sc',
    remotePath: '/home/shichang/working/tttest',
  }))
  assert.equal(shell.resolve({ command: 'pwd' }).workdir, '/home/shichang/working/tttest')
  assert.equal(shell.resolve({ command: 'pwd', workdir: '/tmp' }).workdir, '/tmp')
  assert.throws(
    () => createBoundRemoteShell(ctxWithBinding(null)).resolve({ command: 'pwd' }),
    (error) => error.code === 'SHELL_NO_REMOTE_WORKSPACE',
  )
})
