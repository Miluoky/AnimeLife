/**
 * Dynamic SEO Template Generator for AnimeLife 2.0
 * 
 * Provides pure functions for generating search-optimized titles, descriptions,
 * headers (H1-H3), and structured breadcrumbs for low-frequency (LF) and
 * mid-frequency (MF) Russian anime search queries.
 * 
 * Enforces strict word-boundary truncation:
 * - Titles: strictly <= 70 characters
 * - Descriptions: strictly <= 160 characters
 */

export const MAX_TITLE_LENGTH = 70
export const MAX_DESCRIPTION_LENGTH = 160
export const SITE_NAME = 'Anime Life'

export interface BreadcrumbItem {
  name: string
  url: string
}

/**
 * Truncates text cleanly at word boundaries, ensuring the final length
 * including the ellipsis does not exceed `max`. Never cuts in the middle of a word.
 */
export function truncateWithWordBoundary(text: string | null | undefined, max: number): string {
  const clean = String(text ?? '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1') // clean Shikimori wiki links
    .replace(/\[[^\]]*\]/g, '') // strip BBCode tags
    .replace(/\s+/g, ' ')
    .trim()

  if (clean.length <= max) return clean

  // Reserve 1 char for ellipsis '…'
  const target = max - 1
  const slice = clean.slice(0, target)
  const lastSpace = slice.lastIndexOf(' ')

  // If there's a space reasonably close to the end, break there; otherwise hard break
  const cutPoint = lastSpace > target * 0.5 ? lastSpace : target
  const truncated = clean.slice(0, cutPoint).replace(/[\s,.;:—–-]+$/, '')

  return `${truncated}…`
}

/**
 * Dynamic Anime Title Page Meta (LF/MF search queries)
 * Targets: "[Название] смотреть онлайн бесплатно в хорошем качестве 1080p — Anime Life"
 */
export function formatAnimeTitle(anime: {
  title: string
  originalTitle?: string
  year?: number | string
}): string {
  const yearSuffix = anime.year ? ` (${anime.year})` : ''
  const base = `${anime.title}${yearSuffix} — смотреть онлайн бесплатно HD 1080p`
  
  if (base.length <= MAX_TITLE_LENGTH) {
    return base
  }

  const short = `${anime.title} — смотреть онлайн в хорошем качестве`
  if (short.length <= MAX_TITLE_LENGTH) {
    return short
  }

  return truncateWithWordBoundary(`${anime.title} — смотреть онлайн`, MAX_TITLE_LENGTH)
}

export function formatAnimeDescription(anime: {
  title: string
  description?: string
  genres?: string[]
  year?: number | string
  episodes?: number
}): string {
  const yearPart = anime.year ? ` ${anime.year} года` : ''
  const genrePart = anime.genres && anime.genres.length > 0 ? ` в жанре ${anime.genres.slice(0, 3).join(', ')}` : ''
  const epPart = anime.episodes ? ` Все ${anime.episodes} серий подряд` : ' Все серии'
  
  const customIntro = anime.description ? ` ${anime.description}` : ''
  const raw = `Смотреть аниме «${anime.title}»${yearPart}${genrePart}.${epPart} онлайн в русской озвучке и хорошем качестве 1080p на ${SITE_NAME}.${customIntro}`

  return truncateWithWordBoundary(raw, MAX_DESCRIPTION_LENGTH)
}

export function formatAnimeH1(anime: { title: string; year?: number | string }): string {
  return anime.year ? `Смотреть «${anime.title}» (${anime.year}) онлайн` : `Смотреть «${anime.title}» онлайн`
}

export function formatAnimeH2(
  section: 'episodes' | 'similar' | 'voices' | 'reviews' | 'chronology',
  animeTitle: string
): string {
  switch (section) {
    case 'episodes':
      return `Все серии «${animeTitle}» смотреть онлайн`
    case 'voices':
      return `Русская озвучка и дубляж «${animeTitle}»`
    case 'chronology':
      return `Хронология и порядок просмотра «${animeTitle}»`
    case 'similar':
      return `Похожие аниме на «${animeTitle}»`
    case 'reviews':
      return `Отзывы и рецензии зрителей на «${animeTitle}»`
    default:
      return `Информация о тайтле «${animeTitle}»`
  }
}

export function formatAnimeH3(subSection: string, animeTitle: string): string {
  return `${subSection} — ${animeTitle}`
}

/**
 * Dynamic Episode Player Page Meta
 * Targets: "[Тайтл] [N] серия смотреть онлайн в озвучке [Студия] — Anime Life"
 */
