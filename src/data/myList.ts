import { useSyncExternalStore } from 'react'
import type { AnimeCard } from './catalog'
import { createLocalStore } from './localStore'

// «Мой список» хранится в браузере, пока нет аккаунтов.
export type ListStatus = 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped'

export const listStatuses: { id: ListStatus; title: string }[] = [
  { id: 'watching', title: 'Смотрю' },
  { id: 'planned', title: 'Буду смотреть' },
  { id: 'completed', title: 'Просмотрено' },
  { id: 'on_hold', title: 'Отложено' },
  { id: 'dropped', title: 'Брошено' },
]

export interface ListEntry {
  /** Снимок тайтла: хватает, чтобы нарисовать карточку без запроса к API. */
  anime: AnimeCard
  status: ListStatus
  addedAt: number
  /** когда последний раз меняли статус, для синхронизации между устройствами */
  updatedAt?: number
  /** оценка пользователя от 1 до 10 */
  rating?: number
  /** когда поставили оценку, для «Истории оценок» */
  ratedAt?: number
  /** сколько серий просмотрено */
  watched?: number
  /** личная заметка, видна только владельцу (как в AniList и MAL) */
  note?: string
  /** сколько раз пересматривали целиком */
  rewatches?: number
  /** когда начали и закончили смотреть, ГГГГ-ММ-ДД */
  startedOn?: string
  finishedOn?: string
}

/** Сегодняшняя дата по местному времени в виде ГГГГ-ММ-ДД. */
export const todayIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Даты начала и конца ставятся сами, когда тайтл впервые попадает в «Смотрю» или «Просмотрено». */
function autoDates(e: Pick<ListEntry, 'startedOn' | 'finishedOn'>, status: ListStatus) {
  const out: Pick<ListEntry, 'startedOn' | 'finishedOn'> = {}
  if (status === 'watching' && !e.startedOn) out.startedOn = todayIso()
  if (status === 'completed' && !e.finishedOn) out.finishedOn = todayIso()
  return out
}

const store = createLocalStore<ListEntry[]>('anime.mylist.v1', [])

export const useMyList = store.use

/** Подписка на запись одного тайтла: остальные карточки не перерисовываются при изменениях списка. */
export function useMyListEntry(animeId: string) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().find((entry) => entry.anime.id === animeId),
    () => undefined,
  )
}

/** Удалённые тайтлы и время удаления: чтобы при синхронизации они не вернулись с другого устройства. */
const removedStore = createLocalStore<Record<string, number>>('anime.mylist.removed.v1', {})

/** Для синхронизации с аккаунтом. */
export const listStore = store
export { removedStore }

export function setListStatus(anime: AnimeCard, status: ListStatus | undefined) {
  const rest = store.get().filter((e) => e.anime.id !== anime.id)
  if (!status) {
    removedStore.set({ ...removedStore.get(), [anime.id]: Date.now() })
    store.set(rest)
    return
  }
  const { id, title, year, kind, episodes, ongoing, score, posterUrl, posterSmall, posterSmall2x, posterFill } = anime
  const prev = store.get().find((e) => e.anime.id === anime.id)
  store.set([
    {
      ...prev,
      anime: { id, title, year, kind, episodes, ongoing, score, posterUrl, posterSmall, posterSmall2x, posterFill },
      status,
      ...(status !== prev?.status ? autoDates(prev ?? {}, status) : {}),
      addedAt: prev?.addedAt ?? Date.now(),
      updatedAt: Date.now(),
    },
    ...rest,
  ])
}

/** Оценка тайтла из списка. Без оценки (undefined) запись остаётся в списке. */
export function setListRating(animeId: string, rating: number | undefined) {
  const now = Date.now()
  store.set(
    store
      .get()
      .map((e) => (e.anime.id === animeId ? { ...e, rating, ratedAt: rating ? now : undefined, updatedAt: now } : e)),
  )
}

/** Сколько всего серий у тайтла, если известно: для онгоинга считаем вышедшие. */
export const totalEpisodes = (a: Pick<AnimeCard, 'episodes'> & { episodesAired?: number }) => a.episodes || a.episodesAired || 0

/**
 * Отметить, сколько серий просмотрено. Досмотрели последнюю серию законченного тайтла —
 * переносим в «Просмотрено»; начали смотреть из «Буду смотреть» — переносим в «Смотрю».
 * Возвращает новый статус, если он поменялся.
 */
export function setWatched(animeId: string, watched: number): ListStatus | undefined {
  const now = Date.now()
  let changed: ListStatus | undefined
  store.set(
    store.get().map((e) => {
      if (e.anime.id !== animeId) return e
      const total = e.anime.episodes ?? 0
      const n = Math.max(0, total ? Math.min(watched, total) : watched)
      let status = e.status
      if (total && n >= total && !e.anime.ongoing && status !== 'completed') status = 'completed'
      else if (n > 0 && status === 'planned') status = 'watching'
      if (status !== e.status) changed = status
      return { ...e, ...(changed ? autoDates(e, status) : {}), watched: n, status, updatedAt: now }
    }),
  )
  return changed
}

type EntryDetails = Pick<ListEntry, 'note' | 'rewatches' | 'startedOn' | 'finishedOn'>

/** Заметка, пересмотры и даты из «Моей записи» на странице тайтла. Пустые поля убираем совсем. */
export function setEntryDetails(animeId: string, patch: EntryDetails) {
  const now = Date.now()
  store.set(
    store.get().map((e) => {
      if (e.anime.id !== animeId) return e
      const next: ListEntry = { ...e, ...patch, updatedAt: now }
      for (const k of Object.keys(patch) as (keyof EntryDetails)[]) if (!next[k]) delete next[k]
      return next
    }),
  )
}

export const getEntry = (animeId: string) => store.get().find((e) => e.anime.id === animeId)

/** Импорт: добавляет новые тайтлы, у уже отмеченных дополняет прогресс и оценку. Возвращает число новых. */
export function mergeImported(entries: ListEntry[]) {
  const current = store.get()
  const byId = new Map(current.map((e) => [e.anime.id, e]))
  let added = 0
  for (const e of entries) {
    const prev = byId.get(e.anime.id)
    if (!prev) {
      byId.set(e.anime.id, e)
      added++
    } else {
      byId.set(e.anime.id, {
        ...prev,
        watched: Math.max(prev.watched ?? 0, e.watched ?? 0) || undefined,
        rating: prev.rating ?? e.rating,
        ratedAt: prev.ratedAt ?? e.ratedAt,
        updatedAt: Date.now(),
      })
    }
  }
  const removed = { ...removedStore.get() }
  for (const e of entries) delete removed[e.anime.id]
  removedStore.set(removed)
  store.set([...byId.values()].sort((a, b) => (b.updatedAt ?? b.addedAt) - (a.updatedAt ?? a.addedAt)))
  return added
}

/** Вернуть запись тайтла как была (для «Отменить»). */
export function restoreEntry(entry: ListEntry) {
  store.set(store.get().map((e) => (e.anime.id === entry.anime.id ? { ...entry, updatedAt: Date.now() } : e)))
}
