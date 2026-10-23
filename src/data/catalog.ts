export interface Anime {
  id: string
  title: string
  originalTitle?: string
  englishTitle?: string
  /** название по-японски (кандзи/кана), для вертикальной надписи у постера */
  japaneseTitle?: string
  year?: number
  kind: string
  episodes?: number
  episodesAired?: number
  episodeMinutes?: number
  studio?: string
  /** id студии у Shikimori: ссылка на каталог с её тайтлами */
  studioId?: number
  season?: string
  genres: string[]
  ongoing: boolean
  /** анонс: ещё не вышло ни одной серии */
  upcoming?: boolean
  description: string
  score?: number
  posterUrl?: string
  /** лёгкий webp для карточек в сетке (и версия для экранов с высокой плотностью) */
  posterSmall?: string
  posterSmall2x?: string
  posterFill: string
  trailerUrl?: string
  /** возрастной рейтинг Shikimori (g, pg, pg_13, r, r_plus, rx), подпись — ageLabel в seo.ts */
  rating?: string
  /** онгоинг: когда выйдет следующая серия (ISO) */
  nextEpisodeAt?: string
}

/** Поля, которых хватает для карточки в сетке. */
export type AnimeCard = Pick<
  Anime,
  'id' | 'title' | 'year' | 'kind' | 'episodes' | 'ongoing' | 'score' | 'posterUrl' | 'posterSmall' | 'posterSmall2x' | 'posterFill'
>

/** Сколько серий можно выбрать в списке: для онгоинга только вышедшие. */
export function episodeCount(anime: Anime): number {
  if (anime.ongoing && anime.episodesAired) return anime.episodesAired
  return anime.episodes ?? anime.episodesAired ?? 1
}

/**
 * Один счёт серий для страницы тайтла и плеера. Сколько вышло — по Shikimori, сколько можно посмотреть —
 * по источникам видео (Kodik, Anixart, AniLibria…; 0 — пока не ответили). Список серий длиной в большее
 * из двух, следующая серия — за ним: так таймер, список и плеер везде называют одни и те же номера.
 */
export function episodeTotals(anime: Anime, available: number) {
  const aired = episodeCount(anime)
  const total = Math.max(aired, available)
  return { aired, available, total, next: total + 1 }
}

/** «1180 вышло · 1157 доступно» для онгоинга, «24 серии · 20 доступно» для вышедшего. */
export function episodesLabel(anime: Anime, available: number): string {
  const aired = episodeCount(anime)
  const head = anime.ongoing
    ? `${aired} вышло${anime.episodes ? ` из ${anime.episodes}` : ''}`
    : `${aired} ${plural(aired, 'серия', 'серии', 'серий')}`
  return available > 0 ? `${head} · ${available} доступно` : head
}

function plural(n: number, one: string, few: string, many: string) {
  const r = new Intl.PluralRules('ru').select(n)
  return r === 'one' ? one : r === 'few' ? few : many
}
