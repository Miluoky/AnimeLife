/**
 * AnimeLife Production-Grade Structured Data & Dynamic Metadata Engine
 *
 * Implements Google Rich Results-compliant JSON-LD generation (Movie, TVSeries,
 * TVEpisode, BreadcrumbList, VideoObject), dynamic meta-tag formulas, OpenGraph/Twitter Card
 * generation, and strict word-boundary-aware truncation.
 *
 * Designed for both Edge SSR (Cloudflare Workers) and Client SPA (React/Preact).
 */

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

export const DEFAULT_SITE_NAME = 'AnimeLife'
export const DEFAULT_ORIGIN = 'https://animelife.top'
export const DEFAULT_OG_IMAGE = 'https://animelife.top/og-image.png'
export const MAX_TITLE_LENGTH = 70
export const MAX_DESCRIPTION_LENGTH = 160
export const MAX_OG_DESCRIPTION_LENGTH = 200

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AnimeKind = 'tv' | 'movie' | 'ova' | 'ona' | 'special' | 'music'
export type AnimeStatus = 'anons' | 'ongoing' | 'released'
export type AgeRating = '0+' | '6+' | '12+' | '16+' | '18+'

export interface PersonRef {
  id?: string | number
  name: string
  originalName?: string
  role?: string
  url?: string
}

export interface StudioRef {
  id?: string | number
  name: string
  url?: string
}

export interface SeasonInfo {
  seasonNumber: number
  name?: string
  numberOfEpisodes?: number
  startDate?: string
  endDate?: string
}

export interface AggregateRatingData {
  ratingValue: number | string
  bestRating?: number | string
  worstRating?: number | string
  ratingCount: number | string
  reviewCount?: number | string
}

export interface ImageThumbnails {
  ratio16x9: string
  ratio4x3: string
  ratio1x1: string
}

export interface VideoMetadata {
  name: string
  description: string
  thumbnailUrl: string | string[] | ImageThumbnails
  uploadDate: string
  durationMinutes?: number
  durationSeconds?: number
  durationIso?: string
  embedUrl?: string
  contentUrl?: string
  isFamilyFriendly?: boolean
  viewCount?: number
  potentialActionUrl?: string
}

export interface AnimeItem {
  id: string | number
  slug?: string
  title: string
  originalTitle?: string
  japaneseTitle?: string
  synonyms?: string[]
  kind: AnimeKind
  status: AnimeStatus
  year?: number | string
  airedOn?: string
  releasedOn?: string
  episodesTotal?: number
  episodesAired?: number
  durationMinutes?: number
  studio?: StudioRef | string
  genres: string[]
  description?: string
  posterUrl?: string
  rating?: AggregateRatingData
  ageRating?: AgeRating
  director?: PersonRef | PersonRef[]
  cast?: PersonRef[]
  seasons?: SeasonInfo[]
}

export interface MovieItem extends AnimeItem {
  kind: 'movie'
  durationMinutes: number
}

export interface EpisodeItem {
  episodeNumber: number
  title?: string
  synopsis?: string
  airDate?: string
  durationMinutes?: number
  thumbnailUrl?: string | ImageThumbnails
  video?: VideoMetadata
}

export interface BreadcrumbItem {
  position?: number
  name: string
  url: string
}

export type PageRouteType =
  | 'title'
  | 'episode'
  | 'genre'
  | 'year'
  | 'season'
  | 'chronology'
  | 'trope'
  | 'catalog'
  | 'home'

export interface TitleGenOptions {
  routeType: PageRouteType
  anime?: AnimeItem
  episode?: number | EpisodeItem
  filterValue?: string
  page?: number
  siteName?: string
  customContext?: string
}

export interface DescriptionGenOptions {
  routeType: PageRouteType
  anime?: AnimeItem
  episode?: number | EpisodeItem
  filterValue?: string
  page?: number
  siteName?: string
  customContext?: string
}

export interface OpenGraphOptions {
  title: string
  description: string
  url: string
  imageUrl?: string
  type?: 'website' | 'video.movie' | 'video.tv_show' | 'video.episode' | 'article'
  siteName?: string
  locale?: string
}

export interface TwitterCardOptions {
  title: string
  description: string
  imageUrl?: string
  cardType?: 'summary' | 'summary_large_image' | 'player'
}

export interface OpenGraphMetadata {
  'og:title': string
  'og:description': string
  'og:url': string
  'og:image': string
  'og:type': string
  'og:site_name': string
  'og:locale': string
}

export interface TwitterCardMetadata {
  'twitter:card': string
  'twitter:title': string
  'twitter:description': string
  'twitter:image': string
}

export interface PageMetadata {
  title: string
  description: string
  canonicalUrl: string
  openGraph: OpenGraphMetadata
  twitter: TwitterCardMetadata
  jsonLd: Record<string, any>
}

// Schema.org Structured Data Types

