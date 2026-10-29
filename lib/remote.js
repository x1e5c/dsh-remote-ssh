import { spawn } from 'node:child_process'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g

export function stripAnsi(text) {
  return String(text ?? '').replace(ANSI, '')
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/** A POSIX shell expression for a remote path, expanding a leading ~ against $HOME. */
export function remotePathExpr(value) {
  const path = String(value ?? '').trim() || '~'
  if (path === '~') return '"$HOME"'
  if (path.startsWith('~/')) return `"$HOME"/${shellQuote(path.slice(2))}`
  return shellQuote(path)
}

export function expandHome(value) {
  const path = String(value ?? '').trim()
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

export function validateTarget(value) {
  const target = String(value ?? '').trim()
  if (target.length === 0 || target.length > 255) {
    throw new Error('SSH target must be 1-255 characters')
  }
  if (/[\s\x00-\x1f\x7f]/.test(target)) {
    throw new Error('SSH target cannot contain whitespace or control characters')
  }
  if (target.startsWith('-')) {
    throw new Error('SSH target cannot start with "-"')
  }
  if (!/^[A-Za-z0-9._@:%\[\]-]+$/.test(target)) {
    throw new Error('SSH target contains unsupported characters')
  }
  return target
}

export function validatePort(value) {
  if (value === null || value === undefined || value === '') return null
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535')
  }
  return port
}

export function validateRemotePath(value) {
  const path = String(value ?? '').trim() || '~'
  if (path.length > 1024) throw new Error('Remote workspace path is too long')
  if (/[\x00\r\n]/.test(path)) throw new Error('Remote workspace path contains control characters')
  return path
}

export function validateCommand(value) {
  const command = String(value ?? '').trim()
  if (command.length > 1024) throw new Error('Remote dsh command is too long')
  if (/[\x00\r\n]/.test(command)) throw new Error('Remote dsh command contains control characters')
  return command
}

export function randomRemotePort() {
  return 20000 + Math.floor(Math.random() * 40000)
}

export function sshCommonArgs(options = {}) {
  const {
    port = null,
    identityFile = '',
    connectTimeoutSec = 15,
    batchMode = true,
    forward = false,
    tty = false,
  } = options
  const args = [
    tty ? '-tt' : '-T',
    '-o', `ConnectTimeout=${Math.max(3, Number(connectTimeoutSec) || 15)}`,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'UpdateHostKeys=yes',
    '-o', 'LogLevel=ERROR',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'ControlMaster=no',
    '-o', 'ControlPath=none',
    '-o', 'PermitLocalCommand=no',
    '-o', `RequestTTY=${tty ? 'force' : 'no'}`,
    '-o', 'ForwardAgent=no',
    '-o', 'AddKeysToAgent=no',
  ]
  if (port) args.push('-p', String(port))
  const key = expandHome(identityFile)
  if (key) args.push('-i', key)
  if (batchMode) {
    args.push('-o', 'BatchMode=yes', '-o', 'NumberOfPasswordPrompts=0')
  } else {
    args.push('-o', 'NumberOfPasswordPrompts=1')
  }
  if (forward) args.push('-o', 'ExitOnForwardFailure=yes')
  return args
}

/** Build the SSH argv ending with the destination and one remote shell command. */
export function sshInvocation(host, remoteCommand, options = {}) {
  return [
    ...sshCommonArgs({
      port: host.port,
      identityFile: host.identityFile,
      connectTimeoutSec: options.connectTimeoutSec,
      batchMode: options.batchMode,
      forward: options.forward,
      tty: options.tty,
    }),
    '--',
    host.target,
    remoteCommand,
  ]
}

export function wrapPosix(command) {
  return `sh -lc ${shellQuote(command)}`
}

export function probeCommand({ remotePath, profile }) {
  const path = remotePathExpr(remotePath)
  const safeProfile = String(profile ?? '').replace(/[^a-zA-Z0-9._-]/g, '')
  const script = [
    'DSH_BIN="$(command -v dsh 2>/dev/null || true)"',
    'if [ -z "$DSH_BIN" ]; then',
    '  for c in "$HOME/.local/bin/dsh" "$HOME/.npm-global/bin/dsh" "$HOME/bin/dsh" "$HOME/.volta/bin/dsh" "$HOME/n/bin/dsh" /usr/local/bin/dsh /opt/homebrew/bin/dsh; do',
    '    if [ -x "$c" ]; then DSH_BIN="$c"; break; fi',
    '  done',
    'fi',
    'if [ -z "$DSH_BIN" ]; then',
    '  for c in "$HOME"/.nvm/versions/node/*/bin/dsh; do',
    '    if [ -x "$c" ]; then DSH_BIN="$c"; break; fi',
    '  done',
    'fi',
    'printf "__DSHRS_OS__%s\\n" "$(uname -s 2>/dev/null || printf unknown)"',
    'printf "__DSHRS_ARCH__%s\\n" "$(uname -m 2>/dev/null || printf unknown)"',
    'printf "__DSHRS_HOST__%s\\n" "$(hostname 2>/dev/null || printf unknown)"',
    'printf "__DSHRS_USER__%s\\n" "$(id -un 2>/dev/null || printf unknown)"',
    'printf "__DSHRS_HOME__%s\\n" "$HOME"',
    'printf "__DSHRS_DSH__%s\\n" "${DSH_BIN:-NONE}"',
    'if [ -n "$DSH_BIN" ]; then printf "__DSHRS_DSHVER__%s\\n" "$("$DSH_BIN" --version 2>/dev/null | head -n 1)"; fi',
    'printf "__DSHRS_NODE__%s\\n" "$(command -v node 2>/dev/null || printf NONE)"',
    'printf "__DSHRS_NPM__%s\\n" "$(command -v npm 2>/dev/null || printf NONE)"',
    `if [ -d ${path} ]; then printf "__DSHRS_DIR__ok\\n"; else printf "__DSHRS_DIR__missing\\n"; fi`,
    `if [ -d "\${DSH_HOME:-$HOME/.dsh}/profiles/${safeProfile}" ]; then printf "__DSHRS_PROFILE__exists\\n"; else printf "__DSHRS_PROFILE__missing\\n"; fi`,
    'printf "__DSHRS_END__\\n"',
  ].join('\n')
  return wrapPosix(script)
}

export function parseProbeOutput(text) {
  const result = {
    os: null,
    arch: null,
    hostname: null,
    user: null,
    home: null,
    dsh: null,
    dshVersion: null,
    node: null,
    npm: null,
    dir: null,
    profile: null,
    end: false,
  }
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = stripAnsi(raw).trim()
    const match = /^__DSHRS_([A-Z]+)__(.*)$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.trim()
    switch (key) {
      case 'OS': result.os = value; break
      case 'ARCH': result.arch = value; break
      case 'HOST': result.hostname = value; break
      case 'USER': result.user = value; break
      case 'HOME': result.home = value; break
      case 'DSH': result.dsh = value === 'NONE' ? null : value; break
      case 'DSHVER': result.dshVersion = value || null; break
      case 'NODE': result.node = value === 'NONE' ? null : value; break
      case 'NPM': result.npm = value === 'NONE' ? null : value; break
      case 'DIR': result.dir = value; break
      case 'PROFILE': result.profile = value; break
      case 'END': result.end = true; break
      default: break
    }
  }
  return result
}

