/**
 * Test & Verification Harness for Technical SEO Artifacts:
 * 1. Robots.txt rules validation
 * 2. Dynamic Sitemap XML generation & RFC 7232 (If-Modified-Since / 304) simulation
 * 3. Schema.org JSON-LD validator (TVSeries, TVEpisode, Movie, BreadcrumbList, VideoObject)
 * 4. Dynamic Meta Tags Formula Engine
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// --- 1. Robots.txt Validation ---
const ROBOTS_TXT_CONTENT = `# ==============================================================================
# AnimeLife (https://animelife.top) - Production Robots.txt
# High-Performance Edge-Optimized Robots Configuration
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. AI Web Scrapers, LLM Harvesters & Autonomous Bots (Block all bandwidth leeches)
# ------------------------------------------------------------------------------
User-agent: Amazonbot
User-agent: anthropic-ai
User-agent: Applebot-Extended
User-agent: Bytespider
User-agent: CCBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-Web
User-agent: cohere-ai
User-agent: Diffbot
User-agent: FacebookBot
User-agent: FriendlyCrawler
User-agent: Google-Extended
User-agent: GPTBot
User-agent: ImagesiftBot
User-agent: Kangaroo Bot
User-agent: Meta-ExternalAgent
User-agent: Meta-ExternalFetcher
User-agent: Omgili
User-agent: Omgilibot
User-agent: PerplexityBot
User-agent: Scrapy
User-agent: Timpibot
User-agent: VelenPublicWebCrawler
User-agent: Webzio-Extended
Disallow: /

# ------------------------------------------------------------------------------
# 2. Aggressive Commercial SEO Crawlers & Backlink Scrapers (Prevent crawl budget exhaustion)
# ------------------------------------------------------------------------------
User-agent: AhrefsBot
User-agent: Barkrowler
User-agent: BLEXBot
User-agent: DataForSeoBot
User-agent: DotBot
User-agent: MegaIndex
User-agent: MJ12bot
User-agent: PetalBot
User-agent: Seekport
User-agent: SemrushBot
User-agent: serpstatbot
User-agent: ZoominfoBot
Disallow: /

# ------------------------------------------------------------------------------
# 3. Yandex Crawler (YandexBot, YandexVideo, YandexImages)
# Optimized for Yandex Webmaster Clean-param & Video Indexing
# ------------------------------------------------------------------------------
User-agent: Yandex
User-agent: YandexBot
User-agent: YandexVideo
User-agent: YandexImages
Allow: /
# Public anime catalog, titles, episodes and landings
Allow: /anime/
Allow: /watch/
Allow: /catalog
Allow: /genre/
Allow: /year/
Allow: /season
Allow: /studio/
Allow: /collections
Allow: /schedule
Allow: /top
Allow: /franchise/
Allow: /theme/
# System, user and private routes
Disallow: /api/
Disallow: /account
Disallow: /auth/
Disallow: /moderation
Disallow: /watching
Disallow: /my-list
Disallow: /together/
Disallow: /recap
Disallow: /c/*/edit
Disallow: /manga/*/upload
Disallow: /search
Disallow: /admin/
# Video balancers and stream proxy endpoints
Disallow: /api/sibnet/
Disallow: /api/yummy/
Disallow: /api/shiki/
Disallow: /api/mangadex/
Disallow: /embed/
# Yandex-specific parameter cleaning (strips ads, analytics, tracking, session tokens)
Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term /
Clean-param: yclid&gclid&fbclid&openstat&_openstat&from&ref&ya_source /
Clean-param: player_provider&voice&dubbing&quality /watch/
# Yandex crawl rate optimization
Crawl-delay: 0.2

# ------------------------------------------------------------------------------
# 4. Googlebot (Google Search, Google Video)
# ------------------------------------------------------------------------------
User-agent: Googlebot
User-agent: Googlebot-Video
User-agent: Googlebot-Image
Allow: /
Allow: /anime/
Allow: /watch/
Allow: /catalog
Allow: /genre/
Allow: /year/
Allow: /season
Allow: /studio/
Allow: /collections
Allow: /schedule
Allow: /top
Allow: /franchise/
Allow: /theme/
# Disallow internal service endpoints
Disallow: /api/
Disallow: /account
Disallow: /auth/
Disallow: /moderation
Disallow: /watching
Disallow: /my-list
Disallow: /together/
Disallow: /recap
Disallow: /c/*/edit
Disallow: /manga/*/upload
Disallow: /search
Disallow: /admin/
Disallow: /api/sibnet/
Disallow: /api/yummy/
Disallow: /api/shiki/
Disallow: /api/mangadex/
Disallow: /embed/

# ------------------------------------------------------------------------------
# 5. Default rules for all other compliant search engine spiders
# ------------------------------------------------------------------------------
User-agent: *
Allow: /
Allow: /anime/
Allow: /watch/
Allow: /catalog
Allow: /genre/
Allow: /year/
Allow: /season
Allow: /studio/
Allow: /collections
Allow: /schedule
Allow: /top
Allow: /franchise/
Allow: /theme/
Disallow: /api/
Disallow: /account
Disallow: /auth/
Disallow: /moderation
Disallow: /watching
Disallow: /my-list
Disallow: /together/
Disallow: /recap
Disallow: /c/*/edit
Disallow: /manga/*/upload
Disallow: /search
Disallow: /admin/
Disallow: /api/sibnet/
Disallow: /api/yummy/
Disallow: /api/shiki/
Disallow: /api/mangadex/
Disallow: /embed/

# ------------------------------------------------------------------------------
# 6. Global Sitemap Multi-Index Directive & Host
# ------------------------------------------------------------------------------
Host: animelife.top
Sitemap: https://animelife.top/sitemap.xml
`

// --- 2. Dynamic Sitemap Router Simulation ---
class MockEdgeCache {
  constructor() {
    this.store = new Map()
  }
  async match(key) {
    const k = typeof key === 'string' ? key : key.url
    return this.store.get(k) || null
  }
  async put(key, res) {
    const k = typeof key === 'string' ? key : key.url
    this.store.set(k, res)
  }
}

function generateSitemapIndexXml(origin, subSitemaps, lastmodIso) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...subSitemaps.map(
      (path) => `  <sitemap>\n    <loc>${origin}${path}</loc>\n    <lastmod>${lastmodIso}</lastmod>\n  </sitemap>`
    ),
    '</sitemapindex>',
  ].join('\n')
}

function generateUrlsetXml(urls) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority.toFixed(1)}</priority>\n  </url>`
    ),
    '</urlset>',
  ].join('\n')
}

function handleSitemapRequest(request, sitemapContent, lastModifiedDate) {
  const ifModifiedSince = request.headers.get('if-modified-since')
  const lastModHttp = lastModifiedDate.toUTCString()
  const etag = `W/"${Buffer.from(sitemapContent).length.toString(16)}-${lastModifiedDate.getTime().toString(16)}"`

  if (ifModifiedSince) {
    const imsDate = new Date(ifModifiedSince)
    if (!isNaN(imsDate.getTime()) && imsDate >= lastModifiedDate) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Last-Modified': lastModHttp,
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
        },
      })
    }
  }

  return new Response(sitemapContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Last-Modified': lastModHttp,
      'ETag': etag,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// --- 3. Schema.org JSON-LD Generators ---
function createTVSeriesSchema({
  id,
  titleRu,
  titleJa,
  titleRomaji,
  description,
  posterUrl,
  genres,
  year,
  status,
  directorName,
  studioName,
  ratingValue,
  ratingCount,
  reviewCount,
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    '@id': `https://animelife.top/anime/${id}#series`,
    'url': `https://animelife.top/anime/${id}`,
    'name': titleRu,
    'alternateName': [titleRomaji, titleJa].filter(Boolean),
    'headline': `${titleRu} — смотреть онлайн в хорошем качестве`,
    'description': description,
    'image': {
      '@type': 'ImageObject',
      'url': posterUrl,
      'caption': titleRu,
    },
    'genre': genres,
    'datePublished': `${year}-01-01`,
    'inLanguage': 'ja',
    'subtitleLanguage': 'ru',
    'director': directorName
      ? {
          '@type': 'Person',
          'name': directorName,
        }
      : undefined,
    'productionCompany': studioName
      ? {
          '@type': 'Organization',
          'name': studioName,
          'url': `https://animelife.top/studio/${encodeURIComponent(studioName.toLowerCase().replace(/\s+/g, '-'))}`,
        }
      : undefined,
    'aggregateRating': {
      '@type': 'AggregateRating',
      'ratingValue': ratingValue.toFixed(1),
      'bestRating': '10',
      'worstRating': '1',
      'ratingCount': ratingCount,
      'reviewCount': reviewCount || Math.round(ratingCount * 0.12),
    },
    'potentialAction': {
      '@type': 'WatchAction',
      'target': `https://animelife.top/anime/${id}`,
    },
  }
}

function createTVEpisodeSchema({
  seriesId,
  seriesTitle,
  episodeNumber,
  episodeName,
  synopsis,
  thumbnailUrl,
  durationIso,
  datePublished,
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TVEpisode',
    '@id': `https://animelife.top/watch/${seriesId}/${episodeNumber}#episode`,
    'url': `https://animelife.top/watch/${seriesId}/${episodeNumber}`,
    'episodeNumber': episodeNumber,
    'name': episodeName || `${seriesTitle} — ${episodeNumber} серия`,
    'description': synopsis || `Смотреть ${episodeNumber} серию аниме «${seriesTitle}» онлайн в русской озвучке`,
    'image': thumbnailUrl,
    'duration': durationIso, // e.g. 'PT24M15S'
    'datePublished': datePublished,
    'partOfSeries': {
      '@type': 'TVSeries',
      'name': seriesTitle,
      'url': `https://animelife.top/anime/${seriesId}`,
    },
  }
}

function createBreadcrumbListSchema(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': crumbs.map((c, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'name': c.name,
      'item': c.url,
    })),
  }
}

function createVideoObjectSchema({
  title,
  description,
  thumbnailUrl,
  uploadDate,
  durationIso,
  embedUrl,
  contentUrl,
  viewCount,
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    'name': title,
    'description': description,
    'thumbnailUrl': [thumbnailUrl],
    'uploadDate': uploadDate,
    'duration': durationIso,
    'embedUrl': embedUrl,
    'contentUrl': contentUrl,
    'interactionStatistic': {
      '@type': 'InteractionCounter',
      'interactionType': { '@type': 'WatchAction' },
      'userInteractionCount': viewCount,
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'AnimeLife',
      'url': 'https://animelife.top',
      'logo': {
        '@type': 'ImageObject',
        'url': 'https://animelife.top/logo.png',
        'width': 192,
        'height': 192,
      },
    },
  }
}

// --- 4. Dynamic Meta Tags Formula Engine ---
function generateTitlePageMeta({ titleRu, titleRomaji, year, season, status, genres, voices, description }) {
  const isOngoing = status === 'ongoing'
  const genresStr = genres.slice(0, 3).join(', ')
  const voiceStr = voices.slice(0, 3).join(', ')

  let title = ''
  if (isOngoing) {
    title = `${titleRu} (${titleRomaji}) ${season ? `${season} сезон ` : ''}${year} — смотреть онлайн в русской озвучке (${voiceStr}) | AnimeLife`
  } else {
    title = `${titleRu} все серии смотреть онлайн в хорошем качестве 1080p | AnimeLife`
  }

  const cleanDesc = description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const snippetDesc = cleanDesc.slice(0, 110)
  const metaDescription = `Смотреть аниме «${titleRu}» (${year}) онлайн бесплатно в HD 1080p. Жанры: ${genresStr}. Озвучка: ${voiceStr}. ${snippetDesc}...`

  return {
    title,
    description: metaDescription,
    ogTitle: title,
    ogDescription: metaDescription,
    ogType: 'video.tv_series',
    twitterCard: 'summary_large_image',
  }
}

function generateEpisodePageMeta({ titleRu, episodeNumber, voices, animeId }) {
  const voiceStr = voices.slice(0, 3).join(', ')
  const title = `${titleRu} ${episodeNumber} серия смотреть онлайн в русской озвучке (${voiceStr}) в 1080p — AnimeLife`
  const description = `Смотрите онлайн ${episodeNumber} серию аниме «${titleRu}» в русской озвучке (${voiceStr}) и с субтитрами. Бесплатно в высоком разрешении Full HD на AnimeLife.`

  return {
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogType: 'video.episode',
    canonical: `https://animelife.top/watch/${animeId}/${episodeNumber}`,
  }
}

function generateFilterPageMeta({ filterType, value, year }) {
  let title = ''
  let description = ''

  if (filterType === 'genre') {
    title = `Аниме в жанре ${value}${year ? ` ${year}` : ''} — список лучших тайтлов смотреть онлайн | AnimeLife`
    description = `Каталог лучших аниме в жанре «${value}»${year ? ` за ${year} год` : ''}. Рейтинги, отзывы, расписание выхода серий и просмотр онлайн в хорошем качестве без рекламы.`
  } else if (filterType === 'studio') {
    title = `Аниме студии ${value} — список всех тайтлов смотреть онлайн | AnimeLife`
    description = `Все аниме анимационной студии «${value}». Список популярных сериалов и фильмов, фильтрация по рейтингу и годам на AnimeLife.`
  }

  return {
    title,
    description,
  }
}

// --- RUN TESTS ---
describe('Technical SEO Artifacts Verification', () => {
  it('Robots.txt contains all required directives and clean params', () => {
    assert.match(ROBOTS_TXT_CONTENT, /User-agent: Yandex/)
    assert.match(ROBOTS_TXT_CONTENT, /User-agent: Googlebot/)
    assert.match(ROBOTS_TXT_CONTENT, /Clean-param: utm_source/)
    assert.match(ROBOTS_TXT_CONTENT, /Clean-param: yclid/)
    assert.match(ROBOTS_TXT_CONTENT, /Disallow: \/api\/sibnet\//)
    assert.match(ROBOTS_TXT_CONTENT, /Disallow: \/api\/yummy\//)
    assert.match(ROBOTS_TXT_CONTENT, /Disallow: \/embed\//)
    assert.match(ROBOTS_TXT_CONTENT, /User-agent: GPTBot/)
    assert.match(ROBOTS_TXT_CONTENT, /User-agent: AhrefsBot/)
    assert.match(ROBOTS_TXT_CONTENT, /Sitemap: https:\/\/animelife\.top\/sitemap\.xml/)
  })

  it('Dynamic Sitemap Index generation produces valid XML and handles 304 Not Modified', () => {
    const origin = 'https://animelife.top'
    const subSitemaps = [
      '/sitemap-ongoing.xml',
      '/sitemap-titles-1.xml',
      '/sitemap-titles-2.xml',
      '/sitemap-genres.xml',
      '/sitemap-years.xml',
      '/sitemap-seasons.xml',
      '/sitemap-studios.xml',
      '/sitemap-collections.xml',
    ]
    const now = new Date('2026-11-02T06:00:00Z')
    const xml = generateSitemapIndexXml(origin, subSitemaps, now.toISOString().slice(0, 10))

    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
    assert.ok(xml.includes('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
    assert.ok(xml.includes('<loc>https://animelife.top/sitemap-ongoing.xml</loc>'))
    assert.ok(xml.includes('<loc>https://animelife.top/sitemap-titles-1.xml</loc>'))

    // Test fresh request (HTTP 200)
    const freshReq = new Request('https://animelife.top/sitemap.xml')
    const res200 = handleSitemapRequest(freshReq, xml, now)
    assert.equal(res200.status, 200)
    assert.equal(res200.headers.get('Content-Type'), 'application/xml; charset=utf-8')
    assert.ok(res200.headers.get('Last-Modified'))
    assert.ok(res200.headers.get('ETag'))

    // Test conditional request (HTTP 304)
    const conditionalReq = new Request('https://animelife.top/sitemap.xml', {
      headers: { 'If-Modified-Since': now.toUTCString() },
    })
    const res304 = handleSitemapRequest(conditionalReq, xml, now)
    assert.equal(res304.status, 304)
  })

  it('Schema.org TVSeries, TVEpisode, BreadcrumbList, and VideoObject are complete and valid', () => {
    const series = createTVSeriesSchema({
      id: 16498,
      titleRu: 'Атака титанов',
      titleJa: '進撃の巨人',
      titleRomaji: 'Shingeki no Kyojin',
      description: 'Человечество живет в страхе за гигантскими стенами...',
      posterUrl: 'https://animelife.top/covers/16498.webp',
      genres: ['Экшен', 'Драма', 'Фэнтези'],
      year: 2013,
      status: 'released',
      directorName: 'Тэцуро Араки',
      studioName: 'Wit Studio',
      ratingValue: 8.8,
      ratingCount: 35000,
    })

    assert.equal(series['@type'], 'TVSeries')
    assert.equal(series.director.name, 'Тэцуро Араки')
    assert.equal(series.productionCompany.name, 'Wit Studio')
    assert.equal(series.aggregateRating.ratingValue, '8.8')
    assert.deepEqual(series.genre, ['Экшен', 'Драма', 'Фэнтези'])

    const episode = createTVEpisodeSchema({
      seriesId: 16498,
      seriesTitle: 'Атака титанов',
      episodeNumber: 1,
      episodeName: 'К тебе, спустя две тысячи лет',
      synopsis: 'Внезапное нападение Колоссального титана разрушает стену Мария...',
      thumbnailUrl: 'https://animelife.top/episodes/16498/1.webp',
      durationIso: 'PT24M15S',
      datePublished: '2013-04-07',
    })

    assert.equal(episode['@type'], 'TVEpisode')
    assert.equal(episode.episodeNumber, 1)
    assert.equal(episode.duration, 'PT24M15S')
    assert.equal(episode.partOfSeries.name, 'Атака титанов')

    const breadcrumbs = createBreadcrumbListSchema([
      { name: 'Главная', url: 'https://animelife.top/' },
      { name: 'Каталог', url: 'https://animelife.top/catalog' },
      { name: 'Экшен', url: 'https://animelife.top/genre/action' },
      { name: 'Атака титанов', url: 'https://animelife.top/anime/16498-shingeki-no-kyojin' },
      { name: '1 серия', url: 'https://animelife.top/watch/16498/1' },
    ])

    assert.equal(breadcrumbs['@type'], 'BreadcrumbList')
    assert.equal(breadcrumbs.itemListElement.length, 5)
    assert.equal(breadcrumbs.itemListElement[4].position, 5)
    assert.equal(breadcrumbs.itemListElement[4].name, '1 серия')

    const video = createVideoObjectSchema({
      title: 'Атака титанов — 1 серия смотреть онлайн',
      description: 'Смотреть 1 серию Атака титанов онлайн бесплатно в озвучке AniLibria',
      thumbnailUrl: 'https://animelife.top/episodes/16498/1.webp',
      uploadDate: '2026-01-01T12:00:00Z',
      durationIso: 'PT24M15S',
      embedUrl: 'https://animelife.top/embed/16498/1',
      contentUrl: 'https://animelife.top/api/stream/16498/1.m3u8',
      viewCount: 125400,
    })

    assert.equal(video['@type'], 'VideoObject')
    assert.equal(video.duration, 'PT24M15S')
    assert.equal(video.interactionStatistic.userInteractionCount, 125400)
  })

  it('Dynamic Meta Tags Engine accurately formats titles and descriptions', () => {
    const metaOngoing = generateTitlePageMeta({
      titleRu: 'Магическая битва',
      titleRomaji: 'Jujutsu Kaisen',
      year: 2026,
      season: 3,
      status: 'ongoing',
      genres: ['Экшен', 'Сёнэн', 'Мистика'],
      voices: ['AniLibria', 'Dream Cast', 'SHIZA Project'],
      description: 'Юдзи Итадори и маги вступают в смертельную схватку на Игре Отбора.',
    })

    assert.ok(metaOngoing.title.includes('Магическая битва (Jujutsu Kaisen) 3 сезон 2026'))
    assert.ok(metaOngoing.title.includes('AniLibria, Dream Cast, SHIZA Project'))
    assert.ok(metaOngoing.description.includes('Смотреть аниме «Магическая битва» (2026)'))

    const metaEp = generateEpisodePageMeta({
      titleRu: 'Клинок рассекающий демонов',
      episodeNumber: 8,
      voices: ['AniLibria', 'AnimeVost'],
      animeId: 38000,
    })

    assert.equal(
      metaEp.title,
      'Клинок рассекающий демонов 8 серия смотреть онлайн в русской озвучке (AniLibria, AnimeVost) в 1080p — AnimeLife'
    )
    assert.equal(metaEp.canonical, 'https://animelife.top/watch/38000/8')

    const metaGenre = generateFilterPageMeta({ filterType: 'genre', value: 'Сёнэн', year: 2026 })
    assert.equal(metaGenre.title, 'Аниме в жанре Сёнэн 2026 — список лучших тайтлов смотреть онлайн | AnimeLife')
  })
})
