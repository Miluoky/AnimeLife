/**
 * Worker перед статическим сайтом (Cloudflare Workers, wrangler.jsonc).
 *
 * Сайт — одностраничное приложение: без этого кода Telegram, VK и поисковики видят у любой ссылки
 * одинаковый заголовок и пустую страницу. Здесь в index.html подставляются канонический адрес на animelife.top,
 * свои заголовок, описание и картинка (Open Graph) для каждой страницы, разметка schema.org и простой текст
 * страницы для поисковиков без JavaScript: у тайтла — описание, серии, связанное и похожее, у разделов и
 * посадочных страниц (жанры, годы, сезоны, типы) — список тайтлов со ссылками и страницами ?page=N,
 * у служебных страниц (правообладателям, контакты, политика, соглашение) — их текст из src/data/legal.ts.
 * Несуществующие страницы получают код 404, временные и личные — noindex. Старые адреса (www, workers.dev)
 * постоянно перенаправляются на animelife.top. Плюс карта сайта (/sitemap.xml — индекс из трёх частей), /robots.txt
 * и прокси к API Shikimori с кэшем для приложения (/api/shiki/*, worker/shikiProxy.js),
 * а также к списку серий YummyAnime (/api/yummy/videos/*, worker/yummyProxy.js).
 * Шаблоны заголовков и посадочные страницы общие с приложением: src/data/seo.ts и src/data/landings.ts.
 * Если внешний сервис не ответил, отдаётся обычный index.html: сайт работает как раньше.
 */
import { CATALOG, landingFor, landingPaths } from '../src/data/landings.ts'
import { CONTACT_EMAIL, LEGAL, textParts } from '../src/data/legal.ts'
import { isShikiProxy, shikiProxy } from './shikiProxy.js'
import { isYummyProxy, yummyProxy } from './yummyProxy.js'
import {
  ABOUT_LINKS,
  DISCLAIMER,
  GENRES,
  KINDS,
  LEGAL_LINKS,
  MAX_PAGES,
  MOVED_GENRES,
  PAGE_SIZE,
  SITE,
  ageLabel,
  cut,
  episodesLabel,
  genrePath,
  kindPath,
  pageParam,
  titlePageDescription,
  titlePageTitle,
  watchPageDescription,
  watchPageTitle,
} from '../src/data/seo.ts'

const SHIKIMORI = 'https://shikimori.io'
const APPWRITE = 'https://fra.cloud.appwrite.io/v1'
const APPWRITE_PROJECT = '6abf65850016889f9b1b'
const DAY = 24 * 3600
// Основной адрес сайта: на него указывают canonical, og:url, sitemap и robots.txt с любого зеркала.
const ORIGIN = 'https://animelife.top'
// Зеркала того же Worker: отсюда постоянный редирект на ORIGIN, чтобы поисковики не видели копий сайта.
const MIRRORS = new Set(['www.animelife.top', 'anime.artemdrr61f9.workers.dev'])

// Адреса приложения (src/App.tsx). Что сюда не подходит и не нашлось среди файлов сборки, получает 404.
const ROUTES =
  /^\/(?:|catalog|ongoing|schedule|random|top|changelog|collections|quiz|chat|together|my-list|watching|moderation|about|app|admin\/analytics|rightholders|contacts|privacy|terms|account(?:\/recovery)?|auth\/(?:callback|vk)|anime\/\d{1,10}|watch\/\d{1,10}\/\d{1,5}|together\/[A-Za-z0-9]{6}|u\/[A-Za-z0-9_.-]{1,36}|character\/\d{1,10}|genre\/[a-z-]{2,24}|type\/[a-z]{2,10}|year\/\d{4}(?:\/[a-z]{4,6})?)\/?$/
// Временные комнаты и личные страницы: в поиске им делать нечего.
const PRIVATE = /^\/(?:together\/|account|auth\/|my-list|watching|moderation|admin\/)/
// Списки со страницами ?page=N: у каждой страницы свой canonical.
const PAGED = /^\/(?:catalog$|genre\/|type\/|year\/)/

/** Список тайтлов Shikimori по фильтрам каталога, самые популярные сначала. */
const animes = (params) =>
  `${SHIKIMORI}/api/animes?${new URLSearchParams({ order: 'popularity', censored: 'true', ...params })}`
const popular = (page) => animes({ limit: 50, page })
const ONGOING = animes({ status: 'ongoing', limit: 50 })

const KIND_NAMES = { tv: 'ТВ-сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'ТВ-спешл' }

async function json(url, init, ttl = 3600) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'User-Agent': 'AnimeLife/1.0 (+https://animelife.top)', ...init?.headers },
    cf: { cacheTtl: ttl, cacheEverything: true },
    // Страница не ждёт зависший сервис дольше 3 секунд: дальше отдаётся обычный index.html.
    signal: AbortSignal.timeout(3000),
  })
  // Код ответа нужен дальше: 404 от Shikimori или Appwrite значит, что страницы нет.
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { status: res.status })
  return res.json()
}

const notFound = () => Object.assign(new Error('not found'), { status: 404 })

/**
 * Необязательная часть страницы: при сбое страница соберётся без неё, но отметка partial не пустит
 * такую неполную страницу в кэш (см. cachedPage).
 */
const optional = (promise, fallback, gaps) =>
  promise.catch(() => {
    gaps.partial = true
    return fallback
  })

/**
 * Ключ готового ответа для приложения: путь API без /api и параметры по алфавиту.
 * Так же ключ считает preloadKey в src/api/shikimori.ts, поэтому приложение не запрашивает эти данные второй раз.
 */
