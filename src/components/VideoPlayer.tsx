/**
 * VideoPlayer — мульти-провайдерный плеерный блок.
 *
 * Источники:
 *   1. Kodik    — iframe-балансер, основной для СНГ.
 *   2. Alloha   — iframe-балансер, резервный.
 *   3. AniLibria — HLS-поток через Hls.js со своими кнопками (PlayerControls).
 *   4. AnimeVost — прямые mp4 в том же своём плеере.
 *   5. Anixart  — каталог озвучек: серии каждой студии в плеере Kodik (iframe, без токена).
 *   6. Готовый плеер со стороны (embed) — серии из YummyAnime в Kodik, CVH, Alloha, Aksor или Sibnet.
 *
 * Провайдер переключается табами над видео. При смене текущий поток
 * останавливается, контейнер динамически монтирует нужный плеер.
 * Если ни один источник не может показать серию, вместо пустого экрана — трейлер с Shikimori.
 */

import { rememberQuality, startQuality } from '../data/saver'
import { useState, useEffect, useLayoutEffect, useRef, useCallback, lazy, Suspense, type CSSProperties, type RefObject } from 'react'
import {
  findRelease,
  episodeStream,
  episodeSkips,
  qualities,
  type AniLibriaEpisode,
  type AniLibriaRelease,
  type AniLibriaQuality,
} from '../api/anilibria'
import { findAnimeVost, type AnimeVostEpisode } from '../api/animevost'
import type { YummySkips } from '../api/yummy'
import { anixartEpisodes } from '../api/anixart'
import { FullscreenIcon } from './Icons'
import PlayerControls, { AutoNext, autoNextStore, enhanceStore, formatTime } from './PlayerControls'
import { toast } from '../data/toast'
import { getPosition, savePosition } from '../data/positions'
import { emitPlayerTime, playerTime } from '../data/playerTime'
import { useMediaSession } from './mediaSession'
import './player.css'
import {
  kodikEmbedUrl,
  kodikHost,
  allohaEmbedUrl,
  isBalancerAvailable,
} from '../api/balancers'
import { kodikTranslationUrl } from '../api/kodik'

// Комментарии поверх видео тянут SDK Appwrite: отдельной частью, когда серия уже играет.
const Danmaku = lazy(() => import('./Danmaku'))

/* ──────────────── Типы ──────────────── */

export type Provider = 'kodik' | 'alloha' | 'anilibria' | 'animevost' | 'anixart' | 'embed'

export interface VideoPlayerProps {
  /** Название аниме для поиска в AniLibria и Kodik. */
  title: string
  /** Оригинальное (ромадзи) название для фоллбэка поиска. */
  originalTitle?: string
  /** Английское название — последний вариант поиска в AniLibria. */
  englishTitle?: string
  /** Год выхода: AnimeVost сверяем по названию и году. */
  year?: number
  /** Shikimori ID — основной идентификатор для Kodik. */
  shikimoriId?: string
  /** Kinopoisk ID — для Kodik и Alloha. */
  kinopoiskId?: string
  /** IMDb ID — для Kodik и Alloha. */
  imdbId?: string
  /** Постер тайтла: картинка на экране блокировки. */
  poster?: string
  /** Текущий номер серии (1-indexed). */
  episode: number
  /** Общее количество серий. */
  totalEpisodes: number
  /** Серия досмотрена до конца (свой плеер или Kodik). */
  onEnded?: () => void
  /** Переход к другой серии (кнопка «Следующая серия» под конец видео). */
  onEpisodeChange?: (episode: number) => void
  /** Серии найденного релиза AniLibria: странице нужны их названия для списка серий. */
  onEpisodes?: (episodes: AniLibriaEpisode[]) => void
  /** Embed-ссылка на трейлер: показывается, когда серию взять негде. */
  trailerUrl?: string
  /**
   * Источник выбирает страница (список озвучек сбоку): тогда табов над видео нет,
   * а смена источника из плеера («Попробовать другой источник») приходит в onProviderChange.
   */
  provider?: Provider
  onProviderChange?: (provider: Provider) => void
  /** Источник не может показать серию (ошибка, таймаут, серии нет): страница может сама включить запасной. */
  onUnavailable?: (reason: string) => void
  /** Источники, в которых страница точно знает этот тайтл: на них предлагаем переключиться. */
  available?: Provider[]
  /** Выбранная озвучка Kodik: ссылка на её плеер из API. Без неё Kodik ищет тайтл сам. */
  kodikLink?: string
  /** Выбранная озвучка Anixart: релиз и id студии. */
  anixart?: { release: number; type: number; title: string }
  /** Готовый плеер со стороны (Kodik, CVH, Alloha… из YummyAnime): адрес серии и подпись. Без url — серии в нём нет. */
  embed?: { url?: string; player: string; voice: string }
  /** опенинг и эндинг серии в той же озвучке из YummyAnime: пригодятся своему плееру, если у источника своей разметки нет */
  skips?: YummySkips
  /** опенинг и эндинг этой серии в плеере Kodik той же озвучки (YummyAnime): станут кнопкой пропуска в Kodik */
  kodikSkips?: YummySkips
}

