import { randomUUID } from 'node:crypto'

/**
 * Call one Host API endpoint through the loopback proxy. The proxy injects the
 * remote auth cookie; this client only needs the proxy origin capability.
 */
export async function remoteRpc(proxyUrl, method, args, options = {}) {
  const origin = new URL(proxyUrl).origin
  const rpcId = `rs-${randomUUID()}`
  const timeoutMs = options.timeoutMs ?? 60_000
  const response = await fetch(new URL(`api/${method}`, proxyUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`remote ${method}: HTTP ${response.status}`)
  const body = await response.json()
  if (body?.rpcId !== rpcId) throw new Error(`remote ${method}: rpcId mismatch`)
  const result = body?.result
  if (!result?.ok) {
    const error = new Error(result?.error?.message ?? `remote ${method} failed`)
    error.code = result?.error?.code ?? 'remote-error'
    error.detail = result?.error?.data ?? null
    throw error
  }
  return result.value
}
