/**
 * Конфигурация видеобалансеров Kodik и Alloha (Allohacloud).
 *
 * Токены передаются через переменные окружения Vite:
 *   VITE_KODIK_TOKEN   — API-токен Kodik
 *   VITE_ALLOHA_TOKEN  — API-токен Alloha
 *
 * Embed-ссылки формируются хелперами, чтобы токен не протекал в компонентный код.
 */

const env = import.meta.env as Record<string, string | undefined>

/* ─────── Kodik ─────── */

export const KODIK_TOKEN = env.VITE_KODIK_TOKEN ?? ''

/**
 * Домен плееров Kodik. Если его заблокируют, Kodik сообщит новый: его задают переменной репозитория KODIK_DOMAIN
 * (Settings → Variables), сайт пересобирается и все плееры Kodik переезжают туда же, без правки кода.
 */
export const KODIK_DOMAIN = env.VITE_KODIK_DOMAIN || 'kodikplayer.com'

/**
 * Старые и запасные домены Kodik: список из официального скрипта замены доменов
 * (kodik-add.com/change-domains.min.js). Плееры с них переводим на KODIK_DOMAIN.
 */
const KODIK_HOSTS = new Set([
  'kodikplayer.com',
  'kodik.org',
  'kodik.cc',
  'kodik.info',
  'hdlizor.com',
  'aniqit.com',
  'anivod.com',
  'hdrise.com',
  'kodik-video.com',
  'kodik.biz',
  'kodikdb.com',
])

/**
 * Ссылка на плеер Kodik на рабочем домене. Подходит и для ссылок из API, и для чужих плееров
 * (Anixart, YummyAnime отдают Kodik на своих доменах). Остальные адреса возвращает как есть.
 */
export function kodikHost(link: string): string {
  try {
    const url = new URL(link.startsWith('//') ? `https:${link}` : link)
    const host = url.hostname.replace(/^www\./, '')
    if (!KODIK_HOSTS.has(host) || host === KODIK_DOMAIN) return url.toString()
    url.hostname = KODIK_DOMAIN
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return link
  }
}

/** Поиск плеера по id тайтла. Старый адрес kodik.info больше не открывается. */
const KODIK_EMBED = `https://${KODIK_DOMAIN}/find-player`

export interface KodikParams {
  /** Shikimori ID тайтла. */
  shikimoriId?: string
  /** Kinopoisk ID тайтла. */
  kinopoiskId?: string
  /** IMDb ID тайтла (ttXXXXXXX). */
  imdbId?: string
  /** Точное название для поиска. */
  title?: string
  /** Номер серии (для сериалов). */
  episode?: number
}

/**
 * Формирует embed-URL для Kodik. Приоритет идентификаторов: shikimori → kinopoisk → imdb → title.
 * Возвращает null, если токен не задан или нет ни одного идентификатора.
 */
export function kodikEmbedUrl(params: KodikParams): string | null {
  if (!KODIK_TOKEN) return null
  const { shikimoriId, kinopoiskId, imdbId, title, episode } = params
  if (!shikimoriId && !kinopoiskId && !imdbId && !title) return null

  const url = new URL(KODIK_EMBED)
  url.searchParams.set('token', KODIK_TOKEN)

  if (shikimoriId) url.searchParams.set('shikimoriID', shikimoriId)
  else if (kinopoiskId) url.searchParams.set('kinopoiskID', kinopoiskId)
  else if (imdbId) url.searchParams.set('imdbID', imdbId)
  else if (title) url.searchParams.set('title', title)

  if (episode && episode > 0) url.searchParams.set('episode', String(episode))

  // Параметры плеера.
  url.searchParams.set('translations', 'true')
  url.searchParams.set('only_season', 'false')
  url.searchParams.set('hide_resume_button', 'true')

  return url.toString()
}

/* ─────── Alloha (Allohacloud) ─────── */

export const ALLOHA_TOKEN = env.VITE_ALLOHA_TOKEN ?? ''

/**
 * Базовый URL для embed-плеера Alloha.
 * Документация: https://docs.alloha.tv/
 */
const ALLOHA_EMBED = 'https://api.alloha.tv/'

export interface AllohaParams {
  /** Kinopoisk ID тайтла. */
  kinopoiskId?: string
  /** IMDb ID тайтла (ttXXXXXXX). */
  imdbId?: string
  /** Номер серии (для сериалов). */
  episode?: number
}

/**
 * Формирует embed-URL для Alloha. Приоритет: kinopoisk → imdb.
 * Возвращает null, если токен не задан или нет идентификатора.
 */
export function allohaEmbedUrl(params: AllohaParams): string | null {
  if (!ALLOHA_TOKEN) return null
  const { kinopoiskId, imdbId, episode } = params
  if (!kinopoiskId && !imdbId) return null

  const url = new URL(ALLOHA_EMBED)
  url.searchParams.set('token', ALLOHA_TOKEN)

  if (kinopoiskId) url.searchParams.set('kp', kinopoiskId)
  else if (imdbId) url.searchParams.set('imdb', imdbId)

  if (episode && episode > 0) url.searchParams.set('e', String(episode))

  return url.toString()
}

/* ─────── Общий хелпер ─────── */

export type BalancerProvider = 'kodik' | 'alloha'

/** Проверяет, доступен ли конкретный балансер (есть ли токен). */
export function isBalancerAvailable(provider: BalancerProvider): boolean {
  switch (provider) {
    case 'kodik': return !!KODIK_TOKEN
    case 'alloha': return !!ALLOHA_TOKEN
  }
}