/* ──────────────── Конфигурация табов ──────────────── */

interface ProviderTab {
  id: Provider
  label: string
  available: boolean
}

function buildTabs(): ProviderTab[] {
  return [
    { id: 'kodik', label: 'Kodik', available: isBalancerAvailable('kodik') },
    { id: 'alloha', label: 'Alloha', available: isBalancerAvailable('alloha') },
    // AniLibria всегда доступна — бесплатный публичный API (в новых потоках бывает реклама).
    { id: 'anilibria', label: 'AniLibria', available: true },
    // AnimeVost тоже бесплатный и открытый: прямые mp4 без ключа.
    { id: 'animevost', label: 'AnimeVost', available: true },
    // Anixart включается только озвучкой из списка: без неё не знаем, какую студию показать.
    { id: 'anixart', label: 'Anixart', available: true },
    // Сторонний плеер тоже выбирается только со страницы: адрес серии приходит в embed.
    { id: 'embed', label: 'Плеер', available: true },
  ]
}

const NO_SOURCES = 'Серий этого аниме пока нет в доступных источниках'
const PLAY_ERROR = 'Не удалось воспроизвести серию'
const SOURCE_NAME: Record<Provider, string> = { kodik: 'Kodik', alloha: 'Alloha', anilibria: 'AniLibria', animevost: 'AnimeVost', anixart: 'Anixart', embed: 'плеера' }

// Выбранный источник помним до конца сеанса: при переходе к другой серии плеер создаётся заново.
const PROVIDER_KEY = 'player-provider'

function savedProvider(): string | null {
  try {
    return sessionStorage.getItem(PROVIDER_KEY)
  } catch {
    return null
  }
}

function saveProvider(id: Provider) {
  try {
    sessionStorage.setItem(PROVIDER_KEY, id)
  } catch {
    // Без хранилища на следующей серии будет источник по умолчанию.
  }
}

/* ──────────────── Компонент ──────────────── */

