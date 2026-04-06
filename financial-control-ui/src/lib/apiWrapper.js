/**
 * Fetch wrapper for offline-safe requests (non-axios callers).
 * When offline, stores payload in IndexedDB instead of throwing silently without record.
 */

import { enqueueRequest } from './offlineStorage'
import { isOnline } from './networkStatus'

/**
 * @param {string} url – absolute or relative
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function safeFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (!isOnline() && mutating) {
    let bodyObj
    try {
      bodyObj =
        typeof options.body === 'string' ? JSON.parse(options.body || '{}') : options.body ?? {}
    } catch {
      bodyObj = { _raw: options.body }
    }
    await enqueueRequest({
      id: crypto.randomUUID(),
      ts: Date.now(),
      method: method.toLowerCase(),
      url: typeof url === 'string' ? url : String(url),
      data: bodyObj,
      kind: 'fetch',
    })
    return new Response(JSON.stringify({ offlineQueued: true, queued: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return fetch(url, options)
}
