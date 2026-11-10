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
 * постоянно перенаправляются на animelife.top. Плюс карта сайта (/sitemap.xml — индекс из трёх частей)
 * и прокси к API Shikimori с кэшем для приложения (/api/shiki/*, worker/shikiProxy.js),
 * а также к списку серий YummyAnime (/api/yummy/videos/*, worker/yummyProxy.js) и к главам манги MangaDex
 * (/api/mangadex/*, worker/mangadexProxy.js).
 * Шаблоны заголовков и посадочные страницы общие с приложением: src/data/seo.ts и src/data/landings.ts.
 * Английская версия (/en и /en/anime/<id>-<slug>) — тексты в src/data/en.ts, с hreflang в обе стороны.
 * Если внешний сервис не ответил, отдаётся обычный index.html: сайт работает как раньше.
 *
 * Лимит вызовов: Worker не запускается первым (run_worker_first: false в wrangler.animelife.jsonc), сначала ищется файл.
 * Переходы людей по страницам (браузер шлёт Sec-Fetch-Mode: navigate) Cloudflare отдаёт статическим index.html
 * без вызова Worker, канонический адрес и заголовки там ставит само приложение (src/data/pageMeta.ts).
 * Сюда приходят поисковики и превью ссылок (они не шлют этот заголовок), запросы приложения к /api/* и карта сайта.
 * robots.txt — обычный файл public/robots.txt. Подробности и правила Cloudflare: docs/worker-limit.md.
 */
import { CATALOG, landingFor, landingPaths } from '../src/data/landings.ts'
import { studioPath } from '../src/data/studios.ts'
import { CONTACT_EMAIL, LEGAL, textParts } from '../src/data/legal.ts'
import { isShikiProxy, shikiProxy } from './shikiProxy.js'
import { isYummyProxy, yummyProxy } from './yummyProxy.js'
import { isMangadexProxy, mangadexProxy } from './mangadexProxy.js'
import { isSibnetProxy, sibnetProxy } from './sibnetProxy.js'
import { isCoreApi, coreApi } from './core/router.js'
import { notifyEpisodes, notifyWeeklyDigests } from './core/push.js'
import { d1First, roomMetaFromRow } from './core/seo.js'
import { guard } from './guard.js'
import { EN_HOME, enDescription, enFacts, enName, enPath, enTitle } from '../src/data/en.ts'
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
  animePath,
  cut,
  episodesLabel,
  genrePath,
  kindPath,
  pageParam,
  similarPath,
  similarPageTitle,
  similarPageDescription,
  SIMILAR_LIMIT,
  SIMILAR_MIN,
  titlePageDescription,
  titlePageTitle,
  watchPageDescription,
  watchPageTitle,
} from '../src/data/seo.ts'

const SHIKIMORI = 'https://shikimori.io'
const DAY = 24 * 3600
// Основной адрес сайта: на него указывают canonical, og:url, sitemap и robots.txt с любого зеркала.
const ORIGIN = 'https://animelife.top'
// Зеркала того же Worker: отсюда постоянный редирект на ORIGIN, чтобы поисковики не видели копий сайта.
const MIRRORS = new Set(['www.animelife.top', 'anime.artemdrr61f9.workers.dev'])

// Адреса приложения (src/App.tsx). Что сюда не подходит и не нашлось среди файлов сборки, получает 404.
const ROUTES =
  /^\/(?:|en|en\/anime\/\d{1,10}(?:-[a-z0-9-]{1,80})?|catalog|ongoing|schedule|random|top|changelog|collections|quiz|duel(?:\/[A-Za-z0-9_-]+)?|chat|community|news|manga|season|scene|recap|collections\/(?:my|new)|together|my-list|watching|moderation|about|app|admin\/analytics|rightholders|contacts|privacy|terms|account(?:\/recovery)?|auth\/(?:callback|vk)|anime\/\d{1,10}(?:-[a-z0-9-]{1,80})?|watch\/\d{1,10}\/\d{1,5}|together\/[A-Za-z0-9]{6}|u\/[A-Za-z0-9_.-]{1,36}|club\/[A-Za-z0-9_.-]{1,36}|c\/[A-Za-z0-9_.-]{1,36}(?:\/edit)?|auth\/shikimori|character\/\d{1,10}|person\/\d{1,10}|manga\/\d{1,10}(?:\/chapter\/(?:[0-9a-f-]{36}|al-[A-Za-z0-9]{1,36})|\/upload)?|similar\/\d{1,10}(?:-[a-z0-9-]{1,80})?|studio\/[a-z0-9-]{2,30}|genre\/[a-z-]{2,24}|theme\/[a-z-]{2,24}|best\/(?:[a-z-]{2,24}|\d{4})|type\/[a-z]{2,10}|year\/\d{4}(?:\/[a-z]{4,6})?|voice\/[a-z0-9-]{2,40}|chronology\/[a-z0-9-]{2,50}|trope\/[a-z0-9-]{2,50})\/?$/
// Временные комнаты и личные страницы: в поиске им делать нечего.
const PRIVATE = /^\/(?:together\/|recap|collections\/(?:my|new)|c\/[^/]+\/edit|manga\/\d+\/(?:chapter\/|upload)|account|auth\/|my-list|watching|moderation|admin\/)/
// Списки со страницами ?page=N: у каждой страницы свой canonical.
const PAGED = /^\/(?:catalog$|genre\/|theme\/|best\/|studio\/|type\/|year\/|voice\/|trope\/)/

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
  // Код ответа нужен дальше: 404 от Shikimori значит, что страницы нет.
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

const link = (path, text) => `<a href="${path}">${escapeHtml(text)}</a>`
const links = (list) => list.map(([text, path]) => link(path, text)).join(' · ')

// Ссылки на разделы и посадочные страницы: по ним поисковик без JavaScript находит остальной сайт.
function siteNav() {
  const year = new Date().getFullYear()
  return (
    `<nav>${links([['Главная', '/'], ['Каталог', '/catalog'], ['Онгоинги', '/ongoing'], ['Расписание', '/schedule'], ['Смотреть вместе', '/together'], ['Манга', '/manga']])}</nav>` +
    `<nav>Жанры: ${links(GENRES.slice(0, 12).map((g) => [g.name, `/genre/${g.slug}`]))}</nav>` +
    `<nav>${links([
      ...Object.entries(KINDS).map(([id, h1]) => [h1, `/type/${id}`]),
      [`Аниме ${year} года`, `/year/${year}`],
      [`Аниме ${year - 1} года`, `/year/${year - 1}`],
    ])}</nav>` +
    `<nav>${links([...ABOUT_LINKS, ...LEGAL_LINKS, ['English', '/en']])}</nav><p>${escapeHtml(DISCLAIMER)}</p>`
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
  return `<li>${link(animePath(a.id, a.name), a.russian || a.name)}${facts ? ` — ${escapeHtml(facts)}` : ''}</li>`
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
  // Тема в приложении — themeId (CatalogQuery), у Shikimori это genre_v2.
  const { themeId, ...query } = l.query
  const url = animes({ ...query, ...(themeId && { genre_v2: themeId }), limit, page })
  const items = await json(url, undefined, l.query.status ? 3600 : DAY)
  if (!items.length) throw notFound()
  // Сетка страницы (CatalogGrid) просит ровно этот список по 24 и постеры к нему: отдаём их вместе с HTML,
  // а первый постер браузер качает сразу. Без этого постеры ждали загрузки кода и двух запросов (~7 с на 4G).
  const gaps = {}
  const art = l.paged ? await optional(posters(items.map((a) => a.id)), null, gaps) : null
  const first = art?.data?.data?.animes?.find((x) => String(x.id) === String(items[0].id))?.poster
  const hasNext = l.paged && items.length === limit && page < MAX_PAGES
  const suffix = page > 1 ? `, страница ${page}` : ''
  const crumbs = breadcrumbs([...l.crumbs, [l.h1, l.path]])
  const offset = (page - 1) * limit
  return {
    ...gaps,
    ...(art && {
      preload: { [preloadKey(url)]: items, [art.key]: art.data },
      // Тот же выбор 1x/2x, что у постера в сетке (Poster в src/components/PosterCard.tsx).
      lcpImage: first?.mainUrl,
      lcpSrcset: first?.mainUrl && first.main2xUrl ? `${first.mainUrl} 1x, ${first.main2xUrl} 2x` : undefined,
    }),
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
        url: ORIGIN + animePath(a.id, a.name),
        name: a.russian || a.name,
      })),
    }),
  }
}

