/**
 * Плееры сайта в комнате совместного просмотра: AniLibria, AnimeVost, озвучки Anixart и Kodik.
 *
 * Выбор хранится в той же строке комнаты, что и трейлер: source = 'trailer', а videoId — код плеера
 * вида «pl-ax-1234». У роликов YouTube id другой (11 символов без такого начала), так что они не путаются,
 * а функции на сервере менять не нужно: она уже принимает videoId из букв, цифр и дефисов.
 */

import { findRelease, episodeStream } from '../api/anilibria'
import { findAnimeVost, type AnimeVostQuery } from '../api/animevost'
import { anixartEpisodes, findAnixart } from '../api/anixart'
import { fetchKodikTranslations, kodikTranslationUrl } from '../api/kodik'
import type { Room } from './rooms'

/** al — AniLibria, av — AnimeVost, ax — озвучка Anixart (плеер Kodik), kd — озвучка Kodik по токену. */
export type PlayerKind = 'al' | 'av' | 'ax' | 'kd'

export interface PlayerPick {
  kind: PlayerKind
  /** id озвучки у Anixart или Kodik; у AniLibria и AnimeVost — 0 */
  voice: number
}

/** Озвучка, которую можно включить в комнате. */
export interface RoomVoice extends PlayerPick {
  title: string
  /** подпись группы в списке */
  group: string
  subtitles?: boolean
  episodes?: number
}

const CODE = /^pl-(al|av|ax|kd)-(\d{1,12})$/

export const pickCode = (p: PlayerPick) => `pl-${p.kind}-${p.voice}`

export function parsePick(videoId?: string): PlayerPick | null {
  const m = videoId ? CODE.exec(videoId) : null
  return m ? { kind: m[1] as PlayerKind, voice: Number(m[2]) } : null
}

export const samePick = (a: PlayerPick | null, b: PlayerPick | null) => !!a && !!b && a.kind === b.kind && a.voice === b.voice

/** Что сейчас играет в комнате. */
export type RoomVideo =
  | { type: 'trailer'; videoId?: string }
  | { type: 'file' }
  | { type: 'player'; pick: PlayerPick }

export function roomVideo(room: Pick<Room, 'source' | 'videoId'>): RoomVideo {
  if (room.source === 'file') return { type: 'file' }
  const pick = parsePick(room.videoId)
  return pick ? { type: 'player', pick } : { type: 'trailer', videoId: room.videoId }
}

export interface AnimeQuery extends AnimeVostQuery {
  id: string
}

/** Все озвучки тайтла из бесплатных источников (и Kodik, если на сайте есть токен). */
export async function roomVoices(q: AnimeQuery): Promise<RoomVoice[]> {
  const [al, av, ax, kd] = await Promise.all([
    findRelease(q.id, [q.title, q.originalTitle, q.englishTitle]).catch(() => null),
    findAnimeVost(q.id, q).catch(() => null),
    findAnixart(q.id, q).catch(() => null),
    fetchKodikTranslations(q.id).catch(() => []),
  ])
  const list: RoomVoice[] = []
  if (al?.episodes.length) list.push({ kind: 'al', voice: 0, title: 'AniLibria', group: 'Свой плеер', episodes: al.episodes.length })
  if (av?.length) list.push({ kind: 'av', voice: 0, title: 'AnimeVost', group: 'Свой плеер', episodes: av.length })
  for (const v of ax?.voices ?? [])
    list.push({ kind: 'ax', voice: v.type, title: v.title, group: 'Озвучки Anixart', subtitles: v.kind === 'subtitles', episodes: v.episodes })
  for (const t of kd)
    if (!list.some((v) => v.kind === 'ax' && v.title === t.title))
      list.push({ kind: 'kd', voice: t.id, title: t.title, group: 'Kodik', subtitles: t.kind === 'subtitles', episodes: t.episodes })
  return list
}

/** Где играть серию: прямой поток для своего плеера или страница плеера Kodik. null — серии в этой озвучке нет. */
export type RoomStream = { type: 'video'; url: string } | { type: 'kodik'; url: string }

export async function roomStream(q: AnimeQuery, pick: PlayerPick, episode: number): Promise<RoomStream | null> {
  if (pick.kind === 'al') {
    const release = await findRelease(q.id, [q.title, q.originalTitle, q.englishTitle])
    const ep = release?.episodes.find((e) => e.ordinal === episode)
    // 720p: всем участникам комнаты нужна одна и та же скорость загрузки, 1080 у кого-то будет тормозить.
    const stream = ep && episodeStream(ep, '720')
    return stream ? { type: 'video', url: stream.url } : null
  }
  if (pick.kind === 'av') {
    const ep = (await findAnimeVost(q.id, q))?.find((e) => e.ordinal === episode)
    const url = ep?.hd ?? ep?.std
    return url ? { type: 'video', url } : null
  }
  if (pick.kind === 'ax') {
    const release = await findAnixart(q.id, q)
    const url = release && (await anixartEpisodes(release.id, pick.voice)).urls.get(episode)
    return url ? { type: 'kodik', url } : null
  }
  const t = (await fetchKodikTranslations(q.id)).find((x) => x.id === pick.voice)
  return t && episode <= Math.max(t.episodes, 1) ? { type: 'kodik', url: kodikTranslationUrl(t.link, episode) } : null
}