export interface SchemaPerson {
  '@type': 'Person'
  name: string
  jobTitle?: string
  url?: string
}

export interface SchemaOrganization {
  '@type': 'Organization'
  name: string
  url?: string
}

export interface SchemaCountry {
  '@type': 'Country'
  name: string
  alternateName?: string
}

export interface SchemaAggregateRating {
  '@type': 'AggregateRating'
  ratingValue: string | number
  bestRating: string | number
  worstRating: string | number
  ratingCount: string | number
  reviewCount?: string | number
}

export interface SchemaWatchAction {
  '@type': 'WatchAction'
  target:
    | string
    | {
        '@type': 'EntryPoint'
        urlTemplate: string
        inLanguage?: string
        actionPlatform?: string[]
      }
}

export interface VideoObjectSchema {
  '@context': 'https://schema.org'
  '@type': 'VideoObject'
  '@id'?: string
  name: string
  description: string
  thumbnailUrl: string[]
  uploadDate: string
  duration?: string
  embedUrl?: string
  contentUrl?: string
  inLanguage?: string
  isFamilyFriendly?: boolean
  interactionStatistic?: {
    '@type': 'InteractionCounter'
    interactionType: { '@type': 'WatchAction' }
    userInteractionCount: number
  }
  potentialAction?: SchemaWatchAction
}

export interface MovieSchema {
  '@context': 'https://schema.org'
  '@type': 'Movie'
  '@id'?: string
  name: string
  alternateName?: string[]
  url: string
  image: string[]
  description: string
  datePublished?: string
  duration?: string
  inLanguage: string | string[]
  contentRating?: string
  genre?: string[]
  countryOfOrigin?: SchemaCountry
  productionCompany?: SchemaOrganization
  director?: SchemaPerson[]
  actor?: SchemaPerson[]
  aggregateRating?: SchemaAggregateRating
  potentialAction?: SchemaWatchAction
}

export interface TVSeasonSchema {
  '@type': 'TVSeason'
  seasonNumber: number
  name?: string
  numberOfEpisodes?: number
  startDate?: string
  endDate?: string
}

export interface TVSeriesSchema {
  '@context': 'https://schema.org'
  '@type': 'TVSeries'
  '@id'?: string
  name: string
  alternateName?: string[]
  url: string
  image: string[]
  description: string
  startDate?: string
  endDate?: string
  numberOfEpisodes?: number
  numberOfSeasons?: number
  inLanguage: string | string[]
  contentRating?: string
  genre?: string[]
  countryOfOrigin?: SchemaCountry
  productionCompany?: SchemaOrganization
  director?: SchemaPerson[]
  actor?: SchemaPerson[]
  containsSeason?: TVSeasonSchema[]
  aggregateRating?: SchemaAggregateRating
  potentialAction?: SchemaWatchAction
}

export interface TVEpisodeSchema {
  '@context': 'https://schema.org'
  '@type': 'TVEpisode'
  '@id'?: string
  episodeNumber: number
  name: string
  url: string
  description: string
  duration?: string
  datePublished?: string
  image?: string
  inLanguage?: string
  partOfSeries: {
    '@type': 'TVSeries'
    name: string
    url: string
    numberOfEpisodes?: number
  }
  partOfSeason?: {
    '@type': 'TVSeason'
    seasonNumber: number
    name?: string
  }
  video?: VideoObjectSchema
  potentialAction?: SchemaWatchAction
}

export interface BreadcrumbListItemSchema {
  '@type': 'ListItem'
  position: number
  name: string
  item: string
}

export interface BreadcrumbListSchema {
  '@context': 'https://schema.org'
  '@type': 'BreadcrumbList'
  itemListElement: BreadcrumbListItemSchema[]
}

// ============================================================================
// TEXT SANITIZATION & TRUNCATION ALGORITHMS
// ============================================================================

/**
 * Escapes characters with special meaning in HTML attribute values and text nodes.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Cleans text from wiki/markdown tags, BB-codes, multiple spaces, and newlines.
 */
export function cleanRawText(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    // Remove Shikimori wiki-links [[target|Text]] -> Text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    // Remove BBCode / Shikimori tags [character=123], [b], [/b], etc.
    .replace(/\[[^\]]*\]/g, '')
    // Normalize newlines and consecutive whitespace to a single space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Truncates a string to maxChars preserving complete words without breaking words.
 * Strips dangling punctuation before appending an ellipsis.
 */
export function truncateText(
  text: string | null | undefined,
  maxChars = MAX_DESCRIPTION_LENGTH,
  addEllipsis = true
): string {
  const cleaned = cleanRawText(text)
  if (!cleaned || cleaned.length <= maxChars) {
    return cleaned
  }

  const ellipsis = addEllipsis ? '…' : ''
  const budget = addEllipsis ? Math.max(1, maxChars - 1) : maxChars
  const head = cleaned.slice(0, budget)

  // Look for the last space within acceptable boundary threshold (at least 60% of budget)
  const lastSpace = head.lastIndexOf(' ')
  const minThreshold = Math.floor(budget * 0.6)

  let cutPoint = head
  if (lastSpace >= minThreshold) {
    cutPoint = head.slice(0, lastSpace)
  }

  // Remove trailing commas, periods, hyphens, semicolons, colons
  const trimmed = cutPoint.replace(/[\s,.;:—–-]+$/, '')
  return `${trimmed}${ellipsis}`
}