// Баннер главной: десять популярных онгоингов, как запрашивает Hero в src/pages/Home.tsx (ONGOING_TOP).
// Тот же ответ берёт полка «Топ-10 онгоингов», поэтому десять, хотя в баннере листаются первые пять.
const HERO = animes({ status: 'ongoing', limit: 10, page: 1 })

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
    // Телефонный LCP в Hero — posterSmall (= GraphQL mainUrl). Не original: иначе preload и <img> расходятся.
    lcpImage: heroPoster?.mainUrl || absolute(first?.image?.original),
    lcpSrcset:
      heroPoster?.mainUrl && heroPoster.main2xUrl ? `${heroPoster.mainUrl} 1x, ${heroPoster.main2xUrl} 2x` : undefined,
    alternates: { ru: '/', en: '/en' },
    title: `Смотреть аниме онлайн бесплатно с русской озвучкой | ${SITE}`,
    description: `Аниме онлайн бесплатно с русской озвучкой: онгоинги ${year}, каталог по жанрам и годам, расписание новых серий и «Мой список» с синхронизацией.`,
    body:
      `<h1>Смотреть аниме онлайн</h1>` +
      `<p>${SITE} — сайт для просмотра аниме онлайн: онгоинги и новые серии, каталог по жанрам, годам и сезонам, расписание выхода серий, «Мой список» и совместный просмотр с друзьями.</p>` +
      (hero.length ? `<h2>Сейчас выходят</h2><ul>${hero.map(item).join('')}</ul>` : '') +
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
      `<li>${timeFormat.format(at)} — ${link(animePath(i.anime.id, i.anime.name), i.anime.russian || i.anime.name)}, ${i.next_episode} серия</li>`,
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

/** Постоянный редирект на правильный адрес страницы (ловится в render). */
const redirectTo = (path) => Object.assign(new Error('moved'), { location: path })

/** Главные персонажи тайтла из /roles: ссылки на их страницы, по которым поисковик доходит до /character/. */
const mainCharacters = (roles) => roles.filter((r) => r.character && r.roles?.includes('Main')).map((r) => r.character).slice(0, 12)

// Ключевые люди, как «Над аниме работали» на странице тайтла (src/api/staff.ts): роль Shikimori и подпись.
const STAFF_ROLES = [
  ['Original Creator', 'Автор оригинала'],
  ['Director', 'Режиссёр'],
  ['Series Composition', 'Сценарий'],
  ['Character Design', 'Дизайн персонажей'],
  ['Music', 'Музыка'],
]

/** [подпись, люди] для ролей из STAFF_ROLES, по два человека на роль. */
const staffOf = (roles) =>
  STAFF_ROLES.map(([key, label]) => [label, roles.filter((r) => r.person && r.roles?.includes(key)).map((r) => r.person).slice(0, 2)]).filter(
    ([, people]) => people.length,
  )