export function formatEpisodeTitle(animeTitle: string, episode: number, studio?: string): string {
  const voicePart = studio ? ` в озвучке ${studio}` : ''
  const full = `${animeTitle} ${episode} серия смотреть онлайн${voicePart}`

  if (full.length <= MAX_TITLE_LENGTH) {
    return full
  }

  const short = `${animeTitle} — ${episode} серия онлайн${voicePart}`
  if (short.length <= MAX_TITLE_LENGTH) {
    return short
  }

  return truncateWithWordBoundary(`${animeTitle} — ${episode} серия онлайн`, MAX_TITLE_LENGTH)
}

export function formatEpisodeDescription(animeTitle: string, episode: number, studio?: string): string {
  const voicePart = studio ? ` в русской озвучке от студии «${studio}»` : ' в русской озвучке и с субтитрами'
  const raw = `Смотреть ${episode} серию аниме «${animeTitle}» онлайн бесплатно${voicePart} в высоком качестве 1080p Full HD на ${SITE_NAME}. Без рекламы и задержек.`
  return truncateWithWordBoundary(raw, MAX_DESCRIPTION_LENGTH)
}

export function formatEpisodeH1(animeTitle: string, episode: number, studio?: string): string {
  const voice = studio ? ` (${studio})` : ''
  return `«${animeTitle}» — ${episode} серия онлайн${voice}`
}

/**
 * Voiceover Studio Landing Page Meta (`/voice/:studio_slug`)
 * Targets: "Аниме в озвучке [Студия]: смотреть все серии онлайн бесплатно"
 */
export function formatVoiceStudioTitle(studioName: string): string {
  const full = `Аниме в озвучке ${studioName} — смотреть онлайн бесплатно`
  if (full.length <= MAX_TITLE_LENGTH) return full

  const short = `Озвучка ${studioName} — все аниме онлайн`
  if (short.length <= MAX_TITLE_LENGTH) return short

  return truncateWithWordBoundary(`Аниме в озвучке ${studioName}`, MAX_TITLE_LENGTH)
}

export function formatVoiceStudioDescription(studioName: string, dubbedCount?: number): string {
  const countPart = dubbedCount ? ` Каталог из ${dubbedCount} тайтлов.` : ''
  const raw = `Коллекция лучших аниме в озвучке и дубляже от студии «${studioName}».${countPart} Смотрите все серии подряд в HD 1080p бесплатно на ${SITE_NAME}.`
  return truncateWithWordBoundary(raw, MAX_DESCRIPTION_LENGTH)
}

export function formatVoiceStudioH1(studioName: string): string {
  return `Аниме в озвучке студии «${studioName}»`
}

export function formatVoiceStudioH2(
  section: 'catalog' | 'popular' | 'actors' | 'about',
  studioName: string
): string {
  switch (section) {
    case 'popular':
      return `Популярные релизы в озвучке ${studioName}`
    case 'catalog':
      return `Все аниме в озвучке ${studioName} по категориям`
    case 'actors':
      return `Команда и голоса студии ${studioName}`
    case 'about':
      return `Об озвучке и переводах ${studioName}`
    default:
      return `Разделы студии ${studioName}`
  }
}

/**
 * Franchise Chronology Page Meta (`/chronology/:id`)
 * Targets: "Порядок просмотра [Франшиза] — правильная хронология всех сезонов"
 */
export function formatFranchiseTitle(franchiseName: string): string {
  const full = `Порядок просмотра ${franchiseName} — хронология всех сезонов`
  if (full.length <= MAX_TITLE_LENGTH) return full

  const short = `Хронология ${franchiseName} — порядок просмотра`
  if (short.length <= MAX_TITLE_LENGTH) return short

  return truncateWithWordBoundary(`Хронология ${franchiseName}`, MAX_TITLE_LENGTH)
}

export function formatFranchiseDescription(franchiseName: string, partsCount?: number): string {
  const countPart = partsCount ? ` Полный гид по всем ${partsCount} частям.` : ''
  const raw = `В каком порядке смотреть аниме «${franchiseName}»?${countPart} Сюжетная хронология, порядок выхода сезонов, фильмов и OVA со ссылками на серии на ${SITE_NAME}.`
  return truncateWithWordBoundary(raw, MAX_DESCRIPTION_LENGTH)
}

export function formatFranchiseH1(franchiseName: string): string {
  return `Порядок просмотра аниме «${franchiseName}»: хронология сезонов`
}

export function formatFranchiseH2(
  section: 'timeline' | 'release_order' | 'guide' | 'spin_offs',
  franchiseName: string
): string {
  switch (section) {
    case 'timeline':
      return `Сюжетный порядок (внутренняя хронология) «${franchiseName}»`
    case 'release_order':
      return `Порядок по дате выхода серий «${franchiseName}»`
    case 'guide':
      return `Гид для новичков: с чего начать смотреть «${franchiseName}»`
    case 'spin_offs':
      return `Спин-оффы и альтернативные истории «${franchiseName}»`
    default:
      return `Хронология «${franchiseName}»`
  }
}

