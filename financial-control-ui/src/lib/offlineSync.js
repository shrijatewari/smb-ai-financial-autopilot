/**
 * Axios interceptors + online flush. Does not alter existing API modules beyond registration.
 */

import { api, TOKEN_KEY } from '../services/api'
import { enqueueRequest, getOfflineData, removeQueuedRequest } from './offlineStorage'
import { isOnline } from './networkStatus'

const MAX_ATTEMPTS = 3

function isMutating(method) {
  return ['post', 'put', 'patch', 'delete'].includes((method || 'get').toLowerCase())
}

async function queueAxiosConfig(config) {
  const url = config.url || ''
  const id = crypto.randomUUID()
  await enqueueRequest({
    id,
    ts: Date.now(),
    method: (config.method || 'get').toLowerCase(),
    url,
    params: config.params,
    data: config.data,
    kind: 'axios',
    attempts: 0,
  })
  if (import.meta.env.DEV) {
    console.info('[SMB offline] Queued for sync when online:', config.method, url)
  }
}

function attachInterceptors() {
  api.interceptors.request.use(
    async (config) => {
      if (config._offlineRetry) return config
      if (!isOnline() && isMutating(config.method)) {
        await queueAxiosConfig(config)
        const err = new Error('OFFLINE_QUEUED')
        err.isOfflineQueued = true
        err.config = config
        return Promise.reject(err)
      }
      return config
    },
    (err) => Promise.reject(err),
  )

  api.interceptors.response.use(
    (res) => res,
    async (err) => {
      const cfg = err.config
      if (!cfg || cfg._offlineRetry) return Promise.reject(err)
      const code = err.code
      const net =
        code === 'ERR_NETWORK' ||
        code === 'ECONNABORTED' ||
        (err.message === 'Network Error' && isMutating(cfg.method))
      if (net && isMutating(cfg.method) && !isOnline()) {
        await queueAxiosConfig(cfg)
        const e = new Error('OFFLINE_QUEUED')
        e.isOfflineQueued = true
        e.config = cfg
        return Promise.reject(e)
      }
      return Promise.reject(err)
    },
  )
}

async function flushAxiosQueue() {
  if (!isOnline()) return
  const rows = await getOfflineData()
  const axiosRows = rows.filter((r) => r.kind === 'axios')
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null

  for (const row of axiosRows) {
    const attempts = (row.attempts || 0) + 1
    if (attempts > MAX_ATTEMPTS) continue
    try {
      await api.request({
        method: row.method,
        url: row.url,
        params: row.params,
        data: row.data,
        _offlineRetry: true,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      await removeQueuedRequest(row.id)
    } catch {
      await removeQueuedRequest(row.id)
      if (attempts < MAX_ATTEMPTS) {
        await enqueueRequest({ ...row, attempts })
      }
    }
  }
}

async function flushFetchQueue() {
  if (!isOnline()) return
  const rows = await getOfflineData()
  const fetchRows = rows.filter((r) => r.kind === 'fetch')
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
  for (const row of fetchRows) {
    try {
      await fetch(row.url, {
        method: (row.method || 'POST').toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: row.data != null ? JSON.stringify(row.data) : undefined,
      })
      await removeQueuedRequest(row.id)
    } catch {
      /* keep for retry */
    }
  }
}

/** Try batch endpoint, then per-item axios replay for leftovers, then fetch replay. */
async function flushViaBatchEndpoint() {
  if (!isOnline()) return
  const rows = await getOfflineData()
  const axiosRows = rows.filter((r) => r.kind === 'axios')
  if (axiosRows.length) {
    const items = axiosRows.map((r) => ({
      id: r.id,
      method: (r.method || 'post').toUpperCase(),
      path: r.url.startsWith('/') ? r.url : `/${r.url}`,
      body: r.data ?? null,
    }))
    try {
      const { data } = await api.post('/system/sync-batch', { items }, { _offlineRetry: true })
      for (const r of data?.results || []) {
        if (r.ok) {
          const found = axiosRows.find((x) => x.id === r.id)
          if (found) await removeQueuedRequest(found.id)
        }
      }
    } catch {
      /* fall through to per-item replay */
    }
  }
  await flushAxiosQueue()
  await flushFetchQueue()
}

let listenersAttached = false

export function initOfflineSync() {
  if (typeof window === 'undefined') return
  attachInterceptors()

  if (!listenersAttached) {
    listenersAttached = true
    window.addEventListener('online', () => {
      void flushViaBatchEndpoint()
    })
    if (isOnline()) {
      void flushViaBatchEndpoint()
    }
  }
}

export { flushAxiosQueue, flushViaBatchEndpoint }
