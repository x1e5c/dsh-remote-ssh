import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLaunchCommand,
  maskedUrl,
  parseProbeOutput,
  parseStartupUrl,
  probeCommand,
  remotePathExpr,
  rewriteTunnelUrl,
  shellQuote,
  sshInvocation,
  validatePort,
  validateTarget,
} from '../lib/remote.js'

test('shellQuote quotes single quotes for POSIX shells', () => {
  assert.equal(shellQuote("a'b"), `'a'\\''b'`)
  assert.equal(shellQuote('plain'), `'plain'`)
})

test('remotePathExpr expands only a leading home segment', () => {
  assert.equal(remotePathExpr('~'), '"$HOME"')
  assert.equal(remotePathExpr('~/project'), `"$HOME"/'project'`)
  assert.equal(remotePathExpr('/srv/a b'), `'/srv/a b'`)
})

test('validateTarget accepts aliases and user@host but rejects option injection', () => {
  assert.equal(validateTarget('aliyun'), 'aliyun')
  assert.equal(validateTarget('root@8.148.80.65'), 'root@8.148.80.65')
  assert.equal(validateTarget('[::1]'), '[::1]')
  assert.throws(() => validateTarget('-oProxyCommand=sh'), /cannot start/)
  assert.throws(() => validateTarget('host with space'), /whitespace/)
  assert.throws(() => validateTarget('host\nnext'), /control/)
  assert.throws(() => validateTarget(''), /1-255/)
})

test('validatePort accepts an empty optional value and bounds integers', () => {
  assert.equal(validatePort(''), null)
  assert.equal(validatePort(null), null)
  assert.equal(validatePort('22'), 22)
  assert.throws(() => validatePort('0'), /between 1 and 65535/)
  assert.throws(() => validatePort('70000'), /between 1 and 65535/)
  assert.throws(() => validatePort('abc'), /between 1 and 65535/)
})

test('probeCommand emits every marker and checks the isolated profile', () => {
  const command = probeCommand({ remotePath: '~/work', profile: 'dsh-rs-abcd1234' })
  assert.match(command, /^sh -lc '/)
  assert.match(command, /__DSHRS_OS__/)
  assert.match(command, /__DSHRS_DSHVER__/)
  assert.match(command, /profiles\/dsh-rs-abcd1234/)
  assert.match(command, /__DSHRS_END__/)
  assert.ok(command.startsWith(`sh -lc '`))
  assert.ok(command.endsWith(`'`))
})

test('parseProbeOutput reads marker values and ignores shell noise', () => {
  const parsed = parseProbeOutput([
    'Welcome to the machine',
    '__DSHRS_OS__Linux',
    '__DSHRS_ARCH__x86_64',
    '__DSHRS_HOST__gpu-01',
    '__DSHRS_USER__alice',
    '__DSHRS_HOME__/home/alice',
    '__DSHRS_DSH__/home/alice/.local/bin/dsh',
    '__DSHRS_DSHVER__0.2.1-rc.2',
    '__DSHRS_NODE__/usr/bin/node',
    '__DSHRS_NPM__/usr/bin/npm',
    '__DSHRS_DIR__ok',
    '__DSHRS_PROFILE__missing',
    '__DSHRS_END__',
  ].join('\n'))
  assert.equal(parsed.os, 'Linux')
  assert.equal(parsed.hostname, 'gpu-01')
  assert.equal(parsed.dsh, '/home/alice/.local/bin/dsh')
  assert.equal(parsed.dshVersion, '0.2.1-rc.2')
  assert.equal(parsed.dir, 'ok')
  assert.equal(parsed.profile, 'missing')
  assert.equal(parsed.end, true)
})

test('buildLaunchCommand initializes an isolated web profile only once', () => {
  const missing = buildLaunchCommand({
    remotePath: '~/work',
    dsh: '/home/alice/.local/bin/dsh',
    dshCommand: '',
    profile: 'dsh-rs-abcd1234',
    profileExists: false,
    port: 30001,
  })
  assert.ok(missing.includes('--from-default-profile web'))
  assert.ok(missing.includes('dsh-rs-abcd1234'))
  assert.ok(missing.includes('--no-open --port 30001 --host 127.0.0.1'))
  assert.ok(missing.includes(`cd -- "$HOME"/`))
  assert.ok(missing.includes(`work`))

  const existing = buildLaunchCommand({
    remotePath: '/srv/project',
    dsh: '/usr/local/bin/dsh',
    dshCommand: '',
    profile: 'dsh-rs-abcd1234',
    profileExists: true,
    port: 30002,
  })
  assert.doesNotMatch(existing, /--from-default-profile/)
  assert.ok(existing.includes('dsh-rs-abcd1234'))
  assert.ok(existing.includes('--no-open'))
  assert.ok(existing.includes('cd -- '))
  assert.ok(existing.includes('/srv/project'))
})

test('buildLaunchCommand honors a custom remote dsh command', () => {
  const command = buildLaunchCommand({
    remotePath: '~',
    dsh: null,
    dshCommand: 'npx -y @deepseek-ai/dsh',
    profile: 'dsh-rs-abcd1234',
    profileExists: true,
    port: 30003,
  })
  assert.match(command, /exec npx -y @deepseek-ai\/dsh --profile/)
})

test('sshInvocation keeps the destination and command after --', () => {
  const args = sshInvocation(
    { target: 'aliyun', port: 22, identityFile: '~/.ssh/id_ed25519' },
    'echo ok',
    { batchMode: true },
  )
  const separator = args.indexOf('--')
  assert.ok(separator > 0)
  assert.equal(args[separator + 1], 'aliyun')
  assert.equal(args[separator + 2], 'echo ok')
  assert.ok(args.includes('BatchMode=yes'))
  assert.ok(args.includes('-T'))
})

test('sshInvocation can request a remote PTY for the launched server', () => {
  const args = sshInvocation(
    { target: 'aliyun', port: null, identityFile: '' },
    'echo ok',
    { batchMode: true, tty: true },
  )
  assert.ok(args.includes('-tt'))
  assert.ok(!args.includes('-T'))
  assert.ok(args.includes('RequestTTY=force'))
})

test('parseStartupUrl tolerates color codes and parses the token URL', () => {
  const url = parseStartupUrl('\u001b[32mdsh web: http://127.0.0.1:63006/?token=abc_def\u001b[0m')
  assert.ok(url)
  assert.equal(url.port, '63006')
  assert.equal(url.searchParams.get('token'), 'abc_def')
  assert.equal(parseStartupUrl('not a URL'), null)
})

test('rewriteTunnelUrl points the remote URL at the local forward', () => {
  const local = rewriteTunnelUrl('http://127.0.0.1:63006/?token=abc', 40123)
  assert.equal(local, 'http://127.0.0.1:40123/?token=abc')
})

test('masking hides the token without losing the rest of the address', () => {
  assert.equal(maskedUrl('http://127.0.0.1:40123/?token=abc'), 'http://127.0.0.1:40123/?token=••••')
  assert.equal(maskedUrl('http://127.0.0.1:40123/?token=abc&x=1'), 'http://127.0.0.1:40123/?token=••••&x=1')
})