function preloadKey(url) {
  const u = new URL(url)
  const params = [...u.searchParams].sort(([a], [b]) => a.localeCompare(b))
  return u.pathname.replace(/^\/api/, '') + (params.length ? `?${new URLSearchParams(params)}` : '')
}

/** Постеры пачки тайтлов из GraphQL тем же запросом, что шлёт приложение (withPosters). */
const posterQuery = (ids) => `{ animes(ids: "${ids.join(',')}", limit: ${ids.length}) { id poster { originalUrl mainUrl main2xUrl } } }`

async function posters(ids) {
  const query = posterQuery(ids)
  const res = await fetch(`${SHIKIMORI}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'AnimeLife/1.0 (+https://animelife.top)' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(2000),
  })
  if (!res.ok) throw new Error(`graphql ${res.status}`)
  return { key: `graphql:${query}`, data: await res.json() }
}

const absolute = (path) => (!path || path.includes('missing_') ? undefined : path.startsWith('http') ? path : SHIKIMORI + path)

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const appwriteRow = (table, id) =>
  json(`${APPWRITE}/tablesdb/anime/tables/${table}/rows/${encodeURIComponent(id)}`, {
    headers: { 'X-Appwrite-Project': APPWRITE_PROJECT },
  }, 60)

const link = (path, text) => `<a href="${path}">${escapeHtml(text)}</a>`
const links = (list) => list.map(([text, path]) => link(path, text)).join(' · ')

// Ссылки на разделы и посадочные страницы: по ним поисковик без JavaScript находит остальной сайт.
function siteNav() {
  const year = new Date().getFullYear()
  return (
    `<nav>${links([['Главная', '/'], ['Каталог', '/catalog'], ['Онгоинги', '/ongoing'], ['Расписание', '/schedule'], ['Смотреть вместе', '/together']])}</nav>` +
    `<nav>Жанры: ${links(GENRES.slice(0, 12).map((g) => [g.name, `/genre/${g.slug}`]))}</nav>` +
    `<nav>${links([
      ...Object.entries(KINDS).map(([id, h1]) => [h1, `/type/${id}`]),
      [`Аниме ${year} года`, `/year/${year}`],
      [`Аниме ${year - 1} года`, `/year/${year - 1}`],
    ])}</nav>` +
    `<nav>${links([...ABOUT_LINKS, ...LEGAL_LINKS])}</nav><p>${escapeHtml(DISCLAIMER)}</p>`
  )
}

/** Хлебные крошки: строка ссылок в тексте и BreadcrumbList для schema.org. Последний пункт — сама страница. */
function breadcrumbs(trail) {
  const all = [['Главная', '/'], ...trail]
  return {
    html: `<nav aria-label="Хлебные крошки">${all
      .map(([name, path], i) => (i < all.length - 1 ? link(path, name) : escapeHtml(name)))
      .join(' › ')}</nav>`,
    ld: {
      '@type': 'BreadcrumbList',
      itemListElement: all.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: ORIGIN + path })),
    },
  }
}

const graph = (...nodes) => ({ '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) })

/** Сколько серий уже можно смотреть: у онгоинга — вышедшие, у анонса — ни одной. */
const available = (a) =>
  a.status === 'anons' ? 0 : a.status === 'ongoing' ? a.episodes_aired || 0 : a.episodes || a.episodes_aired || 1

/** Строка списка: ссылка на тайтл, тип, год и число серий. */
function item(a) {
  const facts = [KIND_NAMES[a.kind], a.aired_on?.slice(0, 4), a.kind !== 'movie' && a.episodes ? `${a.episodes} эп.` : '']
    .filter(Boolean)
    .join(', ')
  return `<li>${link(`/anime/${a.id}`, a.russian || a.name)}${facts ? ` — ${escapeHtml(facts)}` : ''}</li>`
}

/** Ссылки «Назад» и «Дальше» и номера соседних страниц, все обычными <a href>. */
function pager(path, page, hasNext) {
  const href = (n) => (n > 1 ? `${path}?page=${n}` : path)
  const parts = []
  if (page > 1) parts.push(`<a href="${href(page - 1)}" rel="prev">← Предыдущая</a>`)
  for (let n = Math.max(1, page - 2); n <= page + (hasNext ? 2 : 0) && n <= MAX_PAGES; n++) {
    parts.push(n === page ? `<span>Страница ${n}</span>` : `<a href="${href(n)}">${n}</a>`)
  }
  if (hasNext) parts.push(`<a href="${href(page + 1)}" rel="next">Следующая →</a>`)
  return parts.length > 1 ? `<nav aria-label="Страницы">${parts.join(' ')}</nav>` : ''
}

/**
 * Страница-список: каталог, онгоинги или посадочная (жанр, год, сезон, тип). Пустая страница — 404,
 * чтобы /year/1950 или ?page=999 не попали в поиск пустыми.
 */
async function listing(l, page) {
  const limit = l.paged ? PAGE_SIZE : 50
  const items = await json(animes({ ...l.query, limit, page }), undefined, l.query.status ? 3600 : DAY)
  if (!items.length) throw notFound()
  const hasNext = l.paged && items.length === limit && page < MAX_PAGES
  const suffix = page > 1 ? `, страница ${page}` : ''
  const crumbs = breadcrumbs([...l.crumbs, [l.h1, l.path]])
  const offset = (page - 1) * limit
  return {
    title: `${l.title}${suffix} | ${SITE}`,
    description: page > 1 ? cut(`Страница ${page}. ${l.description}`) : l.description,
    body:
      crumbs.html +
      `<h1>${escapeHtml(l.h1 + suffix)}</h1>` +
      (page === 1 ? `<p>${escapeHtml(l.intro)}</p>` : '') +
      `<ol start="${offset + 1}">${items.map(item).join('')}</ol>` +
      (l.paged ? pager(l.path, page, hasNext) : '') +
      (l.related.length ? `<h2>Смотрите также</h2><p>${links(l.related)}</p>` : '') +
      siteNav(),
    jsonLd: graph(crumbs.ld, {
      '@type': 'ItemList',
      name: l.h1 + suffix,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: items.map((a, i) => ({
        '@type': 'ListItem',
        position: offset + i + 1,
        url: `${ORIGIN}/anime/${a.id}`,
        name: a.russian || a.name,
      })),
    }),
  }
}

// Баннер главной: пять популярных онгоингов, как запрашивает Hero в src/pages/Home.tsx.
const HERO = animes({ status: 'ongoing', limit: 5, page: 1 })

async function home() {
  const year = new Date().getFullYear()
  const gaps = {}
  const [items, hero] = await Promise.all([
    optional(json(popular(1), undefined, DAY), [], gaps),
    optional(json(HERO, undefined, 1800), [], gaps),
  ])
  // Для первого тайтла баннера нужны подробности и постеры: тоже отдаём сразу, иначе это ещё два запроса после загрузки кода.
  const first = hero[0]
  const [details, art] = await Promise.all([
    first ? optional(json(`${SHIKIMORI}/api/animes/${first.id}`), null, gaps) : null,
    hero.length ? optional(posters(hero.map((a) => a.id)), null, gaps) : null,
  ])
  const preload = {}
  if (hero.length) preload[preloadKey(HERO)] = hero
  if (details) preload[preloadKey(`${SHIKIMORI}/api/animes/${first.id}`)] = details
  if (art) preload[art.key] = art.data
  const heroPoster = art?.data?.data?.animes?.find((x) => String(x.id) === String(first?.id))?.poster
  return {
    ...gaps,
    preload,
    // Постер баннера — самая крупная картинка первого экрана: браузер начинает качать его сразу с HTML.
    lcpImage: heroPoster?.main2xUrl,
    title: `Смотреть аниме онлайн бесплатно с русской озвучкой | ${SITE}`,
    description: `Аниме онлайн бесплатно с русской озвучкой: онгоинги ${year}, каталог по жанрам и годам, расписание новых серий и «Мой список» с синхронизацией.`,
    body:
      `<h1>Смотреть аниме онлайн</h1>` +
      `<p>${SITE} — сайт для просмотра аниме онлайн: онгоинги и новые серии, каталог по жанрам, годам и сезонам, расписание выхода серий, «Мой список» и совместный просмотр с друзьями.</p>` +
      (items.length ? `<h2>Популярное аниме</h2><ol>${items.map(item).join('')}</ol>` : '') +
      `<h2>Жанры</h2><p>${links(GENRES.map((g) => [g.name, `/genre/${g.slug}`]))}</p>` +
      `<h2>По годам</h2><p>${links(Array.from({ length: 8 }, (_, i) => [`Аниме ${year + 1 - i} года`, `/year/${year + 1 - i}`]))}</p>` +
      siteNav(),
    // Название сайта в выдаче Google и поиск по сайту: адрес /catalog?q= открывает каталог с этим запросом.
    jsonLd: graph(
      {
        '@type': 'WebSite',
        '@id': `${ORIGIN}/#website`,
        name: SITE,
        // Другие написания названия: по ним Google узнаёт сайт и подписывает его в выдаче как «Anime Life».
        alternateName: ['AnimeLife', 'animelife.top'],
        url: `${ORIGIN}/`,
        inLanguage: 'ru',
        publisher: { '@id': `${ORIGIN}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/catalog?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${ORIGIN}/#organization`,
        name: SITE,
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/icon-512.png`,
        email: CONTACT_EMAIL,
      },
    ),
  }
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })

/** Расписание: ближайшие серии онгоингов на неделю по московскому времени, из того же календаря Shikimori. */
async function schedule() {
  const gaps = {}
  const list = await optional(json(`${SHIKIMORI}/api/calendar?censored=true`), [], gaps)
  const now = Date.now()
  const days = new Map()
  for (const i of list) {
    const at = Date.parse(i.next_episode_at)
    if (!i.anime || !(at >= now && at < now + 7 * DAY * 1000)) continue
    const day = dayFormat.format(at).replace(/^./, (c) => c.toUpperCase())
    if (!days.has(day)) days.set(day, [])
    days.get(day).push(
      `<li>${timeFormat.format(at)} — ${link(`/anime/${i.anime.id}`, i.anime.russian || i.anime.name)}, ${i.next_episode} серия</li>`,
    )
  }
  const crumbs = breadcrumbs([['Расписание серий', '/schedule']])
  return {
    ...gaps,
    title: `Расписание выхода серий аниме на неделю | ${SITE}`,
    description: 'Когда выйдет новая серия: расписание онгоингов на ближайшую неделю с днём и временем выхода каждой серии. Напоминания и экспорт в календарь.',
    body:
      crumbs.html +
      '<h1>Расписание выхода серий</h1><p>Новые серии онгоингов на ближайшую неделю. Время московское, в приложении — ваше местное.</p>' +
      [...days].map(([day, rows]) => `<h2>${escapeHtml(day)}</h2><ul>${rows.join('')}</ul>`).join('') +
      siteNav(),
    jsonLd: graph(crumbs.ld),
  }
}

/** Связанное в порядке просмотра: предыстория, продолжение, побочные истории. Общие персонажи из других франшиз — в конце. */
const RELATIONS = ['Prequel', 'Sequel', 'Parent Story', 'Full Story', 'Side Story', 'Alternative Version', 'Alternative Setting', 'Spin-off', 'Summary', 'Other', 'Character']
const relationRank = (r) => (RELATIONS.includes(r) ? RELATIONS.indexOf(r) : RELATIONS.length)

/** Для шаблонов из src/data/seo.ts — те же поля, что приложение берёт из Anime. */
const titleInfo = (a) => ({
  title: a.russian || a.name,
  original: a.russian ? a.name : undefined,
  year: a.aired_on ? a.aired_on.slice(0, 4) : undefined,
  kind: KIND_NAMES[a.kind],
  movie: a.kind === 'movie',
  upcoming: a.status === 'anons',
  episodes: a.episodes || undefined,
  studio: a.studios?.[0]?.name,
  genres: (a.genres ?? []).map((g) => g.russian || g.name),
  description: a.description,
})

/** Ссылки на серии: все, если их до сотни, у длинных сериалов — первые 10 и последние 90. */
function episodeLinks(id, total) {
  const numbers = total <= 100 ? Array.from({ length: total }, (_, i) => i + 1) : [...Array.from({ length: 10 }, (_, i) => i + 1), ...Array.from({ length: 90 }, (_, i) => total - 89 + i)]
  return numbers.map((n, i) => (i && n - numbers[i - 1] > 1 ? '… ' : '') + `<a href="/watch/${id}/${n}">${n} серия</a>`).join(' ')
}

async function titlePage(id) {
  // Связанное и похожее меняются редко: кэш на сутки, и запросы идут параллельно с основным.
  const gaps = {}
  const [a, related, similar] = await Promise.all([
    json(`${SHIKIMORI}/api/animes/${id}`),
    optional(json(`${SHIKIMORI}/api/animes/${id}/related`, undefined, DAY), [], gaps),
    optional(json(`${SHIKIMORI}/api/animes/${id}/similar`, undefined, DAY), [], gaps),
  ])
  const info = titleInfo(a)
  const movie = info.movie
  const description = titlePageDescription(info)
  const image = absolute(a.image?.original)
  const count = available(a)
  const age = ageLabel(a.rating)
  const parent = kindPath(a.kind)
  const crumbs = breadcrumbs([parent ? [KINDS[a.kind], parent] : ['Каталог', '/catalog'], [info.title, `/anime/${a.id}`]])
  const facts = [
    KIND_NAMES[a.kind] && (parent ? link(parent, KIND_NAMES[a.kind]) : escapeHtml(KIND_NAMES[a.kind])),
    info.year && link(`/year/${info.year}`, `${info.year} год`),
    !movie && a.episodes ? escapeHtml(episodesLabel(a.episodes)) : '',
    a.status === 'ongoing' && a.episodes_aired ? `вышло ${a.episodes_aired}` : '',
    info.studio && `студия ${escapeHtml(info.studio)}`,
    age && `возрастное ограничение ${age}`,
  ].filter(Boolean)
  const genres = info.genres.map((g) => {
    const path = genrePath(g)
    return path ? link(path, g) : escapeHtml(g)
  })
  const rel = related
    .filter((r) => r.anime)
    .sort((x, y) => relationRank(x.relation) - relationRank(y.relation))
    .slice(0, 20)
  const alternate = [a.name, ...(a.english ?? []), ...(a.japanese ?? [])].filter((n) => n && n !== info.title)
  return {
    ...gaps,
    preload: {
      [preloadKey(`${SHIKIMORI}/api/animes/${id}`)]: a,
      [preloadKey(`${SHIKIMORI}/api/animes/${id}/related`)]: related,
      [preloadKey(`${SHIKIMORI}/api/animes/${id}/similar`)]: similar,
    },
    lcpImage: image,
    title: titlePageTitle(info),
    description,
    image,
    type: movie ? 'video.movie' : 'video.tv_show',
    // Текст страницы до запуска приложения: React заменит его при старте (createRoot в src/main.tsx).
    body:
      crumbs.html +
      `<h1>${escapeHtml(info.title)}</h1>` +
      (alternate.length ? `<p>${escapeHtml([...new Set(alternate)].join(' / '))}</p>` : '') +
      (facts.length ? `<p>${facts.join(' · ')}</p>` : '') +
      (genres.length ? `<p>Жанры: ${genres.join(', ')}</p>` : '') +
      (a.description ? `<p>${escapeHtml(cut(a.description, 1500))}</p>` : '') +
      (count ? `<p>${link(`/watch/${a.id}/1`, movie ? 'Смотреть фильм онлайн' : 'Смотреть 1 серию онлайн')}</p>` : '') +
      (count > 1 ? `<h2>Серии</h2><p>${episodeLinks(a.id, count)}</p>` : '') +
      (rel.length
        ? `<h2>Связанное</h2><ul>${rel.map((r) => `<li>${escapeHtml(r.relation_russian || r.relation)}: ${link(`/anime/${r.anime.id}`, r.anime.russian || r.anime.name)}</li>`).join('')}</ul>`
        : '') +
      (similar.length ? `<h2>Похожее аниме</h2><ul>${similar.slice(0, 12).map(item).join('')}</ul>` : '') +
      siteNav(),
    jsonLd: graph(crumbs.ld, {
      '@type': movie ? 'Movie' : 'TVSeries',
      name: info.title,
      alternateName: alternate.length ? [...new Set(alternate)] : undefined,
      description,
      image,
      url: `${ORIGIN}/anime/${a.id}`,
      // У фильма нет серий и даты начала: у Movie это datePublished.
      numberOfEpisodes: (!movie && a.episodes) || undefined,
      [movie ? 'datePublished' : 'startDate']: a.aired_on || undefined,
      endDate: (!movie && a.status === 'released' && a.released_on) || undefined,
      genre: info.genres,
      productionCompany: info.studio ? { '@type': 'Organization', name: info.studio } : undefined,
      // Возрастная маркировка по рейтингу Shikimori: 0+, 6+, 12+, 16+, 18+.
      contentRating: age,
      // aggregateRating не ставим: оценки здесь от Shikimori, а Google запрещает размечать рейтинги с других сайтов.
    }),
  }
}

async function watchPage(id, episode) {
  const a = await json(`${SHIKIMORI}/api/animes/${id}`)
  const count = available(a)
  // Серии, которой ещё нет, в поиске быть не должно: приложение всё равно покажет последнюю вышедшую.
  if (a.status !== 'anons' && episode > Math.max(count, 1)) throw notFound()
  const info = titleInfo(a)
  const movie = info.movie
  const titleUrl = `/anime/${a.id}`
  const name = movie ? info.title : `${info.title}: ${episode} серия`
  const crumbs = breadcrumbs(movie ? [[info.title, titleUrl], ['Смотреть онлайн', `/watch/${a.id}/1`]] : [[info.title, titleUrl], [`${episode} серия`, `/watch/${a.id}/${episode}`]])
  const near = []
  if (episode > 1) near.push([`← ${episode - 1} серия`, `/watch/${a.id}/${episode - 1}`])
  if (episode < count) near.push([`${episode + 1} серия →`, `/watch/${a.id}/${episode + 1}`])
  const genres = info.genres.map((g) => [g, genrePath(g)]).filter(([, p]) => p)
  return {
    preload: { [preloadKey(`${SHIKIMORI}/api/animes/${id}`)]: a },
    title: watchPageTitle(info, episode),
    description: watchPageDescription(info, episode, count),
    image: absolute(a.image?.original),
    type: movie ? 'video.movie' : 'video.episode',
    // У анонса вместо серии трейлер: такую страницу не индексируем.
    noindex: a.status === 'anons',
    body:
      crumbs.html +
      `<h1>${escapeHtml(name)}</h1>` +
      `<p>${escapeHtml(watchPageDescription(info, episode, count))}</p>` +
      (near.length ? `<p>${links(near)}</p>` : '') +
      `<p>${link(titleUrl, movie ? `О фильме «${info.title}»` : `Все серии «${info.title}»`)}</p>` +
      (genres.length ? `<p>Жанры: ${links(genres)}</p>` : '') +
      siteNav(),
    jsonLd: graph(
      crumbs.ld,
      !movie && {
        '@type': 'TVEpisode',
        name,
        episodeNumber: episode,
        url: `${ORIGIN}/watch/${a.id}/${episode}`,
        partOfSeries: { '@type': 'TVSeries', name: info.title, url: ORIGIN + titleUrl },
      },
    ),
  }
}

/** Абзац служебной страницы: разметка [текст](/адрес) становится ссылкой. */
const legalText = (text) => textParts(text).map((p) => (typeof p === 'string' ? escapeHtml(p) : link(p[1], p[0]))).join('')

/** Правообладателям, контакты, политика, соглашение: тот же текст, что в приложении (src/data/legal.ts). */
function legalPage(path, l) {
  const crumbs = breadcrumbs([[l.h1, path]])
  return {
    title: `${l.title} | ${SITE}`,
    description: l.description,
    body:
      crumbs.html +
      `<h1>${escapeHtml(l.h1)}</h1>` +
      l.sections
        .map(
          (s) =>
            (s.h2 ? `<h2>${escapeHtml(s.h2)}</h2>` : '') +
            (s.p ?? []).map((p) => `<p>${legalText(p)}</p>`).join('') +
            (s.list ? `<ul>${s.list.map((li) => `<li>${legalText(li)}</li>`).join('')}</ul>` : ''),
        )
        .join('') +
      (l.form === 'install' ? '' : l.form ? '<p>Форма обращения открывается в браузере с включённым JavaScript.</p>' : '') +
      siteNav(),
    jsonLd: graph(crumbs.ld),
  }
}

/** Персонаж: имя, описание без спойлеров и аниме, где он появляется. Данные те же, что берёт приложение. */
async function characterPage(id) {
  const c = await json(`${SHIKIMORI}/api/characters/${id}`, undefined, DAY)
  const name = c.russian || c.name
  // Спойлеры в превью и тексте страницы не показываем.
  const text = cut((c.description ?? '').replace(/\[spoiler(?:=[^\]]*)?\][\s\S]*?\[\/spoiler\]/gi, ''), 1500)
  const animes = (c.animes ?? []).slice(0, 30)
  const crumbs = breadcrumbs([[name, `/character/${c.id}`]])
  const image = absolute(c.image?.original)
  const description = text ? cut(text, 200) : `${name}: персонаж аниме. Кто озвучивает и в каких аниме появляется.`
  return {
    title: `${name}${c.russian && c.name ? ` (${c.name})` : ''}: персонаж аниме | ${SITE}`,
    description,
    image,
    type: 'profile',
    body:
      crumbs.html +
      `<h1>${escapeHtml(name)}</h1>` +
      (c.name && c.russian ? `<p>${escapeHtml(c.name)}</p>` : '') +
      (text ? `<p>${escapeHtml(text)}</p>` : '') +
      (animes.length ? `<h2>Аниме с персонажем</h2><ul>${animes.map((a) => `<li>${link(`/anime/${a.id}`, a.russian || a.name)}</li>`).join('')}</ul>` : '') +
      siteNav(),
    jsonLd: graph(crumbs.ld, {
      '@type': 'Person',
      name,
      alternateName: c.name && c.russian ? c.name : undefined,
      description,
      image,
      url: `${ORIGIN}/character/${c.id}`,
    }),
  }
}

/** Что показать в превью ссылки и в тексте страницы для данного адреса. */
/** Разделы, которые собирает приложение: для поисковика — заголовок, абзац о разделе, хлебные крошки и ссылки. */
const SECTIONS = {
  '/together': {
    title: 'Смотреть аниме вместе с друзьями онлайн',
    description: 'Комнаты совместного просмотра: видео идёт у всех одновременно, рядом чат, реакции и голос. Создайте комнату и позовите друзей по ссылке.',
    h1: 'Смотреть аниме вместе',
    text: '<p>Создайте комнату, позовите друзей по ссылке или коду и смотрите одну серию одновременно: пауза и перемотка у всех сразу, рядом чат и голосовая связь.</p>',
  },
  '/top': {
    title: 'Топ-100 аниме: лучшие, популярные и онгоинги',
    description: 'Рейтинг аниме по оценкам зрителей: лучшие за всё время, самые популярные, лучшие онгоинги и тайтлы этого сезона.',
    h1: 'Топ-100 аниме',
    text: '<p>Лучшие аниме по оценкам зрителей Shikimori, самые популярные тайтлы, лучшие онгоинги и рейтинг этого сезона.</p>',
  },
  '/collections': {
    title: 'Подборки аниме: что посмотреть вечером',
    description: 'Подборки аниме: с чего начать, лучшие фильмы, онгоинги, психологические триллеры, комедии, фэнтези, классика 90-х и 2000-х.',
    h1: 'Подборки аниме',
    text: '<p>Готовые списки на вечер: с чего начать знакомство с аниме, шедевры в полном метре, лучшие онгоинги, психологические триллеры, комедии без романтики, фэнтези-приключения, сэйнэн, классика 90-х и лучшее из нулевых.</p>',
  },
  '/changelog': {
    title: 'Что нового на сайте',
    description: 'Обновления Anime Life: новые разделы, функции плеера, улучшения и исправления.',
    h1: 'Что нового',
    text: '<p>Лента обновлений Anime Life: что появилось на сайте за последнее время, новые сверху.</p>',
  },
  '/quiz': {
    title: 'Угадай аниме по кадру: мини-игра',
    description: 'Мини-игра Anime Life: по кадру из популярного аниме угадайте название из четырёх вариантов. Сколько получится подряд?',
    h1: 'Угадай аниме по кадру',
    text: '<p>Кадр из популярного аниме и четыре варианта названия. Отвечайте, набирайте серию верных ответов и ставьте рекорд.</p>',
  },
  '/random': {
    title: 'Что посмотреть: случайное аниме по настроению',
    description: 'Не знаете, что посмотреть? Выберите настроение, формат и планку оценки, и Anime Life предложит случайное аниме.',
    h1: 'Что посмотреть?',
    text: '<p>Выберите настроение: посмеяться, уютное, про любовь, драйв или загадка. Сайт покрутит барабан и предложит один тайтл из каталога.</p>',
  },
}

function sectionPage(path, s) {
  const crumbs = breadcrumbs([[s.h1, path]])
  return {
    title: `${s.title} | ${SITE}`,
    description: s.description,
    body: crumbs.html + `<h1>${escapeHtml(s.h1)}</h1>` + s.text + siteNav(),
    jsonLd: graph(crumbs.ld),
  }
}

async function metaFor(path, params) {
  const page = PAGED.test(path) ? pageParam(params.get('page')) : 1
  if (path === '/') return home()
  if (path === '/catalog') return listing(CATALOG, page)
  if (path === '/schedule') return schedule()
  if (LEGAL[path]) return legalPage(path, LEGAL[path])
  if (SECTIONS[path]) return sectionPage(path, SECTIONS[path])
  const landing = landingFor(path)
  if (landing) return listing(landing, page)
  if (/^\/(?:genre|type|year)\//.test(path)) throw notFound()
  let m = path.match(/^\/anime\/(\d{1,10})$/)
  if (m) return titlePage(m[1])
  m = path.match(/^\/watch\/(\d{1,10})\/(\d{1,5})$/)
  if (m) return watchPage(m[1], Math.max(1, Number(m[2])))
  m = path.match(/^\/character\/(\d{1,10})$/)
  if (m) return characterPage(m[1])
  m = path.match(/^\/together\/([A-Za-z0-9]{6})$/)
  if (m) {
    const r = await appwriteRow('rooms', m[1].toUpperCase())
    return {
      title: `Смотрим вместе: ${r.title || r.animeTitle} | ${SITE}`,
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
      title: `${p.name}: профиль | ${SITE}`,
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

/**
 * Канонический адрес: путь без слэша на конце и без параметров, кроме ?page=N у списков.
 * В каталоге номер страницы остаётся, только если других фильтров нет. То же считает useCanonical в src/data/pageMeta.ts.
 */
function canonicalFor(path, params) {
  const page = PAGED.test(path) ? pageParam(params.get('page')) : 1
  const onlyPage = path !== '/catalog' || [...params.keys()].every((k) => k === 'page')
  return ORIGIN + path + (page > 1 && onlyPage ? `?page=${page}` : '')
}

/** Всегда свежий index.html без условных заголовков: иначе сервер ассетов может ответить 304 без тела. */
const indexHtml = (env, url) => env.ASSETS.fetch(new Request(new URL('/', url)))

async function page(env, url, status = 200) {
  return (await render(env, url, status)).res
}

/**
 * Страница приложения с заголовками, текстом для поисковиков и данными Shikimori.
 * complete — всё нужное получено: такую страницу можно хранить в кэше (см. cachedPage).
 */
async function render(env, url, status = 200, asset) {
  // Без слэша на конце, кроме «/»: так адрес совпадает с canonical и sitemap.
  const path = url.pathname.replace(/(.)\/+$/, '$1')
  asset ??= await indexHtml(env, url)
  let meta = null
  let complete = status === 200
  if (status === 200) {
    try {
      meta = await metaFor(path, url.searchParams)
      if (meta?.partial) complete = false
    } catch (e) {
      // Тайтла, комнаты или профиля нет — 404. Сервис не ответил — обычная страница, приложение само покажет ошибку.
      if (e.status === 404) status = 404
      else complete = false
    }
  }
  // Результаты поиска по сайту в выдаче не нужны: у каждого запроса своя страница без своего содержания.
  const search = path === '/catalog' && url.searchParams.has('q')
  const noindex = status !== 200 || PRIVATE.test(path) || meta?.noindex || search
  const canonical = canonicalFor(path, url.searchParams)
  // Коды подтверждения для Google Search Console и Яндекс Вебмастера (переменные Worker, см. README).
  const verification = [
    ['google-site-verification', env.GOOGLE_SITE_VERIFICATION],
    ['yandex-verification', env.YANDEX_VERIFICATION],
  ]
  const extra = verification.map(([name, value]) => (value ? `<meta name="${name}" content="${escapeHtml(value)}" />` : ''))
  let rewriter = new HTMLRewriter()
    // Страница вне поиска не называет себя канонической.
    .on('link[rel="canonical"]', new SetAttr('href', noindex ? undefined : canonical))
    .on('meta[property="og:url"]', content(canonical))
  if (noindex) rewriter = rewriter.on('meta[name="robots"]', content('noindex, follow'))
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
  // Данные, которые Worker уже получил от Shikimori: приложение берёт их отсюда, а не новым запросом после загрузки.
  if (meta?.preload && Object.keys(meta.preload).length) {
    extra.push(`<script id="shiki-preload" type="application/json">${JSON.stringify(meta.preload).replace(/</g, '\\u003c')}</script>`)
  }
  if (meta?.lcpImage) {
    extra.push(`<link rel="preload" as="image" href="${escapeHtml(meta.lcpImage)}" fetchpriority="high" />`)
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
  return { res: out, complete }
}

// Готовая страница хранится в кэше Cloudflare: первые 5 минут отдаётся как есть, потом ещё сутки тоже сразу,
// а свежая собирается в фоне. Так зритель не ждёт ответов Shikimori, пока Worker собирает страницу.
const PAGE_FRESH = 300
const PAGE_KEEP = DAY
// Комнаты и профили меняются сразу (закрыли комнату, скрыли профиль): их не храним.
const UNCACHED = /^\/(?:together\/|u\/)/

const pageKey = (url, version) => new Request(`${url.origin}/__page/${version}${url.pathname}${url.search}`)

/** Собирает страницу и, если она полная, кладёт копию в кэш с отметкой времени сборки. */
async function renderAndStore(env, ctx, url, key, asset) {
  const { res, complete } = await render(env, url, 200, asset)
  if (complete) {
    const copy = new Response(res.clone().body, res)
    copy.headers.set('Cache-Control', `public, max-age=${PAGE_KEEP}`)
    copy.headers.set('X-Rendered-At', String(Date.now()))
    ctx.waitUntil(caches.default.put(key, copy))
  }
  return res
}

async function cachedPage(request, env, ctx, url) {
  if (request.method !== 'GET' || UNCACHED.test(url.pathname)) return page(env, url)
  const asset = await indexHtml(env, url)
  // В ключе версия index.html: после выкладки страницы со ссылками на прежние файлы сборки не отдаются.
  const version = (asset.headers.get('ETag') ?? '').replace(/[^\w-]/g, '')
  if (!version) return (await render(env, url, 200, asset)).res
  const key = pageKey(url, version)
  const hit = await caches.default.match(key)
  if (!hit) {
    const res = await renderAndStore(env, ctx, url, key, asset)
    res.headers.set('X-Page-Cache', 'MISS')
    return res
  }
  await asset.body?.cancel()
  const age = Date.now() - Number(hit.headers.get('X-Rendered-At'))
  if (!(age < PAGE_FRESH * 1000)) ctx.waitUntil(renderAndStore(env, ctx, url, key).then((r) => r.body?.cancel()))
  const out = new Response(hit.body, hit)
  out.headers.set('Cache-Control', 'public, max-age=0, s-maxage=300')
  out.headers.delete('X-Rendered-At')
  out.headers.set('X-Page-Cache', age < PAGE_FRESH * 1000 ? 'HIT' : 'STALE')
  return out
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const XML = 'application/xml; charset=utf-8'
const today = () => new Date().toISOString().slice(0, 10)
const urlset = (urls) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(([path, lastmod]) => `  <url><loc>${ORIGIN}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n') +
  '\n</urlset>\n'
const xmlResponse = (xml, ttl) =>
  new Response(xml, { headers: { 'Content-Type': XML, 'Cache-Control': `public, max-age=${Math.min(ttl, 3600)}, s-maxage=${ttl}` } })

// Части карты сайта: разделы и посадочные, тайтлы, серии онгоингов.
const SITEMAPS = ['/sitemap-pages.xml', '/sitemap-titles.xml', '/sitemap-episodes.xml']

/** /sitemap.xml — индекс: поисковик сам заберёт части. Сюда указывает robots.txt. */
function sitemapIndex() {
  const day = today()
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    SITEMAPS.map((p) => `  <sitemap><loc>${ORIGIN}${p}</loc><lastmod>${day}</lastmod></sitemap>`).join('\n') +
    '\n</sitemapindex>\n'
  return xmlResponse(xml, 3600)
}

/** Разделы и посадочные страницы: без запросов к Shikimori. Дата изменения — у того, что обновляется каждый день. */
function sitemapPages() {
  const day = today()
  const year = new Date().getFullYear()
  const fresh = new Set(['/', '/catalog', '/ongoing', '/schedule', `/year/${year}`, `/year/${year + 1}`])
  const paths = ['/', '/catalog', '/schedule', '/top', '/collections', '/random', '/quiz', '/changelog', '/together', ...landingPaths(), ...[...ABOUT_LINKS, ...LEGAL_LINKS].map(([, p]) => p)]
  return xmlResponse(urlset(paths.map((p) => [p, fresh.has(p) ? day : ''])), DAY)
}

/**
 * Тайтлы и серии онгоингов. Обе части собираются из одних запросов и кэшируются в Cloudflare на сутки,
 * но только полными: неполные отдаём без сохранения.
 */
async function sitemapTitles(ctx, which) {
  const keys = { titles: new Request(`${ORIGIN}/sitemap-titles.xml`), episodes: new Request(`${ORIGIN}/sitemap-episodes.xml`) }
  const hit = await caches.default.match(keys[which])
  if (hit) return hit
  // Популярные тайтлы: 10 страниц по 50, и все онгоинги. По одному запросу с повтором: Shikimori пускает
  // не больше 5 запросов в секунду, а параллельные получали отказ, и карта каждый раз выходила разной длины.
  const all = new Map()
  let complete = true
  for (const list of [...Array.from({ length: 10 }, (_, i) => popular(i + 1)), ONGOING]) {
    const items = await json(list, undefined, DAY)
      .catch(() => pause(1000).then(() => json(list, undefined, DAY)))
      .catch(() => null)
    if (!items) complete = false
    for (const a of items ?? []) all.set(a.id, a)
  }
  // Порядок постоянный (по id), у онгоингов дата изменения — сегодня: у них выходят новые серии.
  const day = today()
  const list = [...all.values()].sort((a, b) => a.id - b.id)
  const titles = urlset(list.map((a) => [`/anime/${a.id}`, a.status === 'ongoing' ? day : '']))
  // Серии онгоингов: последние 50 вышедших. Свежая серия получает сегодняшнюю дату.
  const episodes = urlset(
    list
      .filter((a) => a.status === 'ongoing' && a.episodes_aired > 0)
      .flatMap((a) =>
        Array.from({ length: Math.min(50, a.episodes_aired) }, (_, i) => {
          const n = a.episodes_aired - i
          return [`/watch/${a.id}/${n}`, i === 0 ? day : '']
        }).reverse(),
      ),
  )
  const responses = { titles: xmlResponse(titles, DAY), episodes: xmlResponse(episodes, DAY) }
  if (complete) {
    for (const k of Object.keys(keys)) ctx.waitUntil(caches.default.put(keys[k], responses[k].clone()))
  } else {
    for (const r of Object.values(responses)) r.headers.set('Cache-Control', 'public, max-age=300')
  }
  return responses[which]
}

function robots() {
  const body =
    // /api/ — прокси данных для приложения: обход роботами только тратил бы лимит Worker.
    'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /auth/\nDisallow: /moderation\n' +
    // Яндекс склеивает адреса с метками рекламы и рассылок с основным адресом страницы.
    'Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&fbclid\n\n' +
    `Sitemap: ${ORIGIN}/sitemap.xml\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    // robots.txt отдаём на любом адресе: и на зеркале он указывает на карту сайта основного домена.
    if (url.pathname === '/robots.txt') return robots()
    // Точные часы для совместного просмотра: ответ с ближайшего узла Cloudflare приходит за миллисекунды,
    // поэтому все зрители комнаты считают позицию видео по одним и тем же часам (src/data/rooms.ts).
    if (url.pathname === '/api/time')
      return new Response(JSON.stringify({ now: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    if (MIRRORS.has(url.hostname)) return Response.redirect(ORIGIN + url.pathname + url.search, 301)
    const moved = url.pathname.match(/^\/genre\/([a-z-]+)\/?$/)?.[1]
    if (moved && MOVED_GENRES[moved]) return Response.redirect(`${ORIGIN}/genre/${MOVED_GENRES[moved]}${url.search}`, 301)
    // Данные Shikimori для приложения через кэш Cloudflare (worker/shikiProxy.js).
    if (isShikiProxy(url.pathname)) return shikiProxy(request, ctx)
    // Серии YummyAnime сжатыми и через кэш (worker/yummyProxy.js).
    if (isYummyProxy(url.pathname)) return yummyProxy(request, ctx)
    if (url.pathname === '/sitemap.xml') return sitemapIndex()
    if (url.pathname === '/sitemap-pages.xml') return sitemapPages()
    if (url.pathname === '/sitemap-titles.xml') return sitemapTitles(ctx, 'titles')
    if (url.pathname === '/sitemap-episodes.xml') return sitemapTitles(ctx, 'episodes')
    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request)
    if (ROUTES.test(url.pathname)) return cachedPage(request, env, ctx, url)
    // Файлы сборки (и ключ IndexNow из public/) отдаём как есть. Вместо отсутствующего файла сервер ассетов
    // присылает index.html: это 404.
    const res = await env.ASSETS.fetch(request)
    return (res.headers.get('Content-Type') ?? '').includes('text/html') ? page(env, url, 404) : res
  },
}
