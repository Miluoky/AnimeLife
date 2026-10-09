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