/**
 * Chooses the first title variant from an array that fits within the maximum length budget.
 * Falls back to the shortest or last variant safely truncated.
 */
export function fitTitleVariant(variants: string[], maxLength = MAX_TITLE_LENGTH): string {
  for (const variant of variants) {
    if (variant.length <= maxLength) {
      return variant
    }
  }
  const fallback = variants[variants.length - 1] || ''
  return truncateText(fallback, maxLength, false)
}

/**
 * Converts minutes or seconds into an ISO 8601 duration string (e.g., PT1H45M or PT24M).
 */
export function formatIsoDuration(
  value: number,
  unit: 'minutes' | 'seconds' = 'minutes'
): string {
  if (!value || value <= 0) return 'PT0M'
  const totalSeconds = unit === 'minutes' ? Math.round(value * 60) : Math.round(value)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  let iso = 'PT'
  if (hours > 0) iso += `${hours}H`
  if (minutes > 0 || (hours === 0 && seconds === 0)) iso += `${minutes}M`
  if (seconds > 0) iso += `${seconds}S`
  return iso
}

// ============================================================================
// DYNAMIC METADATA FORMULA GENERATORS
// ============================================================================

/**
 * Generates an SEO title tag strictly bounded within standard SERP length limits.
 */
export function generateTitle(options: TitleGenOptions): string {
  const site = options.siteName || DEFAULT_SITE_NAME
  const pageSuffix = options.page && options.page > 1 ? ` — Страница ${options.page}` : ''

  switch (options.routeType) {
    case 'title': {
      const a = options.anime
      if (!a) return `${site} — Онлайн просмотр аниме`
      const isMovie = a.kind === 'movie'
      const year = a.year ? ` (${a.year})` : ''
      const alt = a.originalTitle && a.originalTitle !== a.title ? ` (${a.originalTitle}${a.year ? `, ${a.year}` : ''})` : year

      if (a.status === 'anons') {
        const variants = [
          `${a.title}${alt} — дата выхода и трейлер | ${site}`,
          `${a.title}${year} — дата выхода и трейлер | ${site}`,
          `${a.title} — дата выхода и описание | ${site}`,
          `${a.title} | ${site}`,
        ]
        return fitTitleVariant(variants)
      }

      const fullTerm = isMovie ? 'смотреть аниме-фильм онлайн бесплатно' : 'смотреть аниме онлайн бесплатно все серии'
      const mediumTerm = isMovie ? 'смотреть онлайн бесплатно' : 'смотреть онлайн все серии'
      const shortTerm = 'смотреть онлайн'

      const variants = [
        `${a.title}${alt} — ${fullTerm} | ${site}`,
        `${a.title}${year} — ${fullTerm} | ${site}`,
        `${a.title} — ${fullTerm} | ${site}`,
        `${a.title}${year} — ${mediumTerm} | ${site}`,
        `${a.title} — ${mediumTerm} | ${site}`,
        `${a.title} — ${shortTerm} | ${site}`,
        `${a.title} | ${site}`,
      ]
      return fitTitleVariant(variants)
    }

    case 'episode': {
      const a = options.anime
      const epNum = typeof options.episode === 'number' ? options.episode : options.episode?.episodeNumber || 1
      if (!a) return `Серия ${epNum} — смотреть онлайн | ${site}`

      if (a.kind === 'movie') {
        const variants = [
          `${a.title} — смотреть аниме-фильм онлайн бесплатно | ${site}`,
          `${a.title} — смотреть онлайн в хорошем качестве | ${site}`,
          `${a.title} — смотреть фильм онлайн | ${site}`,
        ]
        return fitTitleVariant(variants)
      }

      const variants = [
        `${a.title} ${epNum} серия — смотреть онлайн в русской озвучке | ${site}`,
        `${a.title} ${epNum} серия — смотреть онлайн бесплатно | ${site}`,
        `${a.title} ${epNum} серия — смотреть онлайн | ${site}`,
        `${a.title} ${epNum} серия | ${site}`,
      ]
      return fitTitleVariant(variants)
    }

    case 'genre': {
      const genre = options.filterValue || 'Каталог'
      const variants = [
        `Аниме в жанре ${genre} — смотреть онлайн бесплатно${pageSuffix} | ${site}`,
        `Лучшие аниме в жанре ${genre}${pageSuffix} | ${site}`,
        `Аниме жанра ${genre}${pageSuffix} | ${site}`,
      ]
      return fitTitleVariant(variants)
    }

    case 'year': {
      const year = options.filterValue || 'Все'
      const variants = [
        `Аниме ${year} года — список лучших новинок${pageSuffix} | ${site}`,
        `Смотреть аниме ${year} года онлайн${pageSuffix} | ${site}`,
        `Аниме ${year} года${pageSuffix} | ${site}`,
      ]
      return fitTitleVariant(variants)
    }

    case 'season': {
      const season = options.filterValue || 'Сезон'
      const variants = [
        `Аниме сезона ${season} — расписание и онгоинги${pageSuffix} | ${site}`,
        `Смотреть аниме сезона ${season} онлайн${pageSuffix} | ${site}`,
        `Аниме сезона ${season}${pageSuffix} | ${site}`,
      ]
      return fitTitleVariant(variants)
    }

    case 'chronology': {
      const name = options.filterValue || options.anime?.title || 'Франшиза'
      const variants = [
        `Хронология «${name}» — порядок просмотра сезонов и фильмов | ${site}`,
        `В каком порядке смотреть «${name}» — хронология | ${site}`,
        `Хронология аниме «${name}» | ${site}`,
      ]
      return fitTitleVariant(variants)
    }

    case 'trope': {
      const trope = options.filterValue || 'Тематика'
      const variants = [
        `Аниме с тропом «${trope}» — подборка лучших тайтлов${pageSuffix} | ${site}`,
        `Смотреть аниме с тропом «${trope}» онлайн${pageSuffix} | ${site}`,
        `Аниме с тропом «${trope}»${pageSuffix} | ${site}`,
      ]
      return fitTitleVariant(variants)
    }

    case 'catalog':
    default: {
      const variants = [
        `Каталог аниме — смотреть онлайн с русской озвучкой${pageSuffix} | ${site}`,
        `Смотреть аниме онлайн — каталог тайтлов${pageSuffix} | ${site}`,
        `Каталог аниме${pageSuffix} | ${site}`,
      ]
      return fitTitleVariant(variants)
    }
  }
}

