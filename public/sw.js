// Service worker Anime Life: сайт открывается мгновенно и работает без сети на уже открытых страницах.
// Меняйте VERSION, если меняется логика кэша: старые кэши удалятся при активации.
const VERSION = 'v2'
const SHELL = `shell-${VERSION}`
const STATIC = `static-${VERSION}`
const DATA = `data-${VERSION}`
const IMAGES = `images-${VERSION}`
// Картинки Shikimori приходят без CORS (opaque), браузер считает их в квоте крупными, поэтому держим немного.
const LIMITS = { [DATA]: 200, [IMAGES]: 120 }

const scope = new URL(self.registration.scope)
const indexUrl = new URL('index.html', scope).toString()

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([indexUrl, new URL('icon-192.png', scope).toString()]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL, STATIC, DATA, IMAGES])
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trim(name) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  const extra = keys.length - LIMITS[name]
  for (let i = 0; i < extra; i++) await cache.delete(keys[i])
}

async function put(name, request, response) {
  if (!response || !(response.ok || response.type === 'opaque')) return
  try {
    const cache = await caches.open(name)
    await cache.put(request, response)
    if (LIMITS[name]) await trim(name)
  } catch {
    // Квота кончилась или запрос не кэшируется: просто отдаём ответ без сохранения.
  }
}

// Сначала сеть, без неё берём из кэша: так данные свежие, а офлайн показывается последнее увиденное.
async function networkFirst(request, name) {
  try {
    const response = await fetch(request)
    put(name, request, response.clone())
    return response
  } catch (e) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw e
  }
}

// Сначала кэш: для файлов, которые не меняются (сборка с хэшем в имени, шрифты, картинки).
async function cacheFirst(request, name) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  put(name, request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Переходы по страницам: свежий index.html, без сети — сохранённый.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(SHELL).then((c) => c.put(indexUrl, response.clone()))
          return response
        })
        .catch(() => caches.match(indexUrl)),
    )
    return
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/assets/')) event.respondWith(cacheFirst(request, STATIC))
    return
  }

  // Данные и картинки Shikimori (постеры могут отдаваться с поддоменов вроде desu.shikimori.one).
  if (/shikimori\.(io|one|me)$/.test(url.hostname)) {
    if (url.pathname.startsWith('/api/')) event.respondWith(networkFirst(request, DATA))
    else if (/\.(jpe?g|png|webp|gif)$/i.test(url.pathname) || /^\/(system|uploads)\//.test(url.pathname))
      event.respondWith(cacheFirst(request, IMAGES))
  }
  // Appwrite, YouTube и всё остальное идёт напрямую в сеть.
})

// Уведомления о новых сериях: их присылает функция community (см. src/data/push.ts).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data && event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Anime Life', {
      body: data.body || '',
      icon: new URL('icon-192.png', scope).toString(),
      badge: new URL('icon-192.png', scope).toString(),
      tag: data.tag,
      data: { url: data.url || scope.toString() },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || scope.toString()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(scope.toString()))
      if (open) return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : undefined))
      return self.clients.openWindow(url)
    }),
  )
})