const staffLd = (staff, label) => {
  const people = staff.find(([l]) => l === label)?.[1] ?? []
  return people.length ? people.map((p) => ({ '@type': 'Person', name: p.russian || p.name, url: `${ORIGIN}/person/${p.id}` })) : undefined
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

/** Сэйю или автор: роли (персонаж и тайтл), работы и дата рождения. Данные те же, что берёт src/api/person.ts. */
async function personPage(id) {
  const p = await json(`${SHIKIMORI}/api/people/${id}`, undefined, DAY)
  const name = p.russian || p.name
  const original = p.russian && p.name ? p.name : ''
  const b = p.birth_on
  const birthday = b?.day && b?.month ? `${b.day} ${MONTHS[b.month - 1]}${b.year ? ` ${b.year}` : ''}` : b?.year ? String(b.year) : ''
  const birthDate = b?.year && b?.month && b?.day ? `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}` : undefined
  // Роль сэйю: персонаж и самый высоко оценённый тайтл с ним, как в приложении.
  const roles = (p.roles ?? [])
    .filter((r) => r.characters?.length && r.animes?.length)
    .map((r) => ({ c: r.characters[0], a: [...r.animes].sort((x, y) => Number(y.score) - Number(x.score))[0] }))
  const seen = new Set()
  const works = (p.works ?? [])
    .filter((w) => w.anime && !seen.has(w.anime.id) && seen.add(w.anime.id))
    .sort((x, y) => (y.anime.aired_on ?? '').localeCompare(x.anime.aired_on ?? ''))
  const job = p.job_title || (roles.length ? 'Сэйю' : '')
  const crumbs = breadcrumbs([[name, `/person/${p.id}`]])
  const top = roles.slice(0, 3).map(({ c, a }) => `${c.russian || c.name} («${a.russian || a.name}»)`)
  const description = cut(
    `${name}${original ? ` (${original})` : ''}${job ? ` — ${job.toLowerCase()}` : ''}.` +
      (top.length ? ` Роли: ${top.join(', ')}${roles.length > 3 ? ` и ещё ${roles.length - 3}` : ''}.` : works.length ? ` Работы: ${works.length} аниме.` : '') +
      ' Все роли и аниме на Anime Life.',
    200,
  )
  return {
    title: `${name}${original ? ` (${original})` : ''}: ${roles.length ? 'роли и аниме' : 'аниме'} | ${SITE}`,
    description,
    image: absolute(p.image?.original),
    type: 'profile',
    body:
      crumbs.html +
      `<h1>${escapeHtml(name)}</h1>` +
      ([original, p.japanese].filter(Boolean).length ? `<p>${escapeHtml([original, p.japanese].filter(Boolean).join(' / '))}</p>` : '') +
      ([job, birthday && `дата рождения ${birthday}`].filter(Boolean).length ? `<p>${escapeHtml([job, birthday && `дата рождения ${birthday}`].filter(Boolean).join(' · '))}</p>` : '') +
      (roles.length
        ? `<h2>Роли</h2><ul>${roles
            .slice(0, 60)
            .map(({ c, a }) => `<li>${link(`/character/${c.id}`, c.russian || c.name)} — ${link(animePath(a.id, a.name), a.russian || a.name)}</li>`)
            .join('')}</ul>`
        : '') +
      (works.length ? `<h2>Работы</h2><ul>${works.slice(0, 40).map((w) => item(w.anime)).join('')}</ul>` : '') +
      siteNav(),
    jsonLd: graph(crumbs.ld, {
      '@type': 'Person',
      name,
      alternateName: [original, p.japanese].filter(Boolean),
      jobTitle: job || undefined,
      birthDate,
      image: absolute(p.image?.original),
      url: `${ORIGIN}/person/${p.id}`,
      sameAs: p.website && /^https?:\/\//.test(p.website) ? [p.website] : undefined,
    }),
  }
}

async function titlePage(id, path) {
  // Связанное и похожее меняются редко: кэш на сутки, и запросы идут параллельно с основным.
  const gaps = {}
  const [a, related, similar, roles] = await Promise.all([
    json(`${SHIKIMORI}/api/animes/${id}`),
    optional(json(`${SHIKIMORI}/api/animes/${id}/related`, undefined, DAY), [], gaps),
    optional(json(`${SHIKIMORI}/api/animes/${id}/similar`, undefined, DAY), [], gaps),
    optional(json(`${SHIKIMORI}/api/animes/${id}/roles`, undefined, DAY), [], gaps),
  ])
  // Адрес с названием: /anime/6-trigun. Старый /anime/6 или адрес со старым названием ведут сюда (301).
  const canonicalPath = animePath(a.id, a.name)
  if (path && path !== canonicalPath) throw redirectTo(canonicalPath)
  const info = titleInfo(a)
  const movie = info.movie
  const description = titlePageDescription(info)
  const image = absolute(a.image?.original)
  const count = available(a)
  const age = ageLabel(a.rating)
  const parent = kindPath(a.kind)
  const crumbs = breadcrumbs([parent ? [KINDS[a.kind], parent] : ['Каталог', '/catalog'], [info.title, animePath(a.id, a.name)]])
  const facts = [
    KIND_NAMES[a.kind] && (parent ? link(parent, KIND_NAMES[a.kind]) : escapeHtml(KIND_NAMES[a.kind])),
    info.year && link(`/year/${info.year}`, `${info.year} год`),
    !movie && a.episodes ? escapeHtml(episodesLabel(a.episodes)) : '',
    a.status === 'ongoing' && a.episodes_aired ? `вышло ${a.episodes_aired}` : '',
    info.studio && (studioPath(a.studios?.[0]?.id) ? link(studioPath(a.studios[0].id), `студия ${info.studio}`) : `студия ${escapeHtml(info.studio)}`),
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
  const cast = mainCharacters(roles)
  const staff = staffOf(roles)
  return {
    ...gaps,
    preload: {
      [preloadKey(`${SHIKIMORI}/api/animes/${id}`)]: a,
      [preloadKey(`${SHIKIMORI}/api/animes/${id}/related`)]: related,
      [preloadKey(`${SHIKIMORI}/api/animes/${id}/similar`)]: similar,
    },
    lcpImage: image,
    alternates: { ru: animePath(a.id, a.name), en: enPath(a.id, a.name) },
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
        ? `<h2>Связанное</h2><ul>${rel.map((r) => `<li>${escapeHtml(r.relation_russian || r.relation)}: ${link(animePath(r.anime.id, r.anime.name), r.anime.russian || r.anime.name)}</li>`).join('')}</ul>`
        : '') +
      (cast.length ? `<h2>Главные персонажи</h2><ul>${cast.map((c) => `<li>${link(`/character/${c.id}`, c.russian || c.name)}</li>`).join('')}</ul>` : '') +
      (staff.length ? `<h2>Над аниме работали</h2><ul>${staff.map(([role, people]) => `<li>${escapeHtml(role)}: ${people.map((p) => link(`/person/${p.id}`, p.russian || p.name)).join(', ')}</li>`).join('')}</ul>` : '') +
      (similar.length
        ? `<h2>Похожее аниме</h2><ul>${similar.slice(0, 12).map(item).join('')}</ul>` +
          (similar.length >= SIMILAR_MIN ? `<p>${link(similarPath(a.id, a.name), `Все аниме, похожие на «${info.title}»`)}</p>` : '')
        : '') +
      siteNav(),
    jsonLd: graph(crumbs.ld, {
      '@type': movie ? 'Movie' : 'TVSeries',
      name: info.title,
      alternateName: alternate.length ? [...new Set(alternate)] : undefined,
      description,
      image,
      url: ORIGIN + animePath(a.id, a.name),
      // У фильма нет серий и даты начала: у Movie это datePublished.
      numberOfEpisodes: (!movie && a.episodes) || undefined,
      [movie ? 'datePublished' : 'startDate']: a.aired_on || undefined,
      endDate: (!movie && a.status === 'released' && a.released_on) || undefined,
      genre: info.genres,
      productionCompany: info.studio ? { '@type': 'Organization', name: info.studio } : undefined,
      director: staffLd(staff, 'Режиссёр'),
      creator: staffLd(staff, 'Автор оригинала'),
      musicBy: staffLd(staff, 'Музыка'),
      character: cast.length ? cast.map((c) => ({ '@type': 'Person', name: c.russian || c.name, url: `${ORIGIN}/character/${c.id}` })) : undefined,
      // Возрастная маркировка по рейтингу Shikimori: 0+, 6+, 12+, 16+, 18+.
      contentRating: age,
      // aggregateRating не ставим: оценки здесь от Shikimori, а Google запрещает размечать рейтинги с других сайтов.
    }),
  }
}

/**
 * «Аниме, похожие на …»: похожие тайтлы Shikimori списком со ссылками. Такие запросы ищут часто
 * («аниме похожие на Атаку титанов»), а на странице тайтла похожих только 12 и они не главное.
 * Если похожих меньше SIMILAR_MIN, страницы нет (404): тонкая страница поиску не нужна.
 */
async function similarPage(id, path) {
  const [a, similar] = await Promise.all([
    json(`${SHIKIMORI}/api/animes/${id}`),
    json(`${SHIKIMORI}/api/animes/${id}/similar`, undefined, DAY),
  ])
  const canonicalPath = similarPath(a.id, a.name)
  if (path !== canonicalPath) throw redirectTo(canonicalPath)
  if (similar.length < SIMILAR_MIN) throw notFound()
  const info = titleInfo(a)
  const items = similar.slice(0, SIMILAR_LIMIT)
  const names = items.map((x) => x.russian || x.name)
  const h1 = `Аниме, похожие на «${info.title}»`
  const crumbs = breadcrumbs([[info.title, animePath(a.id, a.name)], ['Похожие аниме', canonicalPath]])
  const about = [info.kind, info.year, info.genres.slice(0, 3).join(', ').toLowerCase()].filter(Boolean).join(', ')
  return {
    preload: {
      [preloadKey(`${SHIKIMORI}/api/animes/${id}`)]: a,
      [preloadKey(`${SHIKIMORI}/api/animes/${id}/similar`)]: similar,
    },
    title: `${similarPageTitle(info.title)} | ${SITE}`,
    description: similarPageDescription(info.title, names),
    image: absolute(a.image?.original),
    body:
      crumbs.html +
      `<h1>${escapeHtml(h1)}</h1>` +
      `<p>${escapeHtml(`Понравилось «${info.title}»${about ? ` (${about})` : ''}? Эти аниме зрители Shikimori чаще всего называют похожими: близкие по жанру, настроению и сюжету. Сначала самые похожие.`)}</p>` +
      `<ol>${items.map(item).join('')}</ol>` +
      `<p>${link(animePath(a.id, a.name), `Вернуться к «${info.title}»`)}</p>` +
      siteNav(),
    jsonLd: graph(crumbs.ld, {
      '@type': 'ItemList',
      name: h1,
      itemListElement: items.map((x, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: ORIGIN + animePath(x.id, x.name),
        name: x.russian || x.name,
      })),
    }),
  }
}

/**
 * Примерная дата выхода серии: у Shikimori нет дат отдельных серий, поэтому от начала показа по неделе на серию,
 * не позже конца показа и сегодняшнего дня. У фильма и первой серии — дата премьеры.
 */
