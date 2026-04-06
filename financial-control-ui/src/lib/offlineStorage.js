/**
 * IndexedDB persistence for offline-queued API payloads and export helpers.
 * Isolated module – no UI.
 */

const DB_NAME = 'smb-offline-first'
const DB_VERSION = 1
const STORE_QUEUE = 'queue'
const STORE_META = 'meta'

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const q = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
        q.createIndex('ts', 'ts', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

/**
 * Generic save (e.g. form snapshots, arbitrary payloads).
 * @param {object} data – must include `id` or one will be assigned
 */
export async function saveOfflineData(data) {
  const db = await openDb()
  const id = data.id ?? crypto.randomUUID()
  const row = { ...data, id, ts: data.ts ?? Date.now(), kind: data.kind ?? 'snapshot' }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite')
    tx.objectStore(STORE_QUEUE).put(row)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
  })
}

/** @returns {Promise<object[]>} */
export async function getOfflineData() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly')
    const req = tx.objectStore(STORE_QUEUE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function clearOfflineData() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite')
    tx.objectStore(STORE_QUEUE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** @typedef {{ id: string, ts: number, method: string, url: string, params?: object, data?: unknown, headers?: object }} QueuedAxiosLike */

/** @param {QueuedAxiosLike & { kind?: string }} item */
export async function enqueueRequest(item) {
  const id = item.id ?? crypto.randomUUID()
  const row = { ...item, id, ts: item.ts ?? Date.now(), kind: item.kind ?? 'axios' }
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite')
    tx.objectStore(STORE_QUEUE).put(row)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
  })
}

/** @returns {Promise<QueuedAxiosLike[]>} */
export async function getQueuedRequests() {
  const all = await getOfflineData()
  return all.filter((r) => r.kind === 'axios')
}

/** @param {string} id */
export async function removeQueuedRequest(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite')
    tx.objectStore(STORE_QUEUE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Build CSV from queued rows (transactions / payloads).
 * @param {object[]} rows
 * @param {string[]} [columns]
 */
export function rowsToCsv(rows, columns) {
  if (!rows.length) return ''
  const cols = columns ?? Object.keys(rows[0])
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))]
  return lines.join('\n')
}

/** Trigger browser download of a CSV string */
export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