export default function VideoPlayer(props: VideoPlayerProps) {
  const { title, originalTitle, englishTitle, year, shikimoriId, kinopoiskId, imdbId, episode, totalEpisodes, onEpisodeChange, onEpisodes, trailerUrl, kodikLink, anixart, embed } = props
  const controlled = props.provider !== undefined

  const tabs = buildTabs()
  // Выбранный ранее провайдер, иначе первый доступный; если источников нет вовсе — сразу трейлер.
  const [ownProvider, setProviderState] = useState<Provider | undefined>(() => {
    const saved = savedProvider()
    return (tabs.find((t) => t.available && t.id === saved) ?? tabs.find((t) => t.available))?.id
  })
  const provider = controlled ? props.provider : ownProvider
  const setProvider = (id: Provider) => {
    if (props.onProviderChange) return props.onProviderChange(id)
    saveProvider(id)
    setProviderState(id)
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [frameAttempt, setFrameAttempt] = useState(0)

  // ─── AniLibria state ───
  const [alRelease, setAlRelease] = useState<AniLibriaRelease | null>(null)
  // Стартовое качество по сети или прошлому выбору зрителя (src/data/saver.ts).
  const [alQuality, setAlQuality] = useState<AniLibriaQuality>(() => startQuality() as AniLibriaQuality)
  const [alSearching, setAlSearching] = useState(false)
  // Ошибка воспроизведения текущего потока (сбрасывается при смене потока).
  const [streamError, setStreamError] = useState<string | null>(null)
  // ─── AnimeVost state ───
  const [avEpisodes, setAvEpisodes] = useState<AnimeVostEpisode[] | null>(null)
  const [avSearching, setAvSearching] = useState(false)
  // ─── Anixart state: ссылки на серии выбранной озвучки ───
  const [axEpisodes, setAxEpisodes] = useState<Map<number, string> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  // Позиция, с которой продолжить после смены качества (поток меняется, а серия та же).
  const resumeAt = useRef(0)
  const hlsRef = useRef<import('hls.js').default | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const enhance = enhanceStore.use()
  // Видео с чужого сервера для фильтра «Чётче» надо загрузить заново с crossOrigin: счётчик перезапускает поток.
  const [corsReload, setCorsReload] = useState(0)

  // Сброс загрузки при смене источника или серии: страница плеера при этом не пересоздаётся.
  useEffect(() => {
    setLoading(true)
    setError(null)
    setFrameAttempt(0)
  }, [provider, kodikLink, anixart?.type, embed?.url, shikimoriId, episode])

  // Озвучку или плеер сменили посреди серии: новый источник начинает с того же места, а не с начала.
  // Считаем при отрисовке, а не в эффекте: адрес iframe с этим временем должен уйти сразу, без второй загрузки.
  const sourceKey = `${provider}|${kodikLink}|${anixart?.type}|${embed?.url}`
  const episodeKey = `${shikimoriId}|${episode}`
  const carry = useRef({ source: sourceKey, episode: episodeKey, at: 0, user: false })
  if (carry.current.source !== sourceKey || carry.current.episode !== episodeKey) {
    const sameEpisode = carry.current.episode === episodeKey
    // user: смену сделал зритель (или автопереход), значит новый плеер можно сразу запустить.
    carry.current = { source: sourceKey, episode: episodeKey, at: sameEpisode ? playerTime() : 0, user: true }
  }

  useEffect(() => {
    if (!loading || provider === 'anilibria' || provider === 'animevost') return
    const timer = window.setTimeout(() => setError('Плеер не ответил вовремя. Возможно, источник или CDN заблокирован. Попробуйте другой плеер.'), 15000)
    return () => window.clearTimeout(timer)
  }, [loading, provider, frameAttempt])

  const onEpisodesRef = useRef(onEpisodes)
  onEpisodesRef.current = onEpisodes

  /* ─── Поиск релиза AniLibria по id Shikimori ─── */
  useEffect(() => {
    if (provider !== 'anilibria') return

    let cancelled = false
    setAlSearching(true)
    setError(null)
    // Сменился тайтл — старый релиз не должен играть, пока ищем новый.
    setAlRelease(null)

    // Пробуем русское, оригинальное и английское название; берём только релиз с тем же id Shikimori.
    ;(async () => {
      try {
        const release = await findRelease(shikimoriId, [title, originalTitle, englishTitle])
        if (cancelled) return
        setAlRelease(release)
        if (release) onEpisodesRef.current?.(release.episodes)
        else setError(NO_SOURCES)
      } catch {
        if (!cancelled) {
          setAlRelease(null)
          setError('Не удалось подключиться к AniLibria')
        }
      } finally {
        if (!cancelled) {
          setAlSearching(false)
          setLoading(false)
        }
      }
    })()

    return () => { cancelled = true }
  }, [provider, shikimoriId, title, originalTitle, englishTitle])

  /* ─── Поиск релиза AnimeVost по названию и году ─── */
  useEffect(() => {
    if (provider !== 'animevost') return
    let cancelled = false
    setAvSearching(true)
    setError(null)
    setAvEpisodes(null)
    findAnimeVost(shikimoriId ?? title, { title, originalTitle, englishTitle, year })
      .then((list) => {
        if (cancelled) return
        setAvEpisodes(list)
        if (!list) setError('Этого аниме нет в AnimeVost')
      })
      .catch(() => !cancelled && setError('Не удалось подключиться к AnimeVost'))
      .finally(() => {
        if (!cancelled) {
          setAvSearching(false)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [provider, shikimoriId, title, originalTitle, englishTitle, year])

  /* ─── Серии озвучки Anixart ─── */
  const axRelease = anixart?.release
  const axType = anixart?.type
  useEffect(() => {
    if (provider !== 'anixart' || !axRelease || !axType) return
    let cancelled = false
    setError(null)
    setAxEpisodes(null)
    anixartEpisodes(axRelease, axType)
      .then(({ urls: map }) => {
        if (cancelled) return
        setAxEpisodes(map)
        if (!map.size) setError('У этой озвучки нет плеера, который можно встроить')
      })
      .catch(() => !cancelled && setError('Не удалось подключиться к Anixart'))
    return () => {
      cancelled = true
    }
  }, [provider, axRelease, axType])

  // Серия и поток AniLibria для текущей страницы: без подмены на другую серию.
  const alEp = alRelease?.episodes.find((e) => e.ordinal === episode)
  const alStream = provider === 'anilibria' && alEp ? episodeStream(alEp, alQuality) : null
  // У AnimeVost два качества: 720p (hd) и 480p (std).
  const avEp = avEpisodes?.find((e) => e.ordinal === episode)
  const avAvailable: AniLibriaQuality[] = avEp ? [...(avEp.hd ? (['720'] as const) : []), ...(avEp.std ? (['480'] as const) : [])] : []
  const avQuality = avAvailable.includes(alQuality) ? alQuality : avAvailable[0]
  const avStream = provider === 'animevost' && avEp && avQuality ? { quality: avQuality, url: (avQuality === '720' ? avEp.hd : avEp.std)! } : null
  const stream = alStream ?? avStream
  const src = stream?.url

  // Позиция переносится только при смене качества: новая серия всегда начинается с начала.
  // Эффект объявлен раньше потока, поэтому сбрасывает позицию до того, как поток её прочитает.
  useEffect(() => {
    resumeAt.current = 0
    emitPlayerTime(0)
  }, [shikimoriId, episode])

  /* ─── Инициализация HLS потока для AniLibria ─── */
  useEffect(() => {
    const video = videoRef.current
    if (!src || !video) return
    setStreamError(null)
    let cancelled = false

    // Убиваем предыдущий экземпляр.
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    const onLoaded = () => {
      setLoading(false)
      if (resumeAt.current) video.currentTime = resumeAt.current
      else if (carry.current.at) video.currentTime = carry.current.at
      else resumeRef.current((t) => (video.currentTime = t))
    }
    const onError = () => setStreamError(PLAY_ERROR)
    // Фильтру «Чётче» нужен доступ к кадрам: прямой файл и нативный HLS грузим с CORS (серверы его разрешают).
    // hls.js отдаёт видео через blob и в этом не нуждается.
    video.crossOrigin = enhanceStore.get() ? 'anonymous' : null
    // Прямой mp4 (AnimeVost) браузер играет сам.
    if (/\.mp4(\?|$)/.test(src)) {
      video.src = src
      video.addEventListener('loadedmetadata', onLoaded, { once: true })
      video.addEventListener('error', onError, { once: true })
    } else
    // HLS.js нужен только для браузеров без нативной поддержки HLS (Chrome, Firefox).
    // Safari поддерживает HLS нативно.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.addEventListener('loadedmetadata', onLoaded, { once: true })
      video.addEventListener('error', onError, { once: true })
    } else {
      import('hls.js/light').then(({ default: Hls }) => {
        // Пока грузился hls.js, поток могли сменить.
        if (cancelled) return
        if (!Hls.isSupported()) {
          setStreamError('Ваш браузер не поддерживает HLS-воспроизведение')
          return
        }
        const instance = new Hls({ enableWorker: true, lowLatencyMode: false })
        hlsRef.current = instance
        instance.loadSource(src)
        instance.attachMedia(video)
        instance.on(Hls.Events.MANIFEST_PARSED, onLoaded)
        instance.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setStreamError(PLAY_ERROR)
        })
      }).catch(() => {
        if (!cancelled) setStreamError('Не удалось загрузить плеер AniLibria')
      })
    }

    return () => {
      cancelled = true
      resumeAt.current = video.currentTime
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      // Нативный HLS: останавливаем загрузку старого потока.
      if (video.getAttribute('src')) {
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [src, corsReload])

  /* ─── «Чётче»: фильтр на видеокарте поверх своего видео ─── */
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!enhance || !src || !video || !canvas) return
    let stop: (() => void) | undefined
    let cancelled = false
    import('./enhanceGl')
      .then(({ startEnhance }) => {
        if (cancelled) return
        stop = startEnhance(video, canvas, {
          onUnsupported: () => {
            toast('Этот браузер не умеет улучшать картинку')
            enhanceStore.set(false)
          },
          onCors: () => {
            if (video.crossOrigin === 'anonymous') {
              toast('Сервер этого видео не разрешает улучшать картинку')
              enhanceStore.set(false)
            } else setCorsReload((n) => n + 1)
          },
        })
      })
      .catch(() => !cancelled && enhanceStore.set(false))
    return () => {
      cancelled = true
      stop?.()
    }
  }, [enhance, src, corsReload])

  /* ─── Продолжить с места: своё видео и Kodik ─── */
  // Плашка «Продолжили с 12:34» с кнопкой «С начала»; seek перематывает тот плеер, что сейчас играет.
  const [resumed, setResumed] = useState<{ at: number; seek: (t: number) => void } | null>(null)
  useEffect(() => setResumed(null), [shikimoriId, episode, provider])
  useEffect(() => {
    if (!resumed) return
    const t = setTimeout(() => setResumed(null), 7000)
    return () => clearTimeout(t)
  }, [resumed])
  const positionKey = shikimoriId ?? title
  const resumeSaved = (seek: (t: number) => void) => {
    const at = getPosition(positionKey, episode)
    if (at === null) return
    seek(at)
    setResumed({ at, seek })
  }
  const resumeRef = useRef(resumeSaved)
  resumeRef.current = resumeSaved
  const endedRef = useRef(props.onEnded)
  endedRef.current = props.onEnded

  // Своё видео: место в серии запоминаем раз в 5 секунд, досмотренная серия запись стирает.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return
    let last = 0
    const onTime = () => {
      emitPlayerTime(video.currentTime)
      if (Math.abs(video.currentTime - last) < 5) return
      last = video.currentTime
      savePosition(positionKey, episode, video.currentTime, video.duration)
    }
    const onEnded = () => {
      savePosition(positionKey, episode, video.duration, video.duration)
      endedRef.current?.()
    }
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('ended', onEnded)
    }
  }, [src, positionKey, episode])

  // Kodik (свой, из Anixart или YummyAnime) сообщает о себе через postMessage: время, длительность и конец серии.
  // По этим событиям запоминаем место, продолжаем с него и включаем отсчёт до следующей серии.
  const [kodikEnded, setKodikEnded] = useState(false)
  const autoNext = autoNextStore.use()
  useEffect(() => setKodikEnded(false), [shikimoriId, episode, provider, embed?.url])
  useEffect(() => {
    if (provider !== 'kodik' && provider !== 'anixart' && provider !== 'embed') return
    let duration = 0
    let last = 0
    let started = false
    const onMessage = (e: MessageEvent) => {
      const frame = frameRef.current?.querySelector('iframe:not(.player-iframe--old):not(.player-iframe--prep)')
      if (!(frame instanceof HTMLIFrameElement) || e.source !== frame.contentWindow) return
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string' || !key.startsWith('kodik_player_')) return
      const seconds = typeof value === 'number' ? value : Number((value as { time?: unknown } | null)?.time)
      if (key === 'kodik_player_duration_update' && Number.isFinite(seconds)) duration = seconds
      if (key === 'kodik_player_time_update' && Number.isFinite(seconds)) {
        emitPlayerTime(seconds)
        // Только что подменили озвучку: видео должно идти с места прежней. Kodik сбил время — возвращаем.
        const fix = settle.current
        const gone = fix && (performance.now() - fix.since) / 1000
        if (fix && gone! < 6 && fix.tries < 2) {
          const want = fix.at + (fix.paused ? 0 : gone!)
          if (Math.abs(seconds - want) > 2.5) {
            fix.tries++
            ;(e.source as Window).postMessage({ key: 'kodik_player_api', value: { method: 'seek', seconds: want } }, e.origin)
          }
        } else settle.current = null
      }
      if (key === 'kodik_player_time_update' && Number.isFinite(seconds) && Math.abs(seconds - last) >= 5) {
        last = seconds
        savePosition(positionKey, episode, seconds, duration)
      }
      if ((key === 'kodik_player_video_started' || key === 'kodik_player_play') && !started) {
        started = true
        const source = e.source as Window
        const origin = e.origin
        // Время уже передали в адресе (start_from): перематывать на сохранённое место не нужно.
        if (!carry.current.at) resumeRef.current((t) => source.postMessage({ key: 'kodik_player_api', value: { method: 'seek', seconds: t } }, origin))
      }
      if (key === 'kodik_player_video_ended') {
        savePosition(positionKey, episode, duration || Infinity, duration)
        setKodikEnded(true)
        endedRef.current?.()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [provider, positionKey, episode, kodikLink, anixart?.type, embed?.url])

  /* ─── Плееры в iframe (Kodik, Alloha, Anixart, YummyAnime): один слот на все ─── */

  const frameSrc = (): string | null => {
    if (provider === 'kodik') {
      return kodikLink ? kodikTranslationUrl(kodikLink, episode, props.kodikSkips?.spans) : kodikEmbedUrl({ shikimoriId, kinopoiskId, imdbId, title, episode })
    }
    if (provider === 'alloha') return allohaEmbedUrl({ kinopoiskId, imdbId, episode })
    // Anixart и YummyAnime отдают плееры Kodik: переводим их на рабочий домен, как и свои; остальные адреса не меняются.
    if (provider === 'anixart') {
      const found = axEpisodes?.get(episode)
      return found ? kodikHost(found) : null
    }
    if (provider === 'embed') return embed?.url ? kodikHost(embed.url) : null
    return null
  }
  const frameTitle =
    provider === 'anixart'
      ? `${anixart?.title ?? 'Anixart'}: ${title}`
      : provider === 'embed'
        ? `${embed?.voice}, плеер ${embed?.player}: ${title}`
        : `${provider === 'alloha' ? 'Alloha' : 'Kodik'}: ${title}`
  const rawSrc = frameSrc()
  const src0 = rawSrc && carry.current.at ? withStart(rawSrc, carry.current.at) : rawSrc
  const frame: ShownFrame | null = src0 ? { src: src0, title: frameTitle, key: `${src0}:${frameAttempt}` } : null

  // Пока новый плеер грузится, прежний Kodik остаётся на экране на паузе и потом плавно уступает место:
  // смена озвучки, плеера или серии без чёрного экрана. Чужие плееры поставить на паузу нельзя (звук
  // играл бы поверх), их убираем сразу. Решаем при отрисовке: старый iframe должен остаться тем же
  // элементом, иначе он перезагрузится.
  const lastFrame = useRef<ShownFrame | null>(null)
  const held = useRef<ShownFrame | null>(null)
  // Бесшовная смена озвучки или плеера Kodik посреди серии: прежний играет дальше со звуком, новый
  // грузится под ним без звука на том же месте и подменяет его, когда видео в нём пошло (после рекламы).
  const playing = useRef<ShownFrame | null>(null)
  const settle = useRef<{ at: number; since: number; paused: boolean; tries: number } | null>(null)
  const [, dropHeld] = useState(0)
  if (frame?.key !== lastFrame.current?.key) {
    // Адрес новой озвучки бывает не готов сразу (серии Anixart ещё грузятся): прежний ждёт и этот промежуток.
    const prev = playing.current ?? lastFrame.current ?? held.current
    const kodikToKodik = !!prev && prev.src !== frame?.src && isKodik(prev.src)
    if (kodikToKodik && carry.current.at > 0 && (!frame || isKodik(frame.src))) {
      playing.current = prev
      held.current = null
    } else {
      playing.current = null
      held.current = kodikToKodik ? prev : null
    }
    lastFrame.current = frame
  }
  const hold = held.current
  const live = playing.current

  useEffect(() => {
    if (!live || !frame) return
    const box = frameRef.current
    const el = (role: string) => box?.querySelector<HTMLIFrameElement>(`iframe[data-role="${role}"]`)?.contentWindow
    const call = (win: Window | null | undefined, method: string, extra: Record<string, unknown> = {}) =>
      win?.postMessage({ key: 'kodik_player_api', value: { method, ...extra } }, '*')
    const expected = carry.current.at
    let paused = false
    let done = false
    // Kodik принимает команды, только когда его плеер создан: «без звука» повторяем, пока новый не подменит прежний.
    const hush = window.setInterval(() => call(el('next'), 'mute'), 250)
    const swap = (at: number) => {
      if (done) return
      done = true
      window.clearInterval(hush)
      const next = el('next')
      call(next, 'seek', { seconds: at })
      call(next, 'unmute')
      call(next, paused ? 'pause' : 'play')
      call(el('live'), 'pause')
      // Kodik сам перематывает на start_from, когда видео тронулось, и может перебить эту перемотку: пару секунд сверяем.
      settle.current = { at, since: performance.now(), paused, tries: 0 }
      // Прежний на паузе плавно уходит, новый уже на его месте и со звуком.
      held.current = playing.current
      playing.current = null
      dropHeld((n) => n + 1)
      window.setTimeout(release, 400)
    }
    let asked = 0
    const onMessage = (e: MessageEvent) => {
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string') return
      if (e.source === el('live')) {
        if (key === 'kodik_player_pause') paused = true
        if (key === 'kodik_player_play') paused = false
        // Точное время прежнего плеера — с него и продолжит новый (+ доля секунды на перемотку).
        if (key === 'kodik_player_time' && asked && typeof value === 'number') swap(value + (paused ? 0 : 0.3))
        return
      }
      if (e.source !== el('next')) return
      // В новом пошло само видео, а не реклама: его время рядом с тем, откуда он стартовал.
      // После video_started Kodik ещё перематывает на start_from, поэтому ждём первое время, а если его нет — 3 с.
      if (key === 'kodik_player_video_started' && !started) started = window.setTimeout(ready, 3000)
      if (key === 'kodik_player_time_update' && typeof value === 'number' && Math.abs(value - expected) < 30) ready()
    }
    let started = 0
    const ready = () => {
      if (asked) return
      asked = window.setTimeout(() => swap(playerTime()), 600)
      call(el('live'), 'get_time')
    }
    window.addEventListener('message', onMessage)
    // Новый так и не заиграл: показываем его как есть (реклама или своя кнопка «play»), прежний ставим на паузу.
    const giveUp = window.setTimeout(() => swap(playerTime()), 20000)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(hush)
      window.clearTimeout(giveUp)
      window.clearTimeout(asked)
      window.clearTimeout(started)
    }
  }, [live?.key, frame?.key])
  useLayoutEffect(() => {
    if (!hold) return
    const old = frameRef.current?.querySelector<HTMLIFrameElement>('iframe.player-iframe--old')
    old?.contentWindow?.postMessage({ key: 'kodik_player_api', value: { method: 'pause' } }, '*')
    // Новый так и не загрузился — прежний всё равно убираем, а под ним уже спиннер.
    const timer = window.setTimeout(release, 6000)
    return () => window.clearTimeout(timer)
  }, [hold?.key])
  // Вместо iframe включилось своё видео (AniLibria, AnimeVost): прежний убираем, когда поток готов.
  useEffect(() => {
    if (!loading && !frame) release()
  }, [loading, !frame])
  function release() {
    if (!held.current) return
    held.current = null
    dropHeld((n) => n + 1)
  }

  /* ─── Хелпер: iframe загрузился ─── */
  const onIframeLoad = useCallback((e: { currentTarget: HTMLIFrameElement }) => {
    setLoading(false)
    setError(null)
    // Новый плеер показался — даём ему проявиться поверх прежнего и убираем прежний.
    window.setTimeout(release, 400)
    // Зритель сам сменил серию или озвучку: запускаем Kodik, не заставляя жать «play» ещё раз.
    // Kodik на «play» до загрузки сам подгружает видео; браузер пускает звук, раз клик был на этой странице.
    const target = e.currentTarget.contentWindow
    // Новая озвучка под прежней: сначала без звука, а «play» после подмены решает, играть ли дальше.
    if (e.currentTarget.dataset.role === 'next') {
      target?.postMessage({ key: 'kodik_player_api', value: { method: 'mute' } }, '*')
      target?.postMessage({ key: 'kodik_player_api', value: { method: 'play' } }, '*')
      return
    }
    if (carry.current.user && target) {
      for (const delay of [0, 1200]) {
        window.setTimeout(() => target.postMessage({ key: 'kodik_player_api', value: { method: 'play' } }, '*'), delay)
      }
    }
  }, [])

  function renderFrames() {
    // Новый источник серию показать не может — на экране его пояснение, а не прежний плеер.
    const old = unavailable ? null : hold
    // Новый источник не может показать серию: прежний тоже убираем, иначе он играл бы за пояснением.
    const shown = unavailable ? null : live
    const next = shown && frame
    return [old, shown, frame].map(
      (f) =>
        f && (
          <iframe
            key={f.key}
            data-role={f === shown ? 'live' : f === next ? 'next' : undefined}
            className={`player-iframe${f === old ? ' player-iframe--old' : f === next ? ' player-iframe--prep' : old && loading ? ' player-iframe--wait' : ''}`}
            src={f.src}
            title={f.title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={f === old || f === next ? -1 : undefined}
            aria-hidden={f === old || f === next || undefined}
            onLoad={f === old || f === shown ? undefined : onIframeLoad}
          />
        ),
    )
  }

  function renderOwn() {
    if (!src) return null
    // Видео остаётся в DOM и при ошибке потока: эффект HLS привязан к нему.
    return (
      <>
        <video ref={videoRef} className="player-video" playsInline autoPlay hidden={!!streamError} />
        {enhance && !streamError && <canvas key={`${src}:${corsReload}`} ref={canvasRef} className="player-video player-canvas" aria-hidden="true" />}
      </>
    )
  }

  /* ─── Почему текущий источник не может показать серию (null — может) ─── */

  function unavailableReason(): string | null {
    if (!provider) return NO_SOURCES
    if ((provider === 'kodik' || provider === 'alloha' || provider === 'embed') && error) return error
    if (provider === 'kodik' && !kodikLink && !kodikEmbedUrl({ shikimoriId, kinopoiskId, imdbId, title, episode })) {
      return 'Kodik: токен не настроен или нет идентификатора тайтла'
    }
    if (provider === 'alloha' && !allohaEmbedUrl({ kinopoiskId, imdbId, episode })) {
      return 'Alloha: токен не настроен или нет Kinopoisk/IMDb ID'
    }
    if (provider === 'anixart') {
      if (error) return error
      if (!anixart) return NO_SOURCES
      if (!axEpisodes) return null
      return axEpisodes.has(episode) ? null : `Серии ${episode} пока нет в озвучке ${anixart.title}`
    }
    if (provider === 'embed') {
      if (!embed) return NO_SOURCES
      return embed.url ? null : `Серии ${episode} пока нет в плеере ${embed.player} (${embed.voice})`
    }
    if (provider === 'animevost') {
      if (avSearching) return null
      if (error) return error
      if (!avEpisodes) return null
      if (!avEp) return `Серии ${episode} пока нет в AnimeVost`
      return streamError && `${streamError} из ${SOURCE_NAME[provider]}`
    }
    if (provider !== 'anilibria' || alSearching) return null
    if (error) return error
    if (!alRelease) return null
    if (!alEp) return `Серии ${episode} пока нет в AniLibria`
    if (!alStream) return 'Нет доступного потока для этой серии'
    return streamError && `${streamError} из ${SOURCE_NAME[provider]}`
  }

  const unavailable = unavailableReason()
  // Сообщаем странице, что источник не справился, но не сразу: короткие промежуточные состояния не в счёт.
  const onUnavailable = useRef(props.onUnavailable)
  onUnavailable.current = props.onUnavailable
  useEffect(() => {
    if (!unavailable) return
    const timer = window.setTimeout(() => onUnavailable.current?.(unavailable), 1200)
    return () => window.clearTimeout(timer)
  }, [unavailable])
  // Кнопка смены источника — только когда переключаться есть куда.
  const other = tabs.find((t) => t.available && t.id !== provider && (!props.available || props.available.includes(t.id)))
  const switchButton = other && (
    <button type="button" className="btn btn--ghost btn--small" onClick={() => setProvider(other.id)}>
      Попробовать другой источник
    </button>
  )
  const alAvailable = alEp ? qualities.filter((q) => alEp[`hls_${q}` as const]) : []
  const ownEpisodes = provider === 'animevost' ? avEpisodes : alRelease?.episodes
  const ownSkips = provider === 'anilibria' && alEp ? episodeSkips(alEp) : []
  const hasNext = !!onEpisodeChange && episode < totalEpisodes && !!ownEpisodes?.some((e) => e.ordinal === episode + 1)
  useMediaSession(videoRef, !!stream && !unavailable, {
    title,
    episode,
    poster: props.poster,
    onNext: hasNext ? () => onEpisodeChange?.(episode + 1) : undefined,
    onPrev: onEpisodeChange && episode > 1 && ownEpisodes?.some((e) => e.ordinal === episode - 1) ? () => onEpisodeChange(episode - 1) : undefined,
  })
  const visibleTabs = tabs.filter((t) => t.available)
  const tabIndex = visibleTabs.findIndex((t) => t.id === provider)

  /* ─── Рендер ─── */

  return (
    <div className="video-player">
      {/* Табы переключения провайдера: подложка выбранного таба скользит между источниками (--i, --n) */}
      {!controlled && <div
        className="vp-tabs seg"
        role="tablist"
        aria-label="Источник видео"
        style={{ '--i': Math.max(0, tabIndex), '--n': visibleTabs.length } as CSSProperties}
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            className={`seg__item${tab.id === provider ? ' seg__item--on' : ''}`}
            aria-selected={tab.id === provider}
            onClick={() => setProvider(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>}

      {/* Контейнер плеера 16:9 */}
      <div className="player-frame" ref={frameRef}>
        {loading && !unavailable && !live && <Spinner over={!!hold} />}
        {live && frame && !unavailable && (
          <span className="player-tag player-tag--switch" role="status">
            Подключаем озвучку…
          </span>
        )}

        {renderFrames()}
        {provider === 'embed' && embed?.player === 'Aksor' && !unavailable && <AksorFullscreen frame={frameRef} />}
        {(provider === 'anilibria' || provider === 'animevost') && renderOwn()}
        {stream && !unavailable && (
          <PlayerControls
            video={videoRef}
            frame={frameRef}
            loading={loading}
            qualities={provider === 'animevost' ? avAvailable : alAvailable}
            quality={stream.quality}
            onQuality={(q) => {
              rememberQuality(q)
              setAlQuality(q)
            }}
            onNext={hasNext ? () => onEpisodeChange?.(episode + 1) : undefined}
            nextLabel={`${episode + 1} серия`}
            skips={ownSkips.length ? ownSkips : props.skips?.spans}
            skipsFor={ownSkips.length ? undefined : props.skips?.duration}
          />
        )}

        {shikimoriId && !unavailable && (provider !== 'anilibria' && provider !== 'animevost' ? true : !!stream) && (
          <Suspense fallback={null}>
            <Danmaku animeId={shikimoriId} episode={episode} />
          </Suspense>
        )}

        {resumed && !unavailable && (
          <div className="vp-resume" role="status">
            <span>Продолжили с {formatTime(resumed.at)}</span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                resumed.seek(0)
                setResumed(null)
              }}
            >
              С начала
            </button>
          </div>
        )}
        {kodikEnded && autoNext && !!onEpisodeChange && episode < totalEpisodes && !unavailable && (
          <AutoNext label={`${episode + 1} серия`} onNext={() => onEpisodeChange(episode + 1)} onCancel={() => setKodikEnded(false)} />
        )}

        {unavailable && (trailerUrl ? (
          <>
            <iframe
              className="player-iframe"
              src={trailerUrl}
              title={`Трейлер: ${title}`}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <span className="player-tag">Трейлер</span>
          </>
        ) : (
          <div className="vp-fallback">
            <p className="vp-fallback__text" role="status">{unavailable}.</p>
            {provider !== 'anilibria' && provider !== 'animevost' && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => { setError(null); setLoading(true); setFrameAttempt((n) => n + 1) }}>
                Повторить загрузку
              </button>
            )}
            {switchButton}
          </div>
        ))}
      </div>

      {/* Серию показать нечем: под трейлером поясняем почему */}
      {unavailable && trailerUrl && (
        <div className="notice vp-note">
          <span role="status">{unavailable} — вот трейлер.</span>
          {switchButton}
        </div>
      )}

    </div>
  )
}