export function buildLaunchCommand({ remotePath, dsh, dshCommand, profile, profileExists, port }) {
  const executable = dshCommand ? dshCommand : shellQuote(dsh)
  const profileArgs = profileExists
    ? `--profile ${shellQuote(profile)}`
    : `--profile ${shellQuote(profile)} --from-default-profile web`
  const command = [
    `cd -- ${remotePathExpr(remotePath)} || { printf '__DSHRS_CD__missing\\n'; exit 70; }`,
    `exec ${executable} ${profileArgs} --no-open --port ${Number(port)} --host 127.0.0.1`,
  ].join('; ')
  return wrapPosix(command)
}

export function parseStartupUrl(line) {
  const clean = stripAnsi(line).trim()
  const match = /(?:^|\s)dsh web:\s+(https?:\/\/\S+)/.exec(clean)
  if (!match) return null
  try {
    const url = new URL(match[1])
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

export function rewriteTunnelUrl(remoteUrl, localPort) {
  const url = new URL(remoteUrl)
  url.hostname = '127.0.0.1'
  url.port = String(localPort)
  return url.toString()
}

export function maskedUrl(value) {
  return String(value).replace(/([?&](?:token|access_token)=)[^&#]*/gi, '$1••••')
}

export function createLineReader(onLine) {
  let buffer = ''
  return {
    push(chunk) {
      buffer += chunk
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) break
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        onLine(line)
      }
      if (buffer.length > 64 * 1024) buffer = buffer.slice(-4096)
    },
    flush() {
      if (buffer.length > 0) {
        const line = buffer
        buffer = ''
        onLine(line)
      }
    },
  }
}

export function runSsh(sshExecutable, args, options = {}) {
  const { env = {}, timeoutMs = 30000, onLine, maxBytes = 128 * 1024 } = options
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(sshExecutable, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const outReader = onLine ? createLineReader(onLine) : null
    const errReader = onLine ? createLineReader(onLine) : null
    const append = (target, chunk) => {
      const next = target + chunk
      return next.length > maxBytes ? next.slice(-maxBytes) : next
    }
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout = append(stdout, chunk)
      outReader?.push(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = append(stderr, chunk)
      errReader?.push(chunk)
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, 2000).unref?.()
    }, Math.max(1000, timeoutMs))
    const finish = (code, signal, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      outReader?.flush()
      errReader?.flush()
      resolve({ code, signal, stdout, stderr, timedOut, error })
    }
    child.on('error', (error) => finish(null, null, error))
    child.on('close', (code, signal) => finish(code, signal))
  })
}