function episodeDate(a, episode, now = new Date()) {
  if (!a.aired_on) return undefined
  const start = Date.parse(`${a.aired_on}T00:00:00Z`)
  if (Number.isNaN(start)) return undefined
  let t = start + (a.kind === 'movie' ? 0 : (episode - 1) * 7 * 86_400_000)
  if (a.released_on) t = Math.min(t, Date.parse(`${a.released_on}T00:00:00Z`) || t)
  t = Math.max(start, Math.min(t, now.getTime()))
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * Видео на странице серии для поиска (Google и Яндекс показывают такие страницы в видеовыдаче):
 * имя, описание, кадр, дата и длительность. Плеер чужой (Kodik и др.), поэтому embedUrl не указываем.
 */
function episodeVideo(a, info, name, description, episode, image) {
  const uploadDate = episodeDate(a, episode)
  if (!uploadDate || !image) return undefined
  return {
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl: [image],
    uploadDate,
    // У Shikimori длительность одной серии в минутах.
    duration: a.duration ? `PT${a.duration}M` : undefined,
    inLanguage: 'ru',
    isFamilyFriendly: a.rating ? !['r_plus', 'rx'].includes(a.rating) : undefined,
    genre: info.genres.length ? info.genres : undefined,
  }
}

async function watchPage(id, episode) {
  const gaps = {}
  const a = await json(`${SHIKIMORI}/api/animes/${id}`)
  const count = available(a)
  // Серии, которой ещё нет, в поиске быть не должно: приложение всё равно покажет последнюю вышедшую.
  if (a.status !== 'anons' && episode > Math.max(count, 1)) throw notFound()
  const info = titleInfo(a)
  const movie = info.movie
  const titleUrl = animePath(a.id, a.name)
  const name = movie ? info.title : `${info.title}: ${episode} серия`
  const crumbs = breadcrumbs(movie ? [[info.title, titleUrl], ['Смотреть онлайн', `/watch/${a.id}/1`]] : [[info.title, titleUrl], [`${episode} серия`, `/watch/${a.id}/${episode}`]])
  const near = []
  if (episode > 1) near.push([`← ${episode - 1} серия`, `/watch/${a.id}/${episode - 1}`])
  if (episode < count) near.push([`${episode + 1} серия →`, `/watch/${a.id}/${episode + 1}`])
  const genres = info.genres.map((g) => [g, genrePath(g)]).filter(([, p]) => p)
  const image = absolute(a.image?.original)
  // LCP на /watch — постер в PlayerGlow (posterSmall / main2x), не OG original.
  const art = await optional(posters([Number(id)]), null, gaps)
  const glowPoster = art?.data?.data?.animes?.find((x) => String(x.id) === String(id))?.poster
  const lcpImage = glowPoster?.main2xUrl || glowPoster?.mainUrl || image
  const lcpSrcset =
    glowPoster?.mainUrl && glowPoster.main2xUrl ? `${glowPoster.mainUrl} 1x, ${glowPoster.main2xUrl} 2x` : undefined
  const description = watchPageDescription(info, episode, count)
  const url = `${ORIGIN}/watch/${a.id}/${episode}`
  const video = a.status === 'anons' ? undefined : episodeVideo(a, info, movie ? `${info.title} — смотреть онлайн` : name, description, episode, image)
  return {
    ...gaps,
    preload: {
      [preloadKey(`${SHIKIMORI}/api/animes/${id}`)]: a,
      ...(art ? { [art.key]: art.data } : {}),
    },
    lcpImage,
    lcpSrcset,
    title: watchPageTitle(info, episode),
    description,
    image,
    type: movie ? 'video.movie' : 'video.episode',
    // У анонса вместо серии трейлер: такую страницу не индексируем.
    noindex: a.status === 'anons',
    body:
      crumbs.html +
      `<h1>${escapeHtml(name)}</h1>` +
      `<p>${escapeHtml(description)}</p>` +
      (near.length ? `<p>${links(near)}</p>` : '') +
      `<p>${link(titleUrl, movie ? `О фильме «${info.title}»` : `Все серии «${info.title}»`)}</p>` +
      (genres.length ? `<p>Жанры: ${links(genres)}</p>` : '') +
      siteNav(),
    jsonLd: graph(
      crumbs.ld,
      movie
        ? video && { ...video, url }
        : {
            '@type': 'TVEpisode',
            name,
            episodeNumber: episode,
            url,
            description,
            image,
            datePublished: (a.status !== 'anons' && episodeDate(a, episode)) || undefined,
            inLanguage: 'ru',
            partOfSeries: { '@type': 'TVSeries', name: info.title, url: ORIGIN + titleUrl, numberOfEpisodes: a.episodes || undefined },
            video: video && { ...video, url },
            potentialAction: a.status === 'anons' ? undefined : { '@type': 'WatchAction', target: url },
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
  // Сэйю персонажа: ссылки на их страницы (/person/), там все остальные роли.
  const seyu = (c.seyu ?? []).slice(0, 4)
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
      (seyu.length ? `<p>Озвучивает: ${seyu.map((p) => link(`/person/${p.id}`, p.russian || p.name)).join(', ')}</p>` : '') +
      (animes.length ? `<h2>Аниме с персонажем</h2><ul>${animes.map((a) => `<li>${link(animePath(a.id, a.name), a.russian || a.name)}</li>`).join('')}</ul>` : '') +
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

/** Манга или ранобэ: название, описание без спойлеров и аниме-экранизации. Данные те же, что берёт приложение. */
async function mangaPage(id) {
  const gaps = {}
  const [m, related] = await Promise.all([
    json(`${SHIKIMORI}/api/mangas/${id}`, undefined, DAY),
    optional(json(`${SHIKIMORI}/api/mangas/${id}/related`, undefined, DAY), [], gaps),
  ])
  const name = m.russian || m.name
  const kind = m.kind === 'light_novel' || m.kind === 'novel' ? 'ранобэ' : 'манга'
  const text = cut((m.description ?? '').replace(/\[spoiler(?:=[^\]]*)?\][\s\S]*?\[\/spoiler\]/gi, ''), 1500)
  const animes = related.filter((r) => r.anime).slice(0, 20)
  const crumbs = breadcrumbs([[name, `/manga/${m.id}`]])
  const description = text ? cut(text, 200) : `${name}: ${kind}. Описание, тома и главы, аниме-экранизации.`
  return {
    ...gaps,
    title: `${name}${m.russian && m.name ? ` (${m.name})` : ''}: ${kind} | ${SITE}`,
    description,
    image: absolute(m.image?.original),
    type: 'book',
    body:
      crumbs.html +
      `<h1>${escapeHtml(name)}</h1>` +
      (m.name && m.russian ? `<p>${escapeHtml(m.name)}</p>` : '') +
      (text ? `<p>${escapeHtml(text)}</p>` : '') +
      (animes.length ? `<h2>Аниме</h2><ul>${animes.map((r) => `<li>${link(animePath(r.anime.id, r.anime.name), r.anime.russian || r.anime.name)}</li>`).join('')}</ul>` : '') +
      siteNav(),
    jsonLd: graph(crumbs.ld, { '@type': 'Book', name, description, url: `${ORIGIN}/manga/${m.id}` }),
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
  '/manga': {
    title: 'Читать мангу онлайн на русском',
    description: 'Тысячи манг, манхв и маньхуа с главами на русском, поиск, популярное, лучшее и выходящее. Читайте прямо на Anime Life.',
    h1: 'Манга',
    text: '<p>Тысячи манг, манхв и маньхуа с главами на русском, поиск, популярное, лучшее и то, что выходит сейчас. Главы читаются на сайте: переводы команд с MangaDex и загруженные на Anime Life.</p>',
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
  '/community': {
    title: 'Сообщество зрителей: лента, клубы и топ недели',
    description: 'Сообщество Anime Life: что смотрят друзья, топ зрителей недели по опыту, клубы по интересам и открытые профили.',
    h1: 'Сообщество',
    text: '<p>Подписывайтесь на зрителей с похожим вкусом, следите, что они смотрят, вступайте в клубы и соревнуйтесь в топе недели.</p>',
  },
  '/news': {
    title: 'Новости аниме: анонсы, премьеры, новые сезоны',
    description: 'Свежие новости аниме: анонсы и даты премьер, новые сезоны и трейлеры. Из каждой новости можно сразу открыть тайтл.',
    h1: 'Новости аниме',
    text: '<p>Анонсы, даты премьер, новые сезоны и трейлеры. Тайтлы из новостей открываются на Anime Life.</p>',
  },
  '/season': {
    title: 'Аниме сезона: сезонный чарт с датами выхода серий',
    description: 'Все аниме текущего и следующих сезонов: сериалы, фильмы и OVA с описанием, студией, жанрами и обратным отсчётом до новой серии.',
    h1: 'Сезонный чарт',
    text: '<p>Все тайтлы сезона на одной странице: что уже выходит, когда следующая серия и что стартует скоро. Сезоны листаются стрелками.</p>',
  },
  '/scene': {
    title: 'Найти аниме по кадру или скриншоту',
    description: 'Загрузите скриншот, и Anime Life найдёт аниме, номер серии и минуту, а потом откроет серию с этого места.',
    h1: 'Найти аниме по кадру',
    text: '<p>Скриншот, мем или гифка: покажем, что это за аниме, какая серия и минута. Поиск работает на trace.moe.</p>',
  },
  '/recap': {
    title: 'Мои итоги года в аниме',
    description: 'Итоги года в аниме: часы, любимые тайтлы и жанры, озвучка и рекорды. Картинкой для соцсетей.',
    h1: 'Мои итоги года',
    text: '<p>Ваш год в аниме: сколько часов, какие тайтлы и жанры, любимая озвучка и рекорды.</p>',
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

/** Ссылки английской версии для поисковиков: русские разделы и сама английская главная. */
const enNav = () => `<nav>${links([['Anime Life (English)', '/en'], ['Русская версия', '/'], ['Каталог', '/catalog'], ['Онгоинги', '/ongoing']])}</nav>`

/** Строка английского списка: английское название, год и число серий. */
function enItem(a) {
  const facts = [a.aired_on?.slice(0, 4), a.kind !== 'movie' && a.episodes ? `${a.episodes} eps` : ''].filter(Boolean).join(', ')
  return `<li>${link(enPath(a.id, a.name), enName(a))}${facts ? ` — ${escapeHtml(facts)}` : ''}</li>`
}

/** /en: о сайте по-английски, выходящее сейчас и популярное (те же запросы, что шлёт src/pages/En.tsx). */
async function enHome() {
  const gaps = {}
  const airingUrl = animes({ status: 'ongoing', limit: 12, page: 1 })
  const popularUrl = animes({ limit: 24, page: 1 })
  const [airing, top] = await Promise.all([optional(json(airingUrl, undefined, 1800), [], gaps), optional(json(popularUrl, undefined, DAY), [], gaps)])
  const preload = {}
  if (airing.length) preload[preloadKey(airingUrl)] = airing
  if (top.length) preload[preloadKey(popularUrl)] = top
  return {
    ...gaps,
    lang: 'en',
    preload,
    alternates: { ru: '/', en: '/en' },
    title: EN_HOME.title,
    description: EN_HOME.description,
    body:
      `<h1>${escapeHtml(EN_HOME.h1)}</h1>` +
      EN_HOME.intro.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
      `<ul>${EN_HOME.features.map(([h, t]) => `<li><b>${escapeHtml(h)}</b>: ${escapeHtml(t)}</li>`).join('')}</ul>` +
      (airing.length ? `<h2>Airing now</h2><ul>${airing.map(enItem).join('')}</ul>` : '') +
      (top.length ? `<h2>Popular anime</h2><ol>${top.map(enItem).join('')}</ol>` : '') +
      enNav(),
    jsonLd: graph({
      '@type': 'WebPage',
      '@id': `${ORIGIN}/en#webpage`,
      url: `${ORIGIN}/en`,
      name: EN_HOME.title,
      description: EN_HOME.description,
      inLanguage: 'en',
      isPartOf: { '@id': `${ORIGIN}/#website` },
    }),
  }
}

/** /en/anime/<id>-<slug>: английская страница тайтла. Данные те же, что у русской (кэш общий). */
async function enTitlePage(id, path) {
  const a = await json(`${SHIKIMORI}/api/animes/${id}`)
  const canonicalPath = enPath(a.id, a.name)
  if (path !== canonicalPath) throw redirectTo(canonicalPath)
  const name = enName(a)
  const description = enDescription(a)
  const image = absolute(a.image?.original)
  const movie = a.kind === 'movie'
  const others = [...new Set([a.name, ...(a.japanese ?? [])].filter((n) => n && n !== name))]
  const crumbs = [`<nav aria-label="Breadcrumbs">${link('/en', 'Anime Life')} › ${escapeHtml(name)}</nav>`]
  return {
    lang: 'en',
    preload: { [preloadKey(`${SHIKIMORI}/api/animes/${id}`)]: a },
    lcpImage: image,
    alternates: { ru: animePath(a.id, a.name), en: canonicalPath },
    title: enTitle(a),
    description,
    image,
    type: movie ? 'video.movie' : 'video.tv_show',
    body:
      crumbs.join('') +
      `<h1>${escapeHtml(name)}</h1>` +
      (others.length ? `<p>${escapeHtml(others.join(' / '))}</p>` : '') +
      `<p>${escapeHtml(enFacts(a).join(' · '))}</p>` +
      (a.genres?.length ? `<p>Genres: ${escapeHtml(a.genres.map((g) => g.name).join(', '))}</p>` : '') +
      `<p>${escapeHtml(description)}</p>` +
      (available(a) ? `<p>${link(`/watch/${a.id}/1`, movie ? 'Watch the movie' : 'Watch episode 1')}</p>` : '') +
      `<p>${link(animePath(a.id, a.name), 'Страница на русском')}</p>` +
      enNav(),
    jsonLd: graph(
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Anime Life', item: `${ORIGIN}/en` },
          { '@type': 'ListItem', position: 2, name, item: ORIGIN + canonicalPath },
        ],
      },
      {
        '@type': movie ? 'Movie' : 'TVSeries',
        name,
        alternateName: others.length ? others : undefined,
        description,
        image,
        url: ORIGIN + canonicalPath,
        inLanguage: 'en',
        numberOfEpisodes: (!movie && a.episodes) || undefined,
        [movie ? 'datePublished' : 'startDate']: a.aired_on || undefined,
        genre: (a.genres ?? []).map((g) => g.name),
        productionCompany: a.studios?.[0] ? { '@type': 'Organization', name: a.studios[0].name } : undefined,
      },
    ),
  }
}

const VOICE_STUDIO_NAMES = {
  'anilibria': 'AniLibria',
  'studio-band': 'Студийная Банда',
  'anidub': 'AniDUB',
  'dream-cast': 'Dream Cast',
  'reanimedia': 'Реанимедиа',
  'shiza-project': 'SHIZA Project',
  'soviet-romantica': 'Soviet Romantica',
  'voik-in-the-dark': 'Голос из Темноты',
  'persona99': 'Persona99',
  'kansai': 'Kansai Studio',
  'flarrow-films': 'Flarrow Films',
  'force-media': 'Force Media',
  'anistar': 'AniStar',
  'aniplay': 'AniPlay',
  'anifilm': 'AniFilm',
  'steponee': 'StepOnee',
  'jam-club': 'Jam Club',
  'amber': 'Amber',
  'devochki': 'Девочки',
  'onwave': 'OnWave',
  'anirise': 'AniRise',
  'youmita': 'YoumiTa',
  'youmiteam': 'Youmi Team',
  'focasteam': 'FocasTeam',
  'subtitry': 'Русские субтитры',
}
const VOICE_STUDIO_LIST = Object.keys(VOICE_STUDIO_NAMES)

const FRANCHISE_NAMES = {
  'fate': 'Судьба (Fate)',
  'monogatari': 'Истории (Monogatari Series)',
  'jojo': 'Невероятные приключения ДжоДжо (JoJo)',
  'attack-on-titan': 'Атака титанов (Attack on Titan)',
  'steins-gate': 'Врата Штейна (Steins;Gate)',
  'sword-art-online': 'Мастера Меча Онлайн (Sword Art Online)',
  'naruto': 'Наруто (Naruto)',
  'bleach': 'Блич (Bleach)',
  'one-piece': 'Ван-Пис (One Piece)',
  'dragon-ball': 'Драконий жемчуг (Dragon Ball)',
  'gundam': 'Гандам (Mobile Suit Gundam)',
  'sailor-moon': 'Сейлор Мун (Sailor Moon)',
  'evangelion': 'Евангелион (Neon Genesis Evangelion)',
  'code-geass': 'Код Гиас (Code Geass)',
  'fullmetal-alchemist': 'Стальной алхимик (Fullmetal Alchemist)',
  'hunter-x-hunter': 'Хантер х Хантер (Hunter x Hunter)',
  'fairy-tail': 'Хвост Феи (Fairy Tail)',
  'gintama': 'Гинтама (Gintama)',
  'baki': 'Боец Баки (Baki)',
  'psycho-pass': 'Психопаспорт (Psycho-Pass)',
  'to-aru': 'Индекс волшебства (Toaru Series)',
  'madoka-magica': 'Девочка-волшебница Мадока (Madoka Magica)',
  'demon-slayer': 'Клинок, рассекающий демонов (Demon Slayer)',
  'jujutsu-kaisen': 'Магическая битва (Jujutsu Kaisen)',
  'tokyo-ghoul': 'Токийский гуль (Tokyo Ghoul)',
  're-zero': 'Re:Zero — Жизнь с нуля в другом мире',
  'overlord': 'Владыка (Overlord)',
  'konosuba': 'Этот замечательный мир! (KonoSuba)',
  'danmachi': 'В подземелье я пойду (DanMachi)',
}
const FRANCHISE_LIST = Object.keys(FRANCHISE_NAMES)

const TROPE_NAMES = {
  'op-from-start': 'ГГ силен с самого начала (Overpowered)',
  'mc-hides-strength': 'ГГ скрывает свою силу',
  'reborn-as-monster': 'Перерождение в монстра или существо',
  'enemies-to-lovers': 'От врагов к любви (Enemies to Lovers)',
  'isekai-cheat-skills': 'Исэкай с читерскими навыками',
  'revenge-betrayal': 'Предательство и месть',
  'tsundere-romance': 'Цундэрэ романтика',
  'childhood-friend': 'Подруга детства',
  'anti-hero': 'Главный герой — антигерой',
  'time-loop': 'Петля времени',
  'tournament-arc': 'Турнирная арка',
  'magic-academy': 'Магическая академия',
  'dungeon-crawl': 'Исследование подземелий',
  'virtual-reality': 'Виртуальная реальность и VRMMO',
  'mecha-pilots': 'Пилоты гигантских роботов',
  'yandere': 'Яндэрэ — безумная любовь',
  'demon-lord': 'Повелитель демонов',
  'slow-life': 'Медленная жизнь в деревне',
  'otome-isekai': 'Отоме-исэкай и злодейки',
  'villainess-redemption': 'Искупление злодейки',
  'hidden-identity': 'Тайная личность героя',
  'dark-fantasy': 'Тёмное фэнтези',
  'super-smart-mc': 'Гениальный главный герой',
  'weak-to-strong': 'От слабого к сильнейшему',
  'death-game': 'Смертельные игры на выживание',
}
const TROPE_LIST = Object.keys(TROPE_NAMES)

function formatStudioName(slug) {
  return VOICE_STUDIO_NAMES[slug] || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatFranchiseName(id) {
  return FRANCHISE_NAMES[id] || id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function formatTropeName(slug) {
  return TROPE_NAMES[slug] || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function voiceStudioPage(slug, page = 1) {
  const name = formatStudioName(slug)
  const crumbs = breadcrumbs([['Студии озвучки', '/catalog'], [name, `/voice/${slug}`]])
  const desc = `Смотрите аниме в русской озвучке «${name}» онлайн бесплатно в хорошем качестве 1080p: новинки онгоингов и завершённые сериалы на Anime Life.`
  return {
    title: `Аниме в озвучке ${name} смотреть онлайн бесплатно | ${SITE}`,
    description: desc,
    canonical: `${ORIGIN}/voice/${slug}${page > 1 ? `?page=${page}` : ''}`,
    body:
      crumbs.html +
      `<h1>Аниме в озвучке ${escapeHtml(name)}</h1>` +
      `<p>${desc}</p>` +
      siteNav(),
    jsonLd: graph(
      crumbs.ld,
      {
        '@type': 'CollectionPage',
        name: `Аниме в озвучке ${name}`,
        description: desc,
        url: `${ORIGIN}/voice/${slug}`,
        inLanguage: 'ru',
      }
    ),
  }
}

function chronologyPage(id) {
  const name = formatFranchiseName(id)
  const crumbs = breadcrumbs([['Хронологии франшиз', '/catalog'], [name, `/chronology/${id}`]])
  const desc = `В каком порядке смотреть аниме «${name}»: полная хронологическая последовательность сезонов, фильмов и спецвыпусков без спойлеров на Anime Life.`
  return {
    title: `Порядок просмотра «${name}»: правильная хронология всех частей | ${SITE}`,
    description: desc,
    canonical: `${ORIGIN}/chronology/${id}`,
    body:
      crumbs.html +
      `<h1>Порядок просмотра аниме «${escapeHtml(name)}»</h1>` +
      `<p>${desc}</p>` +
      siteNav(),
    jsonLd: graph(
      crumbs.ld,
      {
        '@type': 'ItemList',
        name: `Хронология и порядок просмотра «${name}»`,
        description: desc,
        url: `${ORIGIN}/chronology/${id}`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: `${name} — 1 сезон`, url: `${ORIGIN}/chronology/${id}#part-1` },
          { '@type': 'ListItem', position: 2, name: `${name} — продолжение`, url: `${ORIGIN}/chronology/${id}#part-2` },
        ],
      }
    ),
  }
}

function tropePage(slug, page = 1) {
  const name = formatTropeName(slug)
  const crumbs = breadcrumbs([['Тропы и микро-жанры', '/catalog'], [name, `/trope/${slug}`]])
  const desc = `Подборка лучших аниме с тропом «${name}» онлайн бесплатно в хорошем качестве: популярные тайтлы и описания сюжета на Anime Life.`
  return {
    title: `Аниме про «${name}» — лучшие тайтлы смотреть онлайн | ${SITE}`,
    description: desc,
    canonical: `${ORIGIN}/trope/${slug}${page > 1 ? `?page=${page}` : ''}`,
    body:
      crumbs.html +
      `<h1>Аниме про «${escapeHtml(name)}»</h1>` +
      `<p>${desc}</p>` +
      siteNav(),
    jsonLd: graph(
      crumbs.ld,
      {
        '@type': 'CollectionPage',
        name: `Аниме с тропом «${name}»`,
        description: desc,
        url: `${ORIGIN}/trope/${slug}`,
        inLanguage: 'ru',
      }
    ),
  }
}

async function metaFor(env, path, params) {
  const page = PAGED.test(path) ? pageParam(params.get('page')) : 1
  if (path === '/') return home()
  if (path === '/en') return enHome()
  if (path === '/catalog') return listing(CATALOG, page)
  if (path === '/schedule') return schedule()
  if (LEGAL[path]) return legalPage(path, LEGAL[path])
  if (SECTIONS[path]) return sectionPage(path, SECTIONS[path])
  const landing = landingFor(path)
  if (landing) return listing(landing, page)
  if (/^\/(?:genre|theme|best|studio|type|year)\//.test(path)) throw notFound()
  let m = path.match(/^\/voice\/([a-z0-9-]{2,40})$/)
  if (m) return voiceStudioPage(m[1], page)
  m = path.match(/^\/chronology\/([a-z0-9-]{2,50})$/)
  if (m) return chronologyPage(m[1])
  m = path.match(/^\/trope\/([a-z0-9-]{2,50})$/)
  if (m) return tropePage(m[1], page)
  m = path.match(/^\/anime\/(\d{1,10})(?:-[a-z0-9-]{1,80})?$/)
  if (m) return titlePage(m[1], path)
  m = path.match(/^\/en\/anime\/(\d{1,10})(?:-[a-z0-9-]{1,80})?$/)
  if (m) return enTitlePage(m[1], path)
  m = path.match(/^\/similar\/(\d{1,10})(?:-[a-z0-9-]{1,80})?$/)
  if (m) return similarPage(m[1], path)
  m = path.match(/^\/watch\/(\d{1,10})\/(\d{1,5})$/)
  if (m) return watchPage(m[1], Math.max(1, Number(m[2])))
  m = path.match(/^\/character\/(\d{1,10})$/)
  if (m) return characterPage(m[1])
  m = path.match(/^\/person\/(\d{1,10})$/)
  if (m) return personPage(m[1])
  m = path.match(/^\/manga\/(\d{1,10})$/)
  if (m) return mangaPage(m[1])
  m = path.match(/^\/together\/([A-Za-z0-9]{6})$/)
  if (m) {
    if (!env.DB) return null
    const row = await d1First(env.DB, 'SELECT * FROM rooms WHERE code = ?', m[1].toUpperCase())
    const r = roomMetaFromRow(row)
    if (!r) throw notFound()
    return {
      title: `Смотрим вместе: ${r.title || r.animeTitle} | ${SITE}`,
      description: `${r.hostName} зовёт посмотреть «${r.animeTitle}», серия ${r.episode}. Видео идёт у всех одновременно, рядом чат и голос.`,
      image: r.poster,
    }
  }
  m = path.match(/^\/club\/([A-Za-z0-9_.-]{1,36})$/)
  if (m) {
    if (!env.DB) return null
    try {
      const c = await d1First(env.DB, 'SELECT title, about, members FROM clubs WHERE id = ?', m[1])
      if (!c) throw notFound()
      return {
        title: `Клуб «${c.title}» | ${SITE}`,
        description: c.about || `Клуб зрителей Anime Life: ${c.members} участников, обсуждения и советы.`,
      }
    } catch (e) {
      if (e.status === 404 || e.message === 'd1 timeout') throw e
      // Таблица clubs ещё не накатана — дефолтный SPA meta из index.html.
      if (/no such table/i.test(String(e.message || ''))) return null
      throw e
    }
  }
  m = path.match(/^\/c\/([A-Za-z0-9_.-]{1,36})$/)
  if (m) {
    if (!env.DB) return null
    const c = await d1First(
      env.DB,
      'SELECT title, about, items, owner_name, cover FROM user_collections WHERE id = ? AND hidden = 0',
      m[1],
    )
    if (!c) throw notFound()
    let items = []
    try {
      items = JSON.parse(c.items || '[]')
    } catch {
      items = []
    }
    return {
      title: `${c.title}: подборка аниме | ${SITE}`,
      description: c.about || `Подборка от ${c.owner_name}: ${items.slice(0, 5).map((i) => i.title).join(', ')}.`,
      image: c.cover || undefined,
    }
  }
  m = path.match(/^\/u\/([A-Za-z0-9_.-]{1,36})$/)
  if (m) {
    if (!env.DB) return null
    const p = await d1First(
      env.DB,
      'SELECT name, about, summary FROM profiles WHERE user_id = ? AND hidden = 0',
      m[1],
    )
    if (!p) throw notFound()
    let s = {}
    try {
      s = JSON.parse(p.summary || '{}')
    } catch {
      s = {}
    }
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
      meta = await metaFor(env, path, url.searchParams)
      if (meta?.partial) complete = false
    } catch (e) {
      if (e.location) {
        const to = ORIGIN + e.location + url.search
        return { res: new Response(null, { status: 301, headers: { Location: to, 'Cache-Control': 'public, max-age=3600' } }), complete: false }
      }
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
    ['yandex-verification', env.YANDEX_VERIFICATION || '55f906a71e246741'],
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
  // Английская версия страницы: язык документа и ссылки hreflang в обе стороны (x-default — русская).
  if (meta?.lang) {
    rewriter = rewriter.on('html', new SetAttr('lang', meta.lang)).on('meta[property="og:locale"]', content('en_US'))
  }
  if (meta?.alternates && !noindex) {
    const { ru, en } = meta.alternates
    extra.push(
      `<link rel="alternate" hreflang="ru" href="${ORIGIN}${ru}" />`,
      `<link rel="alternate" hreflang="en" href="${ORIGIN}${en}" />`,
      `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${ru}" />`,
    )
  }
  if (meta?.jsonLd) {
    extra.push(`<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`)
  }
  // Данные, которые Worker уже получил от Shikimori: приложение берёт их отсюда, а не новым запросом после загрузки.
  if (meta?.preload && Object.keys(meta.preload).length) {
    extra.push(`<script id="shiki-preload" type="application/json">${JSON.stringify(meta.preload).replace(/</g, '\\u003c')}</script>`)
  }
  if (meta?.lcpImage) {
    const srcset = meta.lcpSrcset ? ` imagesrcset="${escapeHtml(meta.lcpSrcset)}"` : ''
    extra.push(`<link rel="preload" as="image" href="${escapeHtml(meta.lcpImage)}"${srcset} fetchpriority="high" />`)
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
// Дольше держим SEO-страницу в Cache API: повторный бот не бьёт Shikimori (вызов Worker всё равно есть).
const PAGE_FRESH = 900
const PAGE_KEEP = DAY
// Комнаты и профили меняются сразу (закрыли комнату, скрыли профиль): их не храним.
const UNCACHED = /^\/(?:together\/|u\/|club\/|c\/)/

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

/** index.html как есть, без сборки страницы. Неизвестный адрес всё равно 404. */
async function plain(env, url) {
  const res = await indexHtml(env, url)
  const out = new Response(res.body, { status: ROUTES.test(url.pathname) ? 200 : 404, headers: res.headers })
  out.headers.set('Cache-Control', 'no-store')
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

// Части карты сайта: разделы и посадочные, тайтлы, серии онгоингов, студии, хронологии, тропы.
const SITEMAPS = [
  '/sitemap-pages.xml',
  '/sitemap-titles.xml',
  '/sitemap-episodes.xml',
  '/sitemap-voices.xml',
  '/sitemap-chronology.xml',
  '/sitemap-tropes.xml',
]

/** Динамический RSS-фид для Яндекс.Вебмастера и читалок с разметкой Турбо-страниц Яндекса. */
async function rssFeed(ctx) {
  const key = new Request(`${ORIGIN}/rss.xml`)
  const hit = await caches.default.match(key)
  if (hit) return hit
  const list = await json(ONGOING, undefined, 1800).catch(() => [])
  const now = new Date().toUTCString()
  const items = (list ?? []).slice(0, 40).map((a) => {
    const title = escapeHtml(a.russian || a.name)
    const ep = a.episodes_aired || 1
    const link = `${ORIGIN}/watch/${a.id}/${ep}`
    const desc = escapeHtml(`Смотрите ${ep} серию аниме «${a.russian || a.name}» онлайн бесплатно с русской озвучкой на AnimeLife.`)
    const img = absolute(a.image?.original)
    return `    <item turbo="true">\n      <title>${title} — ${ep} серия</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      <pubDate>${now}</pubDate>\n      <description>${desc}</description>${img ? `\n      <enclosure url="${img}" type="image/jpeg" />` : ''}\n      <turbo:content><![CDATA[\n        <header>\n          <h1>${title} — ${ep} серия</h1>\n        </header>\n        ${img ? `<figure><img src="${img}" alt="${title}" /></figure>` : ''}\n        <p>${desc}</p>\n        <p><a href="${link}">Смотреть онлайн бесплатно в 1080p на AnimeLife</a></p>\n      ]]></turbo:content>\n    </item>`
  })
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:turbo="http://turbo.yandex.ru" xmlns:yandex="http://news.yandex.ru">\n' +
    '  <channel>\n' +
    '    <title>Anime Life — Новые серии аниме</title>\n' +
    `    <link>${ORIGIN}</link>\n` +
    '    <description>Свежие серии онгоингов и новинки аниме с русской озвучкой онлайн на AnimeLife</description>\n' +
    '    <language>ru</language>\n' +
    `    <lastBuildDate>${now}</lastBuildDate>\n` +
    `    <atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml" />\n` +
    items.join('\n') +
    '\n  </channel>\n</rss>\n'
  const res = new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
    },
  })
  ctx.waitUntil(caches.default.put(key, res.clone()))
  return res
}

/** /sitemap.xml — индекс: поисковик сам заберёт части. Сюда указывает robots.txt. */
function sitemapIndex() {
  const day = today()
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    SITEMAPS.map((p) => `  <sitemap><loc>${ORIGIN}${p}</loc><lastmod>${day}</lastmod></sitemap>`).join('\n') +
    '\n</sitemapindex>\n'
  return xmlResponse(xml, 3600)
}

function sitemapVoices() {
  const day = today()
  return xmlResponse(urlset(VOICE_STUDIO_LIST.map((slug) => [`/voice/${slug}`, day])), DAY)
}

function sitemapChronology() {
  const day = today()
  return xmlResponse(urlset(FRANCHISE_LIST.map((id) => [`/chronology/${id}`, day])), DAY)
}

function sitemapTropes() {
  const day = today()
  return xmlResponse(urlset(TROPE_LIST.map((slug) => [`/trope/${slug}`, day])), DAY)
}

/** Разделы и посадочные страницы: без запросов к Shikimori. Дата изменения — у того, что обновляется каждый день. */
function sitemapPages() {
  const day = today()
  const year = new Date().getFullYear()
  const fresh = new Set(['/', '/catalog', '/ongoing', '/schedule', `/year/${year}`, `/year/${year + 1}`])
  const paths = ['/', '/en', '/catalog', '/schedule', '/top', '/collections', '/random', '/quiz', '/changelog', '/together', '/community', '/news', '/season', '/scene', ...landingPaths(), ...[...ABOUT_LINKS, ...LEGAL_LINKS].map(([, p]) => p)]
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
  // Английские страницы тайтлов идут сразу за русскими: те же тайтлы, связаны через hreflang.
  const titles = urlset(
    list.flatMap((a) => {
      const lastmod = a.status === 'ongoing' ? day : ''
      return [
        [animePath(a.id, a.name), lastmod],
        [enPath(a.id, a.name), lastmod],
      ]
    }),
  )
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

export { RoomDO } from './core/roomDo.js'

export default {
  /** Раз в час: старые комнаты и сообщения Core (не трогает лимит зрительских запросов). */
  async scheduled(_event, env, ctx) {
    if (!env?.DB) return
    ctx.waitUntil(
      (async () => {
        const cutRooms = Date.now() - 6 * 3600 * 1000
        const cutMsg = Date.now() - 24 * 3600 * 1000
        await env.DB.prepare('DELETE FROM messages WHERE created_at < ?').bind(cutMsg).run()
        await env.DB.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(cutRooms).run()
        // Чат сообщества: старше 7 дней (как community-chat-cleanup в Appwrite).
        const cutChat = Date.now() - 7 * 24 * 3600 * 1000
        await env.DB.prepare('DELETE FROM community_chat_reports WHERE at < ?').bind(cutChat).run().catch(() => undefined)
        await env.DB.prepare('DELETE FROM community_chat WHERE at < ?').bind(cutChat).run().catch(() => undefined)
        try {
          const episodes = await notifyEpisodes(env)
          if (episodes.sent || episodes.due) console.log('notifyEpisodes', JSON.stringify(episodes))
        } catch (e) {
          console.error('notifyEpisodes', e)
        }
        try {
          const weekly = await notifyWeeklyDigests(env)
          if (weekly.sent) console.log('notifyWeeklyDigests', JSON.stringify(weekly))
        } catch (e) {
          console.error('notifyWeeklyDigests', e)
        }
      })().catch((e) => console.error('scheduled', e)),
    )
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    // Сканеры, сборщики для ИИ и поддельные браузеры отсеиваются до любой работы (worker/guard.js).
    const verdict = guard(request, url)
    if (verdict instanceof Response) return verdict
    // Точные часы для совместного просмотра: ответ с ближайшего узла Cloudflare приходит за миллисекунды,
    // поэтому все зрители комнаты считают позицию видео по одним и тем же часам (src/data/rooms.ts).
    if (url.pathname === '/api/time')
      return new Response(JSON.stringify({ now: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    if (MIRRORS.has(url.hostname)) return Response.redirect(ORIGIN + url.pathname + url.search, 301)
    if (/^\/animes(?:\/|$)/.test(url.pathname)) {
      return Response.redirect(ORIGIN + url.pathname.replace(/^\/animes/, '/anime') + url.search, 301)
    }
    if (/^\/mangas(?:\/|$)/.test(url.pathname)) {
      return Response.redirect(ORIGIN + url.pathname.replace(/^\/mangas/, '/manga') + url.search, 301)
    }
    const moved = url.pathname.match(/^\/genre\/([a-z-]+)\/?$/)?.[1]
    if (moved && MOVED_GENRES[moved]) return Response.redirect(`${ORIGIN}/genre/${MOVED_GENRES[moved]}${url.search}`, 301)
    // Привычный адрес поиска /search?q=… (так его набирают руками и подставляют браузеры) ведёт в каталог с запросом.
    if (/^\/search\/?$/.test(url.pathname)) {
      const q = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim().slice(0, 200)
      return Response.redirect(q ? `${ORIGIN}/catalog?q=${encodeURIComponent(q)}` : `${ORIGIN}/catalog`, 301)
    }
    // Данные Shikimori для приложения через кэш Cloudflare (worker/shikiProxy.js).
    if (isShikiProxy(url.pathname)) return shikiProxy(request, ctx)
    // Серии YummyAnime сжатыми и через кэш (worker/yummyProxy.js).
    if (isYummyProxy(url.pathname)) return yummyProxy(request, ctx)
    // Главы манги из MangaDex для читалки (worker/mangadexProxy.js).
    if (isMangadexProxy(url.pathname)) return mangadexProxy(request, ctx)
    if (isSibnetProxy(url.pathname)) return sibnetProxy(request, ctx)
    // Свой бэкенд вместо Appwrite (worker/core): auth, списки, действия community.
    if (isCoreApi(url.pathname)) return coreApi(request, env)
    if (url.pathname === '/sitemap.xml') return sitemapIndex()
    if (url.pathname === '/sitemap-pages.xml') return sitemapPages()
    if (url.pathname === '/sitemap-titles.xml') return sitemapTitles(ctx, 'titles')
    if (url.pathname === '/sitemap-episodes.xml') return sitemapTitles(ctx, 'episodes')
    if (url.pathname === '/sitemap-voices.xml') return sitemapVoices()
    if (url.pathname === '/sitemap-chronology.xml') return sitemapChronology()
    if (url.pathname === '/sitemap-tropes.xml') return sitemapTropes()
    if (url.pathname === '/rss.xml') return rssFeed(ctx)
    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request)
    // Поддельный браузер получает обычный index.html: без запросов к Shikimori и без места в кэше.
    if (verdict === 'plain' && (request.method === 'GET' || request.method === 'HEAD')) return plain(env, url)
    if (ROUTES.test(url.pathname)) return cachedPage(request, env, ctx, url)
    // Файлы сборки (и ключ IndexNow из public/) отдаём как есть. Вместо отсутствующего файла сервер ассетов
    // присылает index.html: это 404.
    const res = await env.ASSETS.fetch(request)
    return (res.headers.get('Content-Type') ?? '').includes('text/html') ? page(env, url, 404) : res
  },
}