/**
 * Generates an SEO meta description tag strictly bounded within 150-160 characters.
 */
export function generateDescription(options: DescriptionGenOptions): string {
  const site = options.siteName || DEFAULT_SITE_NAME
  const pageSuffix = options.page && options.page > 1 ? ` Страница ${options.page}.` : ''

  switch (options.routeType) {
    case 'title': {
      const a = options.anime
      if (!a) return `Смотрите аниме онлайн бесплатно в отличном качестве с русской озвучкой на ${site}.`
      const facts = [
        a.kind === 'movie' ? 'фильм' : a.kind === 'tv' ? 'ТВ-сериал' : a.kind.toUpperCase(),
        a.year ? `${a.year}` : '',
        a.kind !== 'movie' && a.episodesTotal ? `${a.episodesTotal} сер.` : '',
        typeof a.studio === 'object' ? a.studio?.name : a.studio,
      ].filter(Boolean)

      const factStr = facts.length ? ` (${facts.join(', ')})` : ''
      const genres = a.genres?.length ? ` Жанры: ${a.genres.slice(0, 3).join(', ').toLowerCase()}.` : ''
      const synopsis = cleanRawText(a.description) || 'Смотрите онлайн в хорошем качестве с русской озвучкой.'
      const rawDesc = `«${a.title}»${factStr}.${genres} ${synopsis} Смотрите бесплатно на ${site}.`
      return truncateText(rawDesc, MAX_DESCRIPTION_LENGTH)
    }

    case 'episode': {
      const a = options.anime
      const epNum = typeof options.episode === 'number' ? options.episode : options.episode?.episodeNumber || 1
      if (!a) return `Смотрите ${epNum} серию аниме онлайн бесплатно в отличном качестве на ${site}.`

      const totalPart = a.episodesTotal && a.episodesTotal > 1 ? ` из ${a.episodesTotal}` : ''
      const yearPart = a.year ? ` (${a.year})` : ''
      const synopsis = cleanRawText(a.description) || ''

      const lead = a.kind === 'movie'
        ? `Смотрите аниме-фильм «${a.title}»${yearPart} онлайн бесплатно в русской озвучке на ${site}.`
        : `Смотрите ${epNum} серию${totalPart} аниме «${a.title}»${yearPart} онлайн бесплатно в HD качестве.`

      const combined = `${lead} ${synopsis}`
      return truncateText(combined, MAX_DESCRIPTION_LENGTH)
    }

    case 'genre': {
      const genre = options.filterValue || 'аниме'
      const raw = `Лучшие аниме в жанре «${genre}»: большой каталог новинок и шедевров с русской озвучкой.${pageSuffix} Смотрите онлайн бесплатно в хорошем качестве на ${site}.`
      return truncateText(raw, MAX_DESCRIPTION_LENGTH)
    }

    case 'year': {
      const year = options.filterValue || 'текущего'
      const raw = `Смотреть аниме ${year} года онлайн бесплатно с русской озвучкой.${pageSuffix} Список лучших премьер, сезонов и фильмов в отличном качестве на ${site}.`
      return truncateText(raw, MAX_DESCRIPTION_LENGTH)
    }

    case 'season': {
      const season = options.filterValue || 'сезона'
      const raw = `Новинки и онгоинги аниме ${season}: график выхода новых серий, русская озвучка и дубляж.${pageSuffix} Смотрите онлайн бесплатно на ${site}.`
      return truncateText(raw, MAX_DESCRIPTION_LENGTH)
    }

    case 'chronology': {
      const name = options.filterValue || options.anime?.title || 'аниме'
      const raw = `В каком порядке смотреть аниме «${name}»? Полная хронология выхода всех сезонов, фильмов, OVA и спецвыпусков со ссылками на серии на ${site}.`
      return truncateText(raw, MAX_DESCRIPTION_LENGTH)
    }

    case 'trope': {
      const trope = options.filterValue || 'тропом'
      const raw = `Подборка аниме с тропом «${trope}»: самые яркие и популярные сюжетные линии, похожие тайтлы и персонажи.${pageSuffix} Смотрите на ${site}.`
      return truncateText(raw, MAX_DESCRIPTION_LENGTH)
    }

    case 'catalog':
    default: {
      const raw = `Каталог аниме онлайн бесплатно с русской озвучкой: фильтры по жанрам, годам и студиям.${pageSuffix} Смотрите популярные онгоинги и завершенные сериалы на ${site}.`
      return truncateText(raw, MAX_DESCRIPTION_LENGTH)
    }
  }
}