/* ──────────────── Вспомогательные компоненты ──────────────── */

interface ShownFrame {
  src: string
  title: string
  key: string
}

/** Плеер Kodik (свой или из Anixart и YummyAnime): он понимает команды через postMessage и параметр start_from. */
function isKodik(src: string) {
  try {
    return /kodik/i.test(new URL(src).hostname)
  } catch {
    return false
  }
}

/** Kodik начнёт серию с этой секунды. У других плееров такого параметра нет. */
function withStart(src: string, seconds: number) {
  if (seconds < 3 || !isKodik(src)) return src
  const url = new URL(src)
  url.searchParams.set('start_from', String(Math.floor(seconds)))
  return url.toString()
}

/** over — под спиннером виден прежний плеер на паузе: фон полупрозрачный. */
function Spinner({ over }: { over?: boolean }) {
  return (
    <div className={`vp-spinner${over ? ' vp-spinner--over' : ''}`} aria-label="Загрузка…">
      <div className="vp-spinner__ring" />
    </div>
  )
}

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void }

/**
 * У плеера Aksor перепутаны значки: в окне он рисует «выйти из полного экрана», а на весь экран — «развернуть».
 * Его кнопки внутри чужого iframe не поправить, поэтому кладём поверх свою кнопку на то же место
 * (правый нижний угол, 15 и 8 px от краёв) и разворачиваем весь блок плеера сами.
 */
function AksorFullscreen({ frame }: { frame: RefObject<HTMLDivElement> }) {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const doc = document as FsDoc
    const sync = () => setFull(!!frame.current && (doc.fullscreenElement ?? doc.webkitFullscreenElement) === frame.current)
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [frame])
  // iPhone не разворачивает элементы страницы: там остаётся родная кнопка плеера.
  const el = frame.current as FsEl | null
  if (el && !el.requestFullscreen && !el.webkitRequestFullscreen) return null
  const toggle = () => {
    const doc = document as FsDoc
    const node = frame.current as FsEl | null
    if (doc.fullscreenElement || doc.webkitFullscreenElement) void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
    else if (node?.requestFullscreen) void node.requestFullscreen().catch(() => undefined)
    else node?.webkitRequestFullscreen?.()
  }
  return (
    <button type="button" className="vp-btn vp-akfs" aria-label={full ? 'Выйти из полноэкранного режима' : 'На весь экран'} onClick={toggle}>
      <FullscreenIcon exit={full} />
    </button>
  )
}
