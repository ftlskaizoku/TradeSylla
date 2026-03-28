// public/sw.js — TradeSylla Service Worker v1.0
// Enables: offline shell, install prompt, background cache

const CACHE    = "tradesylla-v1"
const PRECACHE = ["/", "/Dashboard", "/Journal", "/Analytics", "/Playbook", "/Settings"]

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
  // API calls — always network first, never cache
  if (e.request.url.includes("/api/")) return

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      return cached || network
    })
  )
})