/**
 * Generates OpenGraph metadata.
 */
export function generateOpenGraph(options: OpenGraphOptions): OpenGraphMetadata {
  return {
    'og:title': truncateText(options.title, 80, false),
    'og:description': truncateText(options.description, MAX_OG_DESCRIPTION_LENGTH, true),
    'og:url': options.url,
    'og:image': options.imageUrl || DEFAULT_OG_IMAGE,
    'og:type': options.type || 'website',
    'og:site_name': options.siteName || DEFAULT_SITE_NAME,
    'og:locale': options.locale || 'ru_RU',
  }
}

/**
 * Generates Twitter Card metadata.
 */
export function generateTwitterCard(options: TwitterCardOptions): TwitterCardMetadata {
  return {
    'twitter:card': options.cardType || 'summary_large_image',
    'twitter:title': truncateText(options.title, 70, false),
    'twitter:description': truncateText(options.description, MAX_DESCRIPTION_LENGTH, true),
    'twitter:image': options.imageUrl || DEFAULT_OG_IMAGE,
  }
}

// ============================================================================
// SCHEMA.ORG JSON-LD BUILDERS
// ============================================================================

/**
 * Normalizes image input into responsive Google-compliant aspect ratio thumbnails (16:9, 4:3, 1:1).
 */
export function resolveThumbnailUrls(
  input: string | string[] | ImageThumbnails | undefined,
  fallbackBaseUrl = DEFAULT_ORIGIN
): string[] {
  if (!input) {
    return [
      `${fallbackBaseUrl}/images/default_16x9.webp`,
      `${fallbackBaseUrl}/images/default_4x3.webp`,
      `${fallbackBaseUrl}/images/default_1x1.webp`,
    ]
  }

  if (typeof input === 'string') {
    return [input]
  }

  if (Array.isArray(input)) {
    return input.length ? input : [`${fallbackBaseUrl}/images/default_16x9.webp`]
  }

  return [input.ratio16x9, input.ratio4x3, input.ratio1x1].filter(Boolean)
}

/**
 * Generates canonical anime URL path.
 */
