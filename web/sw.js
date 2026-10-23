const CACHE_NAME = 'vxplants-shell-v5'
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/groot.svg',
  '/icon.svg',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never intercept dynamic API or image-proxy endpoints
  if (
    url.pathname.startsWith('/identify') ||
    url.pathname.startsWith('/wiki-summary') ||
    url.pathname.startsWith('/image-proxy') ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200 && url.origin === self.location.origin) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(request).then(cached => {
          if (cached) return cached
          if (request.mode === 'navigate') {
            return caches.match('/index.html')
          }
          return new Response('', { status: 404 })
        })
      )
  )
})
