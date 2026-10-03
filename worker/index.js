/**
 * Worker перед статическим сайтом (Cloudflare Workers, wrangler.jsonc).
 *
 * Сайт — одностраничное приложение: без этого кода Telegram, VK и поисковики видят у любой ссылки
 * одинаковый заголовок и пустую страницу. Здесь в index.html подставляются канонический адрес на animelife.top,
 * а для тайтла, комнаты и профиля — свои заголовок, описание и картинка (Open Graph), для тайтла ещё разметка
 * schema.org и простой текст страницы для поисковиков без JavaScript. Несуществующие страницы получают код 404,
 * временные и личные — noindex. Старые адреса (www, workers.dev) постоянно перенаправляются на animelife.top.
 * Плюс /sitemap.xml с популярными тайтлами и /robots.txt со ссылкой на него.
 * Если внешний сервис не ответил, отдаётся обычный index.html: сайт работает как раньше.
 */

const SHIKIMORI = 'https://shikimori.io'
const APPWRITE = 'https://fra.cloud.appwrite.io/v1'
const APPWRITE_PROJECT = '6abf65850016889f9b1b'
const SITE = 'Anime Life'
const DAY = 24 * 3600
// Основной адрес сайта: на него указывают canonical, og:url, sitemap и robots.txt с любого зеркала.
const ORIGIN = 'https://animelife.top'
// Зеркала того же Worker: отсюда постоянный редирект на ORIGIN, чтобы поисковики не видели копий сайта.
const MIRRORS = new Set(['www.animelife.top', 'anime.artemdrr61f9.workers.dev'])

// Адреса приложения (src/App.tsx). Что сюда не подходит и не нашлось среди файлов сборки, получает 404.
const ROUTES =
  /^\/(?:|catalog|ongoing|schedule|together|my-list|moderation|account(?:\/recovery)?|auth\/(?:callback|vk)|anime\/\d{1,10}|watch\/\d{1,10}\/\d{1,5}|together\/[A-Za-z0-9]{6}|u\/[A-Za-z0-9_.-]{1,36})\/?$/
// Временные комнаты и личные страницы: в поиске им делать нечего.
const PRIVATE = /^\/(?:together\/|account|auth\/|my-list|moderation)/

const popular = (page) => `${SHIKIMORI}/api/animes?order=popularity&limit=50&page=${page}&censored=true`
const ONGOING = `${SHIKIMORI}/api/animes?status=ongoing&order=popularity&limit=50&censored=true`

// Разделы со списком ссылок на тайтлы для поисковиков без JavaScript. Списки те же, что в sitemap (кэш на сутки).
const SECTIONS = {
  '/': { h1: `${SITE} — смотреть аниме онлайн`, list: popular(1), more: 'Популярное аниме' },
  '/catalog': { title: 'Каталог аниме', list: popular(1), more: 'Популярное аниме' },
  '/ongoing': { title: 'Онгоинги', list: ONGOING, more: 'Выходят сейчас' },
  '/schedule': { title: 'Расписание серий' },
  '/together': { title: 'Смотреть вместе' },
}

const KINDS = { tv: 'ТВ-сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'ТВ-спешл' }

async function json(url, init, ttl = 3600) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'User-Agent': 'AnimeLife/1.0 (+https://github.com/ShizukuZK/Anime)', ...init?.headers },
    cf: { cacheTtl: ttl, cacheEverything: true },
    // Страница не ждёт зависший сервис дольше 3 секунд: дальше отдаётся обычный index.html.
    signal: AbortSignal.timeout(3000),
  })
  // Код ответа нужен дальше: 404 от Shikimori или Appwrite значит, что страницы нет.
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { status: res.status })
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

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const appwriteRow = (table, id) =>
  json(`${APPWRITE}/tablesdb/anime/tables/${table}/rows/${encodeURIComponent(id)}`, {
    headers: { 'X-Appwrite-Project': APPWRITE_PROJECT },
  }, 60)

// Ссылки на разделы: по ним поисковик без JavaScript находит остальной сайт.
const NAV =
  '<nav><a href="/">Главная</a> · <a href="/catalog">Каталог</a> · <a href="/ongoing">Онгоинги</a> · <a href="/schedule">Расписание</a></nav>'