export function formatAnimeUrl(id: string | number, slug?: string, origin = DEFAULT_ORIGIN): string {
  const cleanSlug = (slug || 'watch')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${origin}/anime/${id}-${cleanSlug}`
}

/**
 * Generates canonical episode watch URL path.
 */
export function formatEpisodeUrl(id: string | number, episode: number, origin = DEFAULT_ORIGIN): string {
  return `${origin}/watch/${id}/${episode}`
}

/**
 * Builds a Google Rich Result-compliant `Movie` JSON-LD schema.
 */
export function buildJsonLdMovie(
  movie: MovieItem,
  _videoMeta?: VideoMetadata,
  baseUrl = DEFAULT_ORIGIN
): MovieSchema {
  const canonicalUrl = formatAnimeUrl(movie.id, movie.slug, baseUrl)
  const alternateNames = [
    movie.originalTitle,
    movie.japaneseTitle,
    ...(movie.synonyms || []),
  ].filter((name): name is string => Boolean(name && name !== movie.title))

  const directors: SchemaPerson[] = movie.director
    ? (Array.isArray(movie.director) ? movie.director : [movie.director]).map((d) => ({
        '@type': 'Person',
        name: d.name,
        url: d.url || (d.id ? `${baseUrl}/person/${d.id}` : undefined),
      }))
    : []

  const actors: SchemaPerson[] = (movie.cast || []).map((c) => ({
    '@type': 'Person',
    name: c.name,
    jobTitle: c.role || 'Сэйю',
    url: c.url || (c.id ? `${baseUrl}/person/${c.id}` : undefined),
  }))

  const studioName = typeof movie.studio === 'object' ? movie.studio?.name : movie.studio
  const studioObj: SchemaOrganization | undefined = studioName
    ? {
        '@type': 'Organization',
        name: studioName,
        url: typeof movie.studio === 'object' && movie.studio?.url ? movie.studio.url : undefined,
      }
    : undefined

  const ratingObj: SchemaAggregateRating | undefined = movie.rating
    ? {
        '@type': 'AggregateRating',
        ratingValue: movie.rating.ratingValue,
        bestRating: movie.rating.bestRating || 10,
        worstRating: movie.rating.worstRating || 1,
        ratingCount: movie.rating.ratingCount,
        reviewCount: movie.rating.reviewCount,
      }
    : undefined

  const schema: MovieSchema = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    '@id': `${canonicalUrl}#movie`,
    name: movie.title,
    alternateName: alternateNames.length ? alternateNames : undefined,
    url: canonicalUrl,
    image: resolveThumbnailUrls(movie.posterUrl, baseUrl),
    description: truncateText(movie.description, 400, false),
    datePublished: movie.airedOn,
    duration: movie.durationMinutes ? formatIsoDuration(movie.durationMinutes, 'minutes') : undefined,
    inLanguage: ['ja', 'ru'],
    contentRating: movie.ageRating,
    genre: movie.genres.length ? movie.genres : undefined,
    countryOfOrigin: {
      '@type': 'Country',
      name: 'Япония',
      alternateName: 'Japan',
    },
    productionCompany: studioObj,
    director: directors.length ? directors : undefined,
    actor: actors.length ? actors : undefined,
    aggregateRating: ratingObj,
    potentialAction: {
      '@type': 'WatchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: formatEpisodeUrl(movie.id, 1, baseUrl),
        inLanguage: 'ru',
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
          'http://schema.org/AndroidPlatform',
          'http://schema.org/IOSPlatform',
        ],
      },
    },
  }

  return schema
}

/**
 * Builds a Google Rich Result-compliant `TVSeries` JSON-LD schema.
 */
export function buildJsonLdSeries(
  anime: AnimeItem,
  baseUrl = DEFAULT_ORIGIN
): TVSeriesSchema {
  const canonicalUrl = formatAnimeUrl(anime.id, anime.slug, baseUrl)
  const alternateNames = [
    anime.originalTitle,
    anime.japaneseTitle,
    ...(anime.synonyms || []),
  ].filter((name): name is string => Boolean(name && name !== anime.title))

  const directors: SchemaPerson[] = anime.director
    ? (Array.isArray(anime.director) ? anime.director : [anime.director]).map((d) => ({
        '@type': 'Person',
        name: d.name,
        url: d.url || (d.id ? `${baseUrl}/person/${d.id}` : undefined),
      }))
    : []

  const actors: SchemaPerson[] = (anime.cast || []).map((c) => ({
    '@type': 'Person',
    name: c.name,
    jobTitle: c.role || 'Сэйю',
    url: c.url || (c.id ? `${baseUrl}/person/${c.id}` : undefined),
  }))

  const studioName = typeof anime.studio === 'object' ? anime.studio?.name : anime.studio
  const studioObj: SchemaOrganization | undefined = studioName
    ? {
        '@type': 'Organization',
        name: studioName,
        url: typeof anime.studio === 'object' && anime.studio?.url ? anime.studio.url : undefined,
      }
    : undefined

  const seasonsList: TVSeasonSchema[] = (anime.seasons || [
    {
      seasonNumber: 1,
      name: '1 сезон',
      numberOfEpisodes: anime.episodesTotal,
      startDate: anime.airedOn,
      endDate: anime.releasedOn,
    },
  ]).map((s) => ({
    '@type': 'TVSeason',
    seasonNumber: s.seasonNumber,
    name: s.name || `${s.seasonNumber} сезон`,
    numberOfEpisodes: s.numberOfEpisodes,
    startDate: s.startDate,
    endDate: s.endDate,
  }))

  const ratingObj: SchemaAggregateRating | undefined = anime.rating
    ? {
        '@type': 'AggregateRating',
        ratingValue: anime.rating.ratingValue,
        bestRating: anime.rating.bestRating || 10,
        worstRating: anime.rating.worstRating || 1,
        ratingCount: anime.rating.ratingCount,
        reviewCount: anime.rating.reviewCount,
      }
    : undefined

  const schema: TVSeriesSchema = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    '@id': `${canonicalUrl}#series`,
    name: anime.title,
    alternateName: alternateNames.length ? alternateNames : undefined,
    url: canonicalUrl,
    image: resolveThumbnailUrls(anime.posterUrl, baseUrl),
    description: truncateText(anime.description, 400, false),
    startDate: anime.airedOn,
    endDate: anime.status === 'released' ? anime.releasedOn : undefined,
    numberOfEpisodes: anime.episodesTotal || anime.episodesAired,
    numberOfSeasons: seasonsList.length,
    inLanguage: ['ja', 'ru'],
    contentRating: anime.ageRating,
    genre: anime.genres.length ? anime.genres : undefined,
    countryOfOrigin: {
      '@type': 'Country',
      name: 'Япония',
      alternateName: 'Japan',
    },
    productionCompany: studioObj,
    director: directors.length ? directors : undefined,
    actor: actors.length ? actors : undefined,
    containsSeason: seasonsList,
    aggregateRating: ratingObj,
    potentialAction: {
      '@type': 'WatchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: formatEpisodeUrl(anime.id, 1, baseUrl),
        inLanguage: 'ru',
      },
    },
  }

  return schema
}

