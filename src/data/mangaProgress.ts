import { createLocalStore } from './localStore'

// Место чтения манги. Лежит в основном коде, потому что уходит в аккаунт вместе с историей (auth.ts);
// сама читалка и запросы к MangaDex — в отдельных частях (src/api/mangadex.ts).
const LIMIT = 40

export interface ReadProgress {
  lang: string
  chapterId: string
  num: string
  at: number
  /** название и обложка для полки «Читаю» в разделе /manga */
  title?: string
  image?: string
  /** страница, на которой остановились (с 1), в постраничном режиме и в ленте */
  page?: number
  /** id манги на MangaDex: по нему полка «Читаю» проверяет новые главы */
  md?: string
}

/** id манги на Shikimori → где остановились. */
export const mangaProgressStore = createLocalStore<Record<string, ReadProgress>>('anime.mangaProgress.v1', {})

/** Объединяем по манге: остаётся более свежая запись, всего не больше 40 последних. */
export function mergeMangaProgress(a: Record<string, ReadProgress> = {}, b: Record<string, ReadProgress> = {}) {
  const out: Record<string, ReadProgress> = { ...a }
  for (const [id, p] of Object.entries(b)) if (!out[id] || p.at > out[id].at) out[id] = p
  return Object.fromEntries(
    Object.entries(out)
      .sort(([, x], [, y]) => y.at - x.at)
      .slice(0, LIMIT),
  )
}
