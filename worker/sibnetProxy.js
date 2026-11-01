/**
 * Прокси и прямой парсер для видео Sibnet (video.sibnet.ru).
 *
 * Позволяет воспроизводить серии из Sibnet напрямую в <video> «Нашего плеера»
 * со всеми улучшениями (PlayerControls, WebGL-фильтр «Чётче», пропуск опенингов,
 * память звука) и полностью без рекламы и сторонних всплывающих окон.
 *
 * Маршруты:
 *   /api/sibnet/stream/:videoid — прямой стриминг MP4 с поддержкой Range-запросов
 *   /api/sibnet/resolve/:videoid — JSON с найденной прямой ссылкой на MP4
 */

const SIBNET_HOST = 'https://video.sibnet.ru'
const PREFIX = '/api/sibnet/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const isSibnetProxy = (pathname) => pathname.startsWith(PREFIX)

// Кэш прямых URL видео, чтобы на каждый Range-запрос не парсить страницу заново (TTL 2 часа)
const URL_CACHE = new Map()

async function getDirectVideoUrl(videoId) {
  const cached = URL_CACHE.get(videoId)
  if (cached && Date.now() < cached.expires) {
    return cached.url
  }

  try {
    const res = await fetch(`${SIBNET_HOST}/shell.php?videoid=${videoId}`, {
      headers: {
        'User-Agent': UA,
        'Referer': SIBNET_HOST,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const match =
      html.match(/src:\s*["'](\/v\/[^"']+)["']/i) ||
      html.match(/\/v\/[^"'\s]+\.mp4/i) ||
      html.match(/player\.src\(\s*\[\s*\{\s*src:\s*["']([^"']+)["']/i)

    if (match) {
      const raw = match[1] || match[0]
      const fullUrl = raw.startsWith('http') ? raw : `${SIBNET_HOST}${raw}`
      URL_CACHE.set(videoId, { url: fullUrl, expires: Date.now() + 2 * 3600 * 1000 })
      return fullUrl
    }
  } catch {
    // В случае сбоя сети возвращаем null
  }
  return null
}

export async function sibnetProxy(request) {
  const url = new URL(request.url)
  const rest = url.pathname.slice(PREFIX.length)
  const parts = rest.split('/')
  const action = parts[0]
  const videoId = parts[1]

  if (!videoId || !/^\d+$/.test(videoId)) {
    return new Response(JSON.stringify({ error: 'invalid video id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const directUrl = await getDirectVideoUrl(videoId)
  if (!directUrl) {
    return new Response(JSON.stringify({ error: 'video source not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    })
  }

  if (action === 'resolve') {
    return new Response(JSON.stringify({ videoId, directUrl }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }

  // Стриминг видео через прокси с передачей Range для перемотки
  const range = request.headers.get('range')
  const reqHeaders = {
    'User-Agent': UA,
    'Referer': SIBNET_HOST,
  }
  if (range) reqHeaders['Range'] = range

  try {
    const upstreamRes = await fetch(directUrl, {
      headers: reqHeaders,
    })

    const responseHeaders = new Headers(upstreamRes.headers)
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Accept-Ranges, Content-Type')
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
    responseHeaders.set('Accept-Ranges', 'bytes')

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'proxy streaming error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