/**
 * Builds a Google Rich Result-compliant `VideoObject` JSON-LD schema.
 */
export function buildJsonLdVideoObject(
  video: VideoMetadata,
  baseUrl = DEFAULT_ORIGIN
): VideoObjectSchema {
  const durationStr = video.durationIso || (video.durationMinutes ? formatIsoDuration(video.durationMinutes, 'minutes') : undefined)
  const canonicalUrl = video.contentUrl || baseUrl

  const schema: VideoObjectSchema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    '@id': `${canonicalUrl}#video`,
    name: video.name,
    description: truncateText(video.description, 300, false),
    thumbnailUrl: resolveThumbnailUrls(video.thumbnailUrl, baseUrl),
    uploadDate: video.uploadDate,
    duration: durationStr,
    embedUrl: video.embedUrl,
    contentUrl: video.contentUrl,
    inLanguage: 'ru',
    isFamilyFriendly: video.isFamilyFriendly !== false,
  }

  if (video.viewCount && video.viewCount > 0) {
    schema.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'WatchAction' },
      userInteractionCount: video.viewCount,
    }
  }

  if (video.potentialActionUrl || canonicalUrl) {
    schema.potentialAction = {
      '@type': 'WatchAction',
      target: video.potentialActionUrl || canonicalUrl,
    }
  }

  return schema
}

/**
 * Builds a Google Rich Result-compliant `TVEpisode` JSON-LD schema with nested VideoObject.
 */
export function buildJsonLdEpisode(
  anime: AnimeItem,
  episode: EpisodeItem,
  videoMeta?: VideoMetadata,
  baseUrl = DEFAULT_ORIGIN
): TVEpisodeSchema {
  const epNum = episode.episodeNumber
  const seriesCanonicalUrl = formatAnimeUrl(anime.id, anime.slug, baseUrl)
  const episodeCanonicalUrl = formatEpisodeUrl(anime.id, epNum, baseUrl)

  const episodeName = episode.title
    ? `${anime.title}: ${epNum} серия — ${episode.title}`
    : `${anime.title}: ${epNum} серия`

  const durationStr = episode.durationMinutes
    ? formatIsoDuration(episode.durationMinutes, 'minutes')
    : anime.durationMinutes
    ? formatIsoDuration(anime.durationMinutes, 'minutes')
    : undefined

  const resolvedVideo = videoMeta || episode.video || {
    name: `${episodeName} — смотреть онлайн`,
    description: `Смотреть ${epNum} серию аниме «${anime.title}» в HD качестве с русской озвучкой бесплатно.`,
    thumbnailUrl: (episode.thumbnailUrl || anime.posterUrl || DEFAULT_OG_IMAGE) as string | string[] | ImageThumbnails,
    uploadDate: episode.airDate || anime.airedOn || new Date().toISOString().slice(0, 10),
    durationIso: durationStr,
    contentUrl: episodeCanonicalUrl,
    embedUrl: `${baseUrl}/embed/${anime.id}/${epNum}`,
    isFamilyFriendly: anime.ageRating !== '18+',
  }

  const schema: TVEpisodeSchema = {
    '@context': 'https://schema.org',
    '@type': 'TVEpisode',
    '@id': `${episodeCanonicalUrl}#episode`,
    episodeNumber: epNum,
    name: episodeName,
    url: episodeCanonicalUrl,
    description: truncateText(
      episode.synopsis || `Смотрите ${epNum} серию аниме «${anime.title}» онлайн бесплатно в хорошем качестве на AnimeLife.`,
      300,
      false
    ),
    duration: durationStr,
    datePublished: episode.airDate || anime.airedOn,
    image: Array.isArray(episode.thumbnailUrl)
      ? episode.thumbnailUrl[0]
      : typeof episode.thumbnailUrl === 'object'
      ? episode.thumbnailUrl?.ratio16x9
      : episode.thumbnailUrl || anime.posterUrl,
    inLanguage: 'ru',
    partOfSeries: {
      '@type': 'TVSeries',
      name: anime.title,
      url: seriesCanonicalUrl,
      numberOfEpisodes: anime.episodesTotal,
    },
    partOfSeason: {
      '@type': 'TVSeason',
      seasonNumber: 1,
      name: '1 сезон',
    },
    video: buildJsonLdVideoObject(resolvedVideo, baseUrl),
    potentialAction: {
      '@type': 'WatchAction',
      target: episodeCanonicalUrl,
    },
  }

  return schema
}

