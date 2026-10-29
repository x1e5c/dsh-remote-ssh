import assert from 'node:assert/strict'
import test from 'node:test'
import { createRemoteFileSystem } from '../remote-fs.js'

function fakeRunner() {
  const files = new Map([
    ['/root/data', { type: 'directory', content: '' }],
    ['/root/data/alpha.txt', { type: 'file', content: 'alpha', mtime: 100 }],
  ])
  const pathOf = (script) => {
    const matches = [...script.matchAll(/'([^']*)'/g)]
    return matches.at(-1)?.[1]?.replaceAll(`'\\''`, `'`)
  }
  return async (_config, script, options = {}) => {
    if (script.startsWith('stat -c')) {
      const path = pathOf(script)
      const entry = files.get(path)
      if (!entry) return { code: 1, stdout: '', stderr: `stat: cannot stat '${path}': No such file or directory` }
      return { code: 0, stdout: `${entry.type === 'directory' ? 'directory' : 'regular file'}|${Buffer.byteLength(entry.content)}|${entry.mtime ?? 100}\n`, stderr: '' }
    }
    if (script.startsWith('base64 <')) {
      const path = pathOf(script)
      const entry = files.get(path)
      if (!entry) return { code: 1, stdout: '', stderr: 'No such file' }
      return { code: 0, stdout: Buffer.from(entry.content).toString('base64'), stderr: '' }
    }
    if (script.startsWith('mkdir -p') && script.includes('base64 -d >')) {
      const path = pathOf(script)
      files.set(path, { type: 'file', content: Buffer.from(options.stdin ?? '', 'base64').toString('utf8'), mtime: 200 })
      return { code: 0, stdout: '', stderr: '' }
    }
    if (script.startsWith('find ')) {
      const root = [...script.matchAll(/'([^']*)'/g)][0]?.[1]
      const rows = []
      for (const [path, entry] of files) {
        if (path === root || !path.startsWith(`${root}/`)) continue
        const name = path.slice(root.length + 1)
        if (name.includes('/')) continue
        rows.push(`${name}|${entry.type === 'directory' ? 'd' : 'f'}|${Buffer.byteLength(entry.content)}|${entry.mtime ?? 100}`)
      }
      return { code: 0, stdout: `${rows.join('\n')}\n`, stderr: '' }
    }
    return { code: 1, stdout: '', stderr: `unexpected script: ${script}` }
  }
}

test('remote fs resolves and reads a remote file through the service contract', async () => {
  const fs = createRemoteFileSystem({ host: 'aliyun', remotePath: '/root/data' }, fakeRunner())
  const target = await fs.resolve('alpha.txt')
  assert.equal(target.targetKey, '/root/data/alpha.txt')
  assert.equal(target.displayPath, '/root/data/alpha.txt')
  const info = await fs.stat(target)
  assert.equal(info.type, 'file')
  assert.equal(info.size, 5)
  assert.equal(await fs.readText(target), 'alpha')
})

test('remote fs writes, edits, and lists entries', async () => {
  const fs = createRemoteFileSystem({ host: 'aliyun', remotePath: '/root/data' }, fakeRunner())
  const target = await fs.resolve('nested/new.txt')
  const created = await fs.writeText(target, 'hello', { kind: 'createIfAbsent' })
  assert.equal(created.operation, 'create')
  assert.equal(created.after, 'hello')
  assert.equal(await fs.readText(target), 'hello')

  const edited = await fs.editText(target, { oldString: 'hello', newString: 'world', replaceAll: false })
  assert.equal(edited.after, 'world')
  assert.equal(await fs.readText(target), 'world')

  const entries = await fs.listDir(await fs.resolve('.'))
  assert.ok(entries.some((entry) => entry.name === 'alpha.txt'))
})

test('remote fs service is provided under the fs key', async () => {
  let provided = null
  const ctx = { provide(key, value) { provided = { key, value } } }
  const { apply } = await import('../remote-fs.js')
  apply(ctx, { host: 'aliyun', remotePath: '/root/data' })
  assert.equal(provided.key, 'fs')
  assert.equal(typeof provided.value.stat, 'function')
  assert.equal(typeof provided.value.writeText, 'function')
})
