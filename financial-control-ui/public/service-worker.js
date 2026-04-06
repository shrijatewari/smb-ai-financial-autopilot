/* global self, caches, fetch */
/**
 * Cache-first for static assets; API traffic is not intercepted (always network when online).
 * Precaches shell so SPA can load offline after first visit.
 */
const CACHE_NAME = 'smb-financial-ui-v2'
const SHELL = ['/', '/index.html', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

function isApiRequest(url) {
  try {
    const u = new URL(url)
    return u.pathname.startsWith('/api') || u.pathname.startsWith('/system')
  } catch {
    return false
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = request.url
  if (isApiRequest(url)) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match('/index.html').then((c) => c || caches.match('/')))
    }),
  )
})