/**
 * Builds a Google Rich Result-compliant `BreadcrumbList` schema.
 */
export function buildJsonLdBreadcrumbs(
  crumbs: BreadcrumbItem[],
  baseUrl = DEFAULT_ORIGIN
): BreadcrumbListSchema {
  const items: BreadcrumbListItemSchema[] = crumbs.map((c, index) => {
    const rawUrl = c.url.startsWith('http') ? c.url : `${baseUrl}${c.url.startsWith('/') ? '' : '/'}${c.url}`
    return {
      '@type': 'ListItem',
      position: c.position || index + 1,
      name: c.name,
      item: rawUrl,
    }
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  }
}

/**
 * Safely serializes JSON-LD avoiding script breakout (`</script>`).
 */
export function serializeJsonLd(schema: Record<string, any> | Array<Record<string, any>>): string {
  return JSON.stringify(schema, null, 2).replace(/</g, '\\u003c')
}

// ============================================================================
// COMPREHENSIVE PAGE METADATA SYNTHESIS
// ============================================================================

export interface PageMetaOptions {
  routeType: PageRouteType
  anime?: AnimeItem
  episode?: number | EpisodeItem
  filterValue?: string
  page?: number
  currentPath: string
  breadcrumbs?: BreadcrumbItem[]
  baseUrl?: string
}

/**
 * End-to-end synthesizer generating all head metadata and JSON-LD for any page route.
 */
export function generatePageMetadata(options: PageMetaOptions): PageMetadata {
  const baseUrl = options.baseUrl || DEFAULT_ORIGIN
  const canonicalUrl = options.currentPath.startsWith('http')
    ? options.currentPath
    : `${baseUrl}${options.currentPath.startsWith('/') ? '' : '/'}${options.currentPath}`

  const title = generateTitle({
    routeType: options.routeType,
    anime: options.anime,
    episode: options.episode,
    filterValue: options.filterValue,
    page: options.page,
  })

  const description = generateDescription({
    routeType: options.routeType,
    anime: options.anime,
    episode: options.episode,
    filterValue: options.filterValue,
    page: options.page,
  })

  let ogType: 'website' | 'video.movie' | 'video.tv_show' | 'video.episode' = 'website'
  if (options.routeType === 'title') {
    ogType = options.anime?.kind === 'movie' ? 'video.movie' : 'video.tv_show'
  } else if (options.routeType === 'episode') {
    ogType = options.anime?.kind === 'movie' ? 'video.movie' : 'video.episode'
  }

  const poster = options.anime?.posterUrl || DEFAULT_OG_IMAGE

  const openGraph = generateOpenGraph({
    title,
    description,
    url: canonicalUrl,
    imageUrl: poster,
    type: ogType,
  })

  const twitter = generateTwitterCard({
    title,
    description,
    imageUrl: poster,
  })

  // Assemble schema graph
  const graph: any[] = []

  if (options.breadcrumbs && options.breadcrumbs.length > 0) {
    graph.push(buildJsonLdBreadcrumbs(options.breadcrumbs, baseUrl))
  }

  if (options.routeType === 'title' && options.anime) {
    if (options.anime.kind === 'movie') {
      graph.push(buildJsonLdMovie(options.anime as MovieItem, undefined, baseUrl))
    } else {
      graph.push(buildJsonLdSeries(options.anime, baseUrl))
    }
  } else if (options.routeType === 'episode' && options.anime) {
    const epObj: EpisodeItem = typeof options.episode === 'number'
      ? { episodeNumber: options.episode }
      : options.episode || { episodeNumber: 1 }

    if (options.anime.kind === 'movie') {
      const movieSchema = buildJsonLdMovie(options.anime as MovieItem, undefined, baseUrl)
      graph.push(movieSchema)
    } else {
      graph.push(buildJsonLdEpisode(options.anime, epObj, undefined, baseUrl))
    }
  }

  const jsonLd = graph.length === 1 ? graph[0] : { '@context': 'https://schema.org', '@graph': graph }

  return {
    title,
    description,
    canonicalUrl,
    openGraph,
    twitter,
    jsonLd,
  }
}
