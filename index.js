import { AppError, RemoteSshController } from './lib/controller.js'

export const name = 'dsh-remote-ssh'
export const inject = ['connection']

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function success(value) {
  return json({ ok: true, ...value })
}

function failure(error) {
  const failure = error instanceof AppError
    ? error
    : new AppError('unknown', error instanceof Error ? error.message : String(error))
  return json({
    ok: false,
    error: { code: failure.code, message: failure.message, detail: failure.detail ?? null },
  })
}

async function readBody(request) {
  const text = await request.text()
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new AppError('invalid-input', 'Request body is not valid JSON')
  }
}

function requireId(body) {
  if (typeof body?.id !== 'string' || body.id.trim() === '') {
    throw new AppError('invalid-input', 'Missing connection id')
  }
  return body.id.trim()
}

export function apply(ctx, config) {
  const controller = new RemoteSshController(ctx, config ?? {})
  const routes = {
    list: () => controller.list(),
    save: (body) => controller.save(body),
    detectSandbox: (body) => controller.detectSandboxHost(body),
    sandboxLog: (body) => controller.readSandboxLog(body),
    remove: (body) => controller.remove(requireId(body)),
    agentWorkspace: (body) => controller.createAgentWorkspace(requireId(body), body?.remotePath, body?.mode),
    agentWorkspaces: () => ({ workspaces: controller.listAgentWorkspaces() }),
    remoteDirs: (body) => controller.listRemoteDirs(body),
    filesList: (body) => controller.listAgentFiles(body),
    filesRead: (body) => controller.readAgentFile(body),
    filesWrite: (body) => controller.writeAgentFile(body),
  }

  const bridgeTimer = setTimeout(() => controller.ensureServiceBridge(), 1500)
  if (typeof bridgeTimer.unref === 'function') bridgeTimer.unref()

  for (const [name, handler] of Object.entries(routes)) {
    ctx.effect(() => {
      let dispose
      try {
        dispose = ctx.connection.fetch.register({
          path: `/api/remote-ssh/${name}`,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request) => {
            try {
              const body = await readBody(request)
              return success(await handler(body))
            } catch (error) {
              if (!(error instanceof AppError)) {
                try {
                  ctx.logger?.warn?.(`[remote-ssh] ${name} route failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
                } catch {
                  // ignore logging failures
                }
              }
              return failure(error)
            }
          },
        })
      } catch (error) {
        try {
          ctx.logger?.error?.(`[remote-ssh] could not register the ${name} route: ${error instanceof Error ? error.message : String(error)}`)
        } catch {
          // ignore
        }
        return () => {}
      }
      return () => {
        void dispose()
      }
    }, `remote-ssh: ${name} route`)
  }

  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: '/api/remote-ssh/filesDownload',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await readBody(request)
          return await controller.downloadAgentFile(body, request.signal)
        } catch (error) {
          return failure(error)
        }
      },
    })
    return () => { void dispose() }
  }, 'remote-ssh: filesDownload route')

  ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
    const presetId = agent.session?.header?.agentPreset
    if (!controller.autoApproveProbe || !String(presetId ?? '').startsWith('remote-')) return
    const agentCtx = agent.ctx
    if (typeof agentCtx?.on !== 'function') return
    agentCtx.effect(() => agentCtx.on('approval/request', async (request, next) => {
      if (['write', 'edit', 'bash'].includes(request.toolName)) return 'allowed-once'
      return next()
    }), 'remote-agent: probe approval')
  }), 'remote-agent: probe approvals')

  ctx.effect(() => () => controller.dispose(), 'remote-ssh: connections')
}