/**
 * Trope & Micro-genre Collection Page Meta (`/trope/:slug`)
 * Targets: "Аниме про [Троп]: топ лучших тайтлов онлайн — Anime Life"
 */
export function formatTropeTitle(tropeTitle: string): string {
  const full = `Аниме про ${tropeTitle} — топ лучших тайтлов онлайн`
  if (full.length <= MAX_TITLE_LENGTH) return full

  const short = `Аниме: ${tropeTitle} — список лучших`
  if (short.length <= MAX_TITLE_LENGTH) return short

  return truncateWithWordBoundary(`Аниме про ${tropeTitle}`, MAX_TITLE_LENGTH)
}

export function formatTropeDescription(tropeTitle: string, tropeSummary?: string): string {
  const summaryPart = tropeSummary ? ` ${tropeSummary}` : ''
  const raw = `Подборка лучших аниме с тропом «${tropeTitle}».${summaryPart} Смотрите онлайн бесплатно в русской озвучке и HD 1080p качестве на ${SITE_NAME}.`
  return truncateWithWordBoundary(raw, MAX_DESCRIPTION_LENGTH)
}

export function formatTropeH1(tropeTitle: string): string {
  return `Аниме про ${tropeTitle}: подборка лучших`
}

export function formatTropeH2(
  section: 'popular' | 'features' | 'related' | 'faq',
  tropeTitle: string
): string {
  switch (section) {
    case 'popular':
      return `Популярные аниме с темой «${tropeTitle}»`
    case 'features':
      return `Особенности и ключевые черты тропа «${tropeTitle}»`
    case 'related':
      return `Связанные тропы и похожие микро-жанры`
    case 'faq':
      return `Часто задаваемые вопросы о теме «${tropeTitle}»`
    default:
      return `Подборка «${tropeTitle}»`
  }
}

/** Known standard route segments translated into human-readable Russian names */
const SEGMENT_NAMES: Record<string, string> = {
  catalog: 'Каталог аниме',
  ongoing: 'Онгоинги',
  top: 'Топ аниме',
  random: 'Случайное аниме',
  schedule: 'Расписание серий',
  genre: 'Жанры',
  theme: 'Темы',
  studio: 'Студии анимации',
  voice: 'Студии озвучки',
  chronology: 'Хронологии',
  trope: 'Тропы и темы',
  collections: 'Подборки',
  manga: 'Манга',
  character: 'Персонажи',
  person: 'Создатели и сейю',
  quiz: 'Квиз',
  community: 'Сообщество',
  chat: 'Чат',
  about: 'О проекте',
  app: 'Приложение',
  rightholders: 'Правообладателям',
  contacts: 'Контакты',
  privacy: 'Конфиденциальность',
  terms: 'Пользовательское соглашение',
}

/**
 * Dynamic Breadcrumb Hierarchy Generator
 * Generates an array of `{ name, url }` pairs from the root to the target page.
 */
export function generateBreadcrumbs(
  pathname: string,
  customNames?: Record<string, string>
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ name: 'Главная', url: '/' }]
  const cleanPath = pathname.replace(/^\/+|\/+$/g, '')

  if (!cleanPath) return crumbs

  const segments = cleanPath.split('/')
  let accumulated = ''

  for (let i = 0; i < segments.length; i++) {
    const segment = decodeURIComponent(segments[i])
    accumulated += `/${segment}`
    
    // Check custom overrides first
    let displayName = customNames?.[segment] || customNames?.[accumulated]

    if (!displayName) {
      if (SEGMENT_NAMES[segment]) {
        displayName = SEGMENT_NAMES[segment]
      } else if (i > 0 && segments[i - 1] === 'watch') {
        displayName = `Серия ${segment}`
      } else if (i > 0 && segments[i - 1] === 'anime') {
        displayName = customNames?.title || 'Страница тайтла'
      } else if (i > 0 && segments[i - 1] === 'voice') {
        displayName = customNames?.studio || `Озвучка ${segment}`
      } else if (i > 0 && segments[i - 1] === 'chronology') {
        displayName = customNames?.franchise || `Франшиза ${segment}`
      } else if (i > 0 && segments[i - 1] === 'trope') {
        displayName = customNames?.trope || `Троп ${segment}`
      } else {
        displayName = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/[-_]/g, ' ')
      }
    }

    crumbs.push({ name: displayName, url: accumulated })
  }

  return crumbs
}
