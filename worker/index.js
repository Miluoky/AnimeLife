/**
 * Worker перед статическим сайтом (Cloudflare Workers, wrangler.jsonc).
 *
 * Сайт — одностраничное приложение: без этого кода Telegram, VK и поисковики видят у любой ссылки
 * одинаковый заголовок. Здесь для страниц тайтла, комнаты и профиля в index.html подставляются
 * свои заголовок, описание и картинка (Open Graph), а для тайтла ещё и разметка schema.org.
 * Плюс /sitemap.xml с популярными тайтлами и /robots.txt со ссылкой на него.
 * Если внешний сервис не ответил, отдаётся обычный index.html: сайт работает как раньше.
 */

const SHIKIMORI = 'https://shikimori.io'
const APPWRITE = 'https://fra.cloud.appwrite.io/v1'
const APPWRITE_PROJECT = '6abf65850016889f9b1b'
const SITE = 'Anime Life'
const DAY = 24 * 3600

async function json(url, init, ttl = 3600) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'User-Agent': 'AnimeLife/1.0 (+https://github.com/ShizukuZK/Anime)', ...init?.headers },
    cf: { cacheTtl: ttl, cacheEverything: true },
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const clean = (text, max = 200) => {
  const t = String(text ?? '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

const absolute = (path) => (!path || path.includes('missing_') ? undefined : path.startsWith('http') ? path : SHIKIMORI + path)

const appwriteRow = (table, id) =>
  json(`${APPWRITE}/tablesdb/anime/tables/${table}/rows/${encodeURIComponent(id)}`, {
    headers: { 'X-Appwrite-Project': APPWRITE_PROJECT },
  }, 60)

/** Что показать в превью ссылки для данного адреса. */
async function metaFor(path, origin) {
  let m = path.match(/^\/(?:anime|watch)\/(\d{1,10})(?:\/(\d+))?\/?$/)
  if (m) {
    const a = await json(`${SHIKIMORI}/api/animes/${m[1]}`)
    const title = a.russian || a.name
    const episode = path.startsWith('/watch/') && m[2] ? `, серия ${m[2]}` : ''
    const year = a.aired_on ? a.aired_on.slice(0, 4) : ''
    const description =
      clean(a.description, 180) || `${title}${year ? ` (${year})` : ''}: смотреть онлайн, расписание серий и отзывы.`
    const image = absolute(a.image?.original)
    return {
      title: `${title}${episode} — смотреть онлайн на ${SITE}`,
      description,
      image,
      type: 'video.tv_show',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': a.kind === 'movie' ? 'Movie' : 'TVSeries',
        name: title,
        alternateName: a.name,
        description,
        image,
        url: `${origin}/anime/${a.id}`,
        numberOfEpisodes: a.episodes || undefined,
        startDate: a.aired_on || undefined,
        genre: (a.genres ?? []).map((g) => g.russian || g.name),
        aggregateRating:
          Number(a.score) > 0
            ? { '@type': 'AggregateRating', ratingValue: Number(a.score), bestRating: 10, ratingCount: 100 }
            : undefined,
      },
    }
  }
  m = path.match(/^\/together\/([A-Za-z0-9]{6})\/?$/)
  if (m) {
    const r = await appwriteRow('rooms', m[1].toUpperCase())
    return {
      title: `Смотрим вместе: ${r.title || r.animeTitle} — ${SITE}`,
      description: `${r.hostName} зовёт посмотреть «${r.animeTitle}», серия ${r.episode}. Видео идёт у всех одновременно, рядом чат и голос.`,
      image: r.poster || undefined,
    }
  }
  m = path.match(/^\/u\/([A-Za-z0-9_.-]{1,36})\/?$/)
  if (m) {
    const p = await appwriteRow('profiles', m[1])
    const s = JSON.parse(p.summary || '{}')
    const done = s.counts?.completed ?? 0
    return {
      title: `${p.name}: профиль на ${SITE}`,
      description: p.about || `Просмотрено ${done}, серий ${s.facts?.episodes ?? 0}. Что смотрит сейчас, любимое и достижения.`,
      image: s.favorites?.[0]?.posterSmall,
      type: 'profile',
    }
  }
  return null
}

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

class SetContent {
  constructor(value) {
    this.value = value
  }
  element(el) {
    el.setAttribute('content', this.value)
  }
}

async function page(request, env, url) {
  // Адрес «/» отдаёт index.html (запрос «/index.html» сервер ассетов перенаправил бы на «/»).
  const asset = await env.ASSETS.fetch(new Request(new URL('/', url), request))
  let meta = null
  try {
    meta = await metaFor(url.pathname, url.origin)
  } catch {
    // Тайтла или комнаты нет, сервис не ответил: обычная страница, приложение само покажет ошибку.
  }
  if (!meta) return asset
  const canonical = url.origin + url.pathname.replace(/\/$/, '')
  const image = meta.image ?? `${url.origin}/og-image.png`
  const extra = [
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    meta.jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`
      : '',
  ].join('')
  const res = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(meta.title) })
    .on('meta[name="description"]', new SetContent(meta.description))
    .on('meta[property="og:title"]', new SetContent(meta.title))
    .on('meta[property="og:type"]', new SetContent(meta.type ?? 'website'))
    .on('meta[property="og:image"]', new SetContent(image))
    .on('head', { element: (el) => el.append(extra, { html: true }) })
    .transform(asset)
  const out = new Response(res.body, res)
  out.headers.set('Cache-Control', 'public, max-age=0, s-maxage=300')
  return out
}

async function sitemap(url) {
  const pages = ['/', '/catalog', '/ongoing', '/schedule', '/together']
  const ids = new Set()
  // Популярные тайтлы: 10 страниц по 50, и все онгоинги. Ответ Shikimori кэшируется на сутки.
  const lists = await Promise.allSettled([
    ...Array.from({ length: 10 }, (_, i) =>
      json(`${SHIKIMORI}/api/animes?order=popularity&limit=50&page=${i + 1}&censored=true`, undefined, DAY),
    ),
    json(`${SHIKIMORI}/api/animes?status=ongoing&order=popularity&limit=50&censored=true`, undefined, DAY),
  ])
  for (const l of lists) if (l.status === 'fulfilled') for (const a of l.value) ids.add(a.id)
  const urls = [...pages, ...[...ids].map((id) => `/anime/${id}`)]
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((p) => `  <url><loc>${url.origin}${p}</loc></url>`).join('\n') +
    '\n</urlset>\n'
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}

function robots(url) {
  const body = `User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /auth/\nDisallow: /moderation\n\nSitemap: ${url.origin}/sitemap.xml\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/sitemap.xml') return sitemap(url)
    if (url.pathname === '/robots.txt') return robots(url)
    if (request.method === 'GET' && /^\/(anime|watch|together|u)\//.test(url.pathname)) return page(request, env, url)
    return env.ASSETS.fetch(request)
  },
}
