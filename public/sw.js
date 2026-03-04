// TradeSylla Service Worker v1.0
const CACHE = "tradesylla-v1"
const PRECACHE = ["/", "/index.html"]

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", e => {
  // Only cache GET requests for same-origin
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return
  // Skip API/bridge calls
  if (e.request.url.includes("localhost:5001") || e.request.url.includes("anthropic.com")) return

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      }).catch(() => caches.match("/index.html"))
    })
  )
})
