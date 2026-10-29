import http from 'node:http'
import net from 'node:net'
import { randomBytes } from 'node:crypto'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Loopback reverse proxy for one remote dsh Web UI.
 *
 * The remote dsh issues an authority-bound, SameSite=Strict cookie. A direct
 * cross-origin iframe cannot reliably carry that cookie, so the Host exchanges
 * the remote token itself, keeps the cookie server-side, and serves the remote
 * UI from a dedicated random loopback port. The browser only talks to this
 * proxy; absolute and relative URLs both stay inside the session.
 */
export class RemoteUiProxy {
  constructor(options = {}) {
    this.logger = options.logger
    this.sessions = new Map()
    this.pending = new Map()
  }

  async createSession({ id, localPort, remotePort, remoteUrl }) {
    const existing = this.sessions.get(id)
    if (existing && existing.localPort === localPort && existing.remotePort === remotePort) {
      return existing
    }
    if (this.pending.has(id)) return this.pending.get(id)
    const promise = this.createSessionInternal({ id, localPort, remotePort, remoteUrl })
    this.pending.set(id, promise)
    try {
      return await promise
    } finally {
      if (this.pending.get(id) === promise) this.pending.delete(id)
    }
  }

  async createSessionInternal({ id, localPort, remotePort, remoteUrl }) {
    const existing = this.sessions.get(id)
    if (existing) this.destroy(id)
    const cookies = await this.exchangeToken(remoteUrl, localPort, remotePort)
    const session = {
      id,
      token: randomBytes(18).toString('base64url'),
      localPort,
      remotePort,
      cookies: new Map(),
      sockets: new Set(),
      server: null,
      port: null,
      createdAt: Date.now(),
    }
    for (const pair of cookies) {
      const index = pair.indexOf('=')
      if (index > 0) session.cookies.set(pair.slice(0, index), pair)
    }
    const server = http.createServer((req, res) => this.handleHttp(session, req, res))
    server.on('upgrade', (req, socket, head) => this.handleUpgrade(session, req, socket, head))
    server.on('clientError', (_error, socket) => {
      try {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      } catch {
        // ignore
      }
    })
    server.requestTimeout = 0
    server.headersTimeout = 60000
    server.keepAliveTimeout = 5000
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        session.server = server
        session.port = server.address().port
        this.sessions.set(id, session)
        resolve()
      })
    })
    return session
  }

  urlFor(session) {
    return `http://127.0.0.1:${session.port}/`
  }

  exchangeToken(remoteUrl, localPort, remotePort) {
    let token
    try {
      token = new URL(remoteUrl).searchParams.get('token')
    } catch {
      token = null
    }
    if (!token) return Promise.reject(new Error('the remote URL has no launch token'))
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: localPort,
        path: `/?token=${encodeURIComponent(token)}`,
        method: 'GET',
        headers: {
          host: `127.0.0.1:${remotePort}`,
          connection: 'close',
        },
      }, (res) => {
        const raw = res.headers['set-cookie'] ?? []
        const cookies = raw.map((value) => String(value).split(';')[0]).filter((value) => value.includes('='))
        res.resume()
        if (res.statusCode >= 200 && res.statusCode < 400 && cookies.length > 0) {
          resolve(cookies)
          return
        }
        reject(new Error(`remote authentication exchange failed (HTTP ${res.statusCode})`))
      })
      req.on('error', reject)
      req.setTimeout(15000, () => req.destroy(new Error('remote authentication exchange timed out')))
      req.end()
    })
  }

  cookieHeader(session) {
    return [...session.cookies.values()].join('; ')
  }

  requestHeaders(headers, session) {
    const out = {}
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase()
      if (HOP_BY_HOP.has(lower)) continue
      if (lower === 'host' || lower === 'origin' || lower === 'referer' || lower === 'cookie') continue
      if (value !== undefined) out[name] = value
    }
    out.host = `127.0.0.1:${session.remotePort}`
    if (typeof headers.origin === 'string') out.origin = `http://127.0.0.1:${session.remotePort}`
    const cookie = this.cookieHeader(session)
    if (cookie) out.cookie = cookie
    out.connection = 'close'
    return out
  }

  mergeCookies(session, rawCookies) {
    for (const value of rawCookies ?? []) {
      const pair = String(value).split(';')[0]
      const index = pair.indexOf('=')
      if (index > 0) session.cookies.set(pair.slice(0, index), pair)
    }
  }

  responseHeaders(headers, session) {
    const out = {}
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase()
      if (HOP_BY_HOP.has(lower) || lower === 'set-cookie' || lower === 'location') continue
      if (value !== undefined) out[name] = value
    }
    const location = headers.location
    if (typeof location === 'string') out.location = this.rewriteLocation(location, session)
    return out
  }

  rewriteLocation(location, session) {
    if (location.startsWith('/') && !location.startsWith('//')) return location
    try {
      const url = new URL(location, `http://127.0.0.1:${session.remotePort}/`)
      if (url.hostname === '127.0.0.1' && Number(url.port) === session.remotePort) {
        return `http://127.0.0.1:${session.port}${url.pathname}${url.search}${url.hash}`
      }
    } catch {
      // leave external or malformed locations untouched
    }
    return location
  }

  handleHttp(session, req, res) {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1')
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' })
      res.end('bad request')
      return
    }
    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const origin = req.headers.origin
      const site = req.headers['sec-fetch-site']
      if (origin !== `http://127.0.0.1:${session.port}` && site !== 'same-origin') {
        res.writeHead(403, { 'content-type': 'text/plain' })
        res.end('cross-origin mutation refused')
        return
      }
    }
    const upstream = http.request({
      host: '127.0.0.1',
      port: session.localPort,
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers: this.requestHeaders(req.headers, session),
    }, (upstreamResponse) => {
      this.mergeCookies(session, upstreamResponse.headers['set-cookie'])
      res.writeHead(upstreamResponse.statusCode ?? 502, this.responseHeaders(upstreamResponse.headers, session))
      upstreamResponse.pipe(res)
    })
    upstream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' })
        res.end('remote dsh proxy error')
        return
      }
      res.destroy()
    })
    req.on('aborted', () => upstream.destroy())
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy()
    })
    req.pipe(upstream)
  }

  handleUpgrade(session, req, socket, head) {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1')
    } catch {
      socket.destroy()
      return
    }
    const origin = req.headers.origin
    if (typeof origin === 'string' && origin !== `http://127.0.0.1:${session.port}`) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }
    const upstream = net.connect(session.localPort, '127.0.0.1', () => {
      const lines = [
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: 127.0.0.1:${session.remotePort}`,
      ]
      for (let index = 0; index < req.rawHeaders.length; index += 2) {
        const name = req.rawHeaders[index]
        const value = req.rawHeaders[index + 1]
        const lower = name.toLowerCase()
        if (['host', 'origin', 'cookie', 'connection', 'upgrade', 'proxy-connection'].includes(lower)) continue
        lines.push(`${name}: ${value}`)
      }
      lines.push('Upgrade: websocket')
      lines.push('Connection: Upgrade')
      if (typeof origin === 'string') lines.push(`Origin: http://127.0.0.1:${session.remotePort}`)
      const cookie = this.cookieHeader(session)
      if (cookie) lines.push(`Cookie: ${cookie}`)
      lines.push('', '')
      upstream.write(lines.join('\r\n'))
      if (head && head.length > 0) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    session.sockets.add(socket)
    const cleanup = () => {
      session.sockets.delete(socket)
      try {
        socket.destroy()
      } catch {
        // ignore
      }
      try {
        upstream.destroy()
      } catch {
        // ignore
      }
    }
    socket.on('error', cleanup)
    socket.on('close', cleanup)
    upstream.on('error', cleanup)
    upstream.on('close', cleanup)
  }

  destroy(id) {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    for (const socket of session.sockets) {
      try {
        socket.destroy()
      } catch {
        // ignore
      }
    }
    session.sockets.clear()
    if (session.server) {
      const server = session.server
      session.server = null
      try {
        server.closeAllConnections?.()
        server.close()
      } catch {
        // ignore
      }
    }
  }

  close() {
    for (const id of [...this.sessions.keys()]) this.destroy(id)
  }
}