/** Что показать в превью ссылки и в тексте страницы для данного адреса. */
async function metaFor(path) {
  const section = SECTIONS[path]
  if (section) {
    const items = section.list ? await json(section.list, undefined, DAY).catch(() => []) : []
    const links = items.map((a) => `<li><a href="/anime/${a.id}">${escapeHtml(a.russian || a.name)}</a></li>`).join('')
    return {
      title: section.title && `${section.title} — ${SITE}`,
      body:
        `<h1>${escapeHtml(section.h1 ?? section.title)}</h1>${NAV}` +
        (links ? `<h2>${section.more}</h2><ul>${links}</ul>` : ''),
      // Название сайта в выдаче Google.
      jsonLd: path === '/' ? { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: `${ORIGIN}/` } : null,
    }
  }
  let m = path.match(/^\/(?:anime|watch)\/(\d{1,10})(?:\/(\d+))?$/)
  if (m) {
    const a = await json(`${SHIKIMORI}/api/animes/${m[1]}`)
    const title = a.russian || a.name
    const episode = path.startsWith('/watch/') && m[2] ? `, серия ${m[2]}` : ''
    const year = a.aired_on ? a.aired_on.slice(0, 4) : ''
    const movie = a.kind === 'movie'
    const description =
      clean(a.description, 180) || `${title}${year ? ` (${year})` : ''}: смотреть онлайн, расписание серий и отзывы.`
    const image = absolute(a.image?.original)
    const genres = (a.genres ?? []).map((g) => g.russian || g.name)
    const facts = [KINDS[a.kind], year, !movie && a.episodes ? `${a.episodes} эп.` : ''].filter(Boolean).join(' · ')
    return {
      title: `${title}${episode} — смотреть онлайн на ${SITE}`,
      description,
      image,
      type: movie ? 'video.movie' : 'video.tv_show',
      // Текст страницы до запуска приложения: React заменит его при старте (createRoot в src/main.tsx).
      body:
        `<h1>${escapeHtml(title + episode)}</h1>` +
        (a.name && a.name !== title ? `<p>${escapeHtml(a.name)}</p>` : '') +
        (facts ? `<p>${escapeHtml(facts)}</p>` : '') +
        (genres.length ? `<p>Жанры: ${escapeHtml(genres.join(', '))}</p>` : '') +
        (a.description ? `<p>${escapeHtml(clean(a.description, 1500))}</p>` : '') +
        (episode ? `<p><a href="/anime/${a.id}">О тайтле «${escapeHtml(title)}»</a></p>` : '') +
        (a.episodes_aired || a.episodes || movie ? `<p><a href="/watch/${a.id}/1">Смотреть онлайн</a></p>` : '') +
        NAV,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': movie ? 'Movie' : 'TVSeries',
        name: title,
        alternateName: a.name,
        description,
        image,
        url: `${ORIGIN}/anime/${a.id}`,
        // У фильма нет серий и даты начала: у Movie это datePublished.
        numberOfEpisodes: (!movie && a.episodes) || undefined,
        [movie ? 'datePublished' : 'startDate']: a.aired_on || undefined,
        genre: genres,
        // aggregateRating не ставим: у Shikimori есть оценка, но нет числа голосов, а выдумывать его нельзя.
      },
    }
  }
  m = path.match(/^\/together\/([A-Za-z0-9]{6})$/)
  if (m) {
    const r = await appwriteRow('rooms', m[1].toUpperCase())
    return {
      title: `Смотрим вместе: ${r.title || r.animeTitle} — ${SITE}`,
      description: `${r.hostName} зовёт посмотреть «${r.animeTitle}», серия ${r.episode}. Видео идёт у всех одновременно, рядом чат и голос.`,
      image: r.poster || undefined,
    }
  }
  m = path.match(/^\/u\/([A-Za-z0-9_.-]{1,36})$/)
  if (m) {
    // Скрытый профиль Appwrite не отдаёт (404): такая страница тоже получает 404.
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

class SetAttr {
  constructor(name, value) {
    this.name = name
    this.value = value
  }
  element(el) {
    if (this.value === undefined) el.remove()
    else el.setAttribute(this.name, this.value)
  }
}
const content = (value) => new SetAttr('content', value)

async function page(env, url, status = 200) {
  // Без слэша на конце, кроме «/»: так адрес совпадает с canonical и sitemap.
  const path = url.pathname.replace(/(.)\/+$/, '$1')
  // Всегда свежий index.html без условных заголовков: иначе сервер ассетов может ответить 304 без тела.
  const asset = await env.ASSETS.fetch(new Request(new URL('/', url)))
  let meta = null
  if (status === 200) {
    try {
      meta = await metaFor(path)
    } catch (e) {
      // Тайтла, комнаты или профиля нет — 404. Сервис не ответил — обычная страница, приложение само покажет ошибку.
      if (e.status === 404) status = 404
    }
  }
  const noindex = status !== 200 || PRIVATE.test(path)
  const canonical = ORIGIN + path
  // Коды подтверждения для Google Search Console и Яндекс Вебмастера (переменные Worker, см. README).
  const verification = [
    ['google-site-verification', env.GOOGLE_SITE_VERIFICATION],
    ['yandex-verification', env.YANDEX_VERIFICATION],
  ]
  const extra = [
    noindex ? '<meta name="robots" content="noindex" />' : '',
    ...verification.map(([name, value]) => (value ? `<meta name="${name}" content="${escapeHtml(value)}" />` : '')),
  ]
  let rewriter = new HTMLRewriter()
    // Страница вне поиска не называет себя канонической.
    .on('link[rel="canonical"]', new SetAttr('href', noindex ? undefined : canonical))
    .on('meta[property="og:url"]', content(canonical))
  if (meta?.title) {
    rewriter = rewriter
      .on('title', { element: (el) => el.setInnerContent(meta.title) })
      .on('meta[property="og:title"]', content(meta.title))
    extra.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`)
  }
  if (meta?.description) {
    rewriter = rewriter
      .on('meta[name="description"]', content(meta.description))
      .on('meta[property="og:description"]', content(meta.description))
    extra.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`)
  }
  if (meta?.image) {
    rewriter = rewriter.on('meta[property="og:image"]', content(meta.image))
    extra.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`)
  }
  if (meta?.type) rewriter = rewriter.on('meta[property="og:type"]', content(meta.type))
  if (meta?.jsonLd) {
    extra.push(`<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`)
  }
  if (meta?.body) {
    const body = `<main class="container">${meta.body}</main>`
    rewriter = rewriter.on('#root', { element: (el) => el.setInnerContent(body, { html: true }) })
  }
  const res = rewriter.on('head', { element: (el) => el.append(extra.join(''), { html: true }) }).transform(asset)
  const out = new Response(res.body, { status, headers: res.headers })
  out.headers.set('Cache-Control', 'public, max-age=0, s-maxage=300')
  // ETag принадлежит index.html, а страница у каждого адреса своя.
  out.headers.delete('ETag')
  if (noindex) out.headers.set('X-Robots-Tag', 'noindex')
  return out
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function sitemap(ctx) {
  // Готовая карта хранится в кэше Cloudflare сутки, но только полная: неполную отдаём без сохранения.
  const key = new Request(`${ORIGIN}/sitemap.xml`)
  const hit = await caches.default.match(key)
  if (hit) return hit
  const pages = ['/', '/catalog', '/ongoing', '/schedule', '/together']
  // Популярные тайтлы: 10 страниц по 50, и все онгоинги. По одному запросу с повтором: Shikimori пускает
  // не больше 5 запросов в секунду, а параллельные получали отказ, и карта каждый раз выходила разной длины.
  const ongoing = new Map()
  let complete = true
  for (const list of [...Array.from({ length: 10 }, (_, i) => popular(i + 1)), ONGOING]) {
    const items = await json(list, undefined, DAY)
      .catch(() => pause(1000).then(() => json(list, undefined, DAY)))
      .catch(() => null)
    if (!items) complete = false
    for (const a of items ?? []) ongoing.set(a.id, ongoing.get(a.id) || a.status === 'ongoing')
  }
  // Порядок постоянный (по id), у онгоингов дата изменения — сегодня: у них выходят новые серии.
  const today = new Date().toISOString().slice(0, 10)
  const ids = [...ongoing.keys()].sort((a, b) => a - b)
  const urls = [
    ...pages.map((p) => `  <url><loc>${ORIGIN}${p}</loc></url>`),
    ...ids.map((id) => {
      const lastmod = ongoing.get(id) ? `<lastmod>${today}</lastmod>` : ''
      return `  <url><loc>${ORIGIN}/anime/${id}</loc>${lastmod}</url>`
    }),
  ]
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  const res = new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': complete ? `public, max-age=3600, s-maxage=${DAY}` : 'public, max-age=300',
    },
  })
  if (complete) ctx.waitUntil(caches.default.put(key, res.clone()))
  return res
}

function robots() {
  const body = `User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /auth/\nDisallow: /moderation\n\nSitemap: ${ORIGIN}/sitemap.xml\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    // robots.txt отдаём на любом адресе: и на зеркале он указывает на карту сайта основного домена.
    if (url.pathname === '/robots.txt') return robots()
    if (MIRRORS.has(url.hostname)) return Response.redirect(ORIGIN + url.pathname + url.search, 301)
    if (url.pathname === '/sitemap.xml') return sitemap(ctx)
    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request)
    if (ROUTES.test(url.pathname)) return page(env, url)
    // Файлы сборки отдаём как есть. Вместо отсутствующего файла сервер ассетов присылает index.html: это 404.
    const res = await env.ASSETS.fetch(request)
    return (res.headers.get('Content-Type') ?? '').includes('text/html') ? page(env, url, 404) : res
  },
}