export function startSsh(sshExecutable, args, options = {}) {
  const child = spawn(sshExecutable, args, {
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  return child
}

export function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (port) resolve(port)
        else reject(new Error('could not reserve a local port'))
      })
    })
  })
}

export function waitForLocalPort(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      let done = false
      const finish = (ok) => {
        if (done) return
        done = true
        socket.destroy()
        if (ok) resolve(true)
        else if (Date.now() >= deadline) resolve(false)
        else setTimeout(attempt, 200)
      }
      socket.once('connect', () => finish(true))
      socket.once('error', () => finish(false))
      socket.setTimeout(1000, () => finish(false))
    }
    attempt()
  })
}

export async function createAskpass(secret) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-ssh-'))
  const windows = process.platform === 'win32'
  const file = join(dir, windows ? 'askpass.cmd' : 'askpass.sh')
  const body = windows
    ? '@echo off\r\npowershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "[Console]::Out.Write($env:DSH_REMOTE_SSH_SECRET)"\r\n'
    : '#!/bin/sh\nprintf \'%s\\n\' "$DSH_REMOTE_SSH_SECRET"\n'
  await writeFile(file, body, { mode: 0o700 })
  if (!windows) await chmod(file, 0o700)
  return {
    env: {
      SSH_ASKPASS: file,
      SSH_ASKPASS_REQUIRE: 'force',
      DISPLAY: process.env.DISPLAY || ':0',
      DSH_REMOTE_SSH_SECRET: String(secret),
    },
    async dispose() {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    },
  }
}

export function spawnDetached(command, args) {
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

export function openExternalUrl(url) {
  if (process.platform === 'win32') {
    return spawnDetached('rundll32.exe', ['url.dll,FileProtocolHandler', url])
  }
  if (process.platform === 'darwin') {
    return spawnDetached('open', [url])
  }
  return spawnDetached('xdg-open', [url])
}
