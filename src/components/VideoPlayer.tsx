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

import { rememberQuality, saverOn, slowNetwork, startQuality } from '../data/saver'
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
  /** Плееры других озвучек этой серии, которые стоит прогреть заранее (по убыванию популярности). */
  warm?: string[]
  /** Озвучка под курсором или пальцем: её греют первой, прогретую — перематывают на текущее место. */
  hint?: string
  /** Адрес следующей серии в плеере со стороны (YummyAnime): её тоже прогреваем ближе к концу. */
  nextEmbedUrl?: string
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
  // Помечены озвучкой: пока не пришли серии новой, адреса прежней не годятся (иначе на миг включилась бы она).
  const [axState, setAxEpisodes] = useState<{ key: string; urls: Map<number, string> } | null>(null)
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
    const timer = window.setTimeout(() => {
      // Новая озвучка ещё готовится, а прежняя играет: это не «плеер не ответил».
      if (pendingKey.current) return
      setError('Плеер не ответил вовремя. Возможно, источник или CDN заблокирован. Попробуйте другой плеер.')
    }, 15000)
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
  const axEpisodes = axState?.key === `${axRelease}:${axType}` ? axState.urls : null
  useEffect(() => {
    if (provider !== 'anixart' || !axRelease || !axType) return
    let cancelled = false
    setError(null)
    setAxEpisodes(null)
    anixartEpisodes(axRelease, axType)
      .then(({ urls: map }) => {
        if (cancelled) return
        setAxEpisodes({ key: `${axRelease}:${axType}`, urls: map })
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
      const frame = frameRef.current?.querySelector('iframe[data-role="live"]')
      if (!(frame instanceof HTMLIFrameElement) || e.source !== frame.contentWindow) return
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string' || !key.startsWith('kodik_player_')) return
      const seconds = typeof value === 'number' ? value : Number((value as { time?: unknown } | null)?.time)
      const state = liveState.current
      if (key === 'kodik_player_duration_update' && Number.isFinite(seconds)) duration = state.duration = seconds
      if (key === 'kodik_player_pause') state.paused = true
      if (key === 'kodik_player_play') state.paused = false
      // Зритель сам перемотал сразу после подмены: это не сбой Kodik, возвращать не нужно.
      const fix0 = settle.current
      if (key === 'kodik_player_seek' && fix0 && Number.isFinite(seconds)) {
        const want = fix0.at + (fix0.paused ? 0 : (performance.now() - fix0.since) / 1000)
        if (Math.abs(seconds - want) > 2.5 && Math.abs(seconds - fix0.start) > 2.5) settle.current = null
      }
      if (key === 'kodik_player_time_update' && Number.isFinite(seconds)) {
        emitPlayerTime(seconds)
        state.t = seconds
        state.at = performance.now()
        // Видео в показанном плеере пошло: можно греть остальные.
        const live = slotOf(liveKey.current)
        if (live && !live.ready && seconds > 0) live.ready = true
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
        savePosition(positionKey, episode, seconds, duration || state.duration)
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

  const frameSrc = (ep = episode): string | null => {
    if (provider === 'kodik') {
      if (ep !== episode) return kodikLink ? kodikTranslationUrl(kodikLink, ep) : null
      return kodikLink ? kodikTranslationUrl(kodikLink, episode, props.kodikSkips?.spans) : kodikEmbedUrl({ shikimoriId, kinopoiskId, imdbId, title, episode })
    }
    if (provider === 'alloha') return ep === episode ? allohaEmbedUrl({ kinopoiskId, imdbId, episode }) : null
    // Anixart и YummyAnime отдают плееры Kodik: переводим их на рабочий домен, как и свои; остальные адреса не меняются.
    if (provider === 'anixart') {
      const found = axEpisodes?.get(ep)
      return found ? kodikHost(found) : null
    }
    if (provider === 'embed') {
      const url = ep === episode ? embed?.url : props.nextEmbedUrl
      return url ? kodikHost(url) : null
    }
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

  /*
   * Пул плееров Kodik. Каждая озвучка серии — свой iframe; он не удаляется после смены, а остаётся прогретым:
   * реклама в нём уже прошла, видео стоит на паузе без звука. Смена на прогретую озвучку — перемотка на
   * текущее время и звук, без загрузки. Заранее (после старта серии) прогреваются озвучка под курсором,
   * популярные студии и следующая серия той же озвучки. Порядок iframe в DOM не меняется никогда:
   * перенос iframe браузер считает новой загрузкой. Чужие плееры (Alloha, CVH…) так не умеют: им нечем
   * сказать «пауза» и «без звука», поэтому их не греем и не держим.
   */
  const slots = useRef<Slot[]>([])
  const liveKey = useRef<string | null>(null)
  const pendingKey = useRef<string | null>(null)
  const heldKey = useRef<string | null>(null)
  const targetKey = useRef<string | null>(null)
  // Чужой плеер или своё видео на месте Kodik: прежний Kodik надо запустить заново, а не оставлять на паузе.
  const promoteKey = useRef<string | null>(null)
  const settle = useRef<{ at: number; since: number; paused: boolean; tries: number; start: number } | null>(null)
  // Что знаем о показанном плеере из его сообщений: длительность, пауза и последнее время с отметкой.
  const liveState = useRef({ duration: 0, paused: false, t: 0, at: 0 })
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)
  const slotOf = (key: string | null) => (key ? slots.current.find((s) => s.key === key) : undefined)
  const lastFrame = useRef<ShownFrame | null>(null)
  if (frame?.key !== lastFrame.current?.key) {
    lastFrame.current = frame
    const list = slots.current
    const live = slotOf(liveKey.current)
    const liveKodik = !!live && isKodik(live.src)
    if (!frame) {
      // Адрес новой озвучки бывает не готов сразу (серии Anixart ещё грузятся): прежний Kodik играет и этот промежуток.
      const iframeSource = provider === 'kodik' || provider === 'anixart' || provider === 'embed'
      if (!(liveKodik && iframeSource && carry.current.at > 0)) {
        slots.current = liveKodik ? [live!] : []
        heldKey.current = liveKodik ? live!.key : null
        liveKey.current = null
      }
      pendingKey.current = null
      targetKey.current = null
    } else {
      const base = baseOf(frame.src, frameAttempt)
      let slot = list.find((s) => s.base === base)
      const seamless = liveKodik && isKodik(frame.src) && (carry.current.at > 0 || !!slot?.ready)
      if (seamless) {
        if (!slot) {
          slot = newSlot(frame, base, episodeKey, carry.current.at)
          list.push(slot)
        }
        pendingKey.current = slot.key === liveKey.current ? null : slot.key
        // Озвучки другой серии больше не нужны, кроме показанной до подмены.
        slots.current = list.filter((s) => s.episode === episodeKey || s.key === liveKey.current)
        if (heldKey.current && heldKey.current !== liveKey.current) heldKey.current = null
      } else {
        // Обычная смена: прежний Kodik на паузе виден, пока новый не загрузится; прогретые сбрасываем.
        const held = liveKodik && live!.base !== base ? live! : null
        slot ??= newSlot(frame, base, episodeKey, carry.current.at)
        slots.current = held ? [held, slot] : [slot]
        // Другая серия: время прежней не в счёт (по нему грелись бы озвучки новой серии).
        if (slot.episode !== live?.episode) liveState.current = { duration: 0, paused: false, t: 0, at: 0 }
        if (slot.loaded && slot.key !== liveKey.current) promoteKey.current = slot.key
        slot.idle = false
        liveKey.current = slot.key
        heldKey.current = held?.key ?? null
        pendingKey.current = null
      }
      targetKey.current = slot.key
    }
  }
  const pending = slotOf(pendingKey.current)

  // Новый источник уже загружен (прогретая озвучка): ждать его onLoad не нужно.
  useEffect(() => {
    if (slotOf(targetKey.current)?.loaded) setLoading(false)
  }, [provider, kodikLink, anixart?.type, embed?.url, shikimoriId, episode, frame?.key])

  const send = (slot: Slot | undefined, method: string, extra: Record<string, unknown> = {}) =>
    frameRef.current
      ?.querySelector<HTMLIFrameElement>(`iframe[data-key="${CSS.escape(slot?.key ?? '')}"]`)
      ?.contentWindow?.postMessage({ key: 'kodik_player_api', value: { method, ...extra } }, '*')
  // Где сейчас показанный плеер: последнее время от него плюс прошедшее с тех пор, если он играет.
  const liveNow = () => {
    const s = liveState.current
    return s.at && !s.paused ? s.t + (performance.now() - s.at) / 1000 : s.t || playerTime()
  }

  // Подмена: новый (прогретый или только что загруженный) встаёт на место показанного с того же времени.
  // Пока новый перематывается, прежний играет со звуком: зритель не слышит паузы.
  const onReady = useRef<((s: Slot) => void) | null>(null)
  useEffect(() => {
    const next = slotOf(pendingKey.current)
    const live = slotOf(liveKey.current)
    if (!next || !live) return
    const sameEpisode = next.episode === live.episode
    const win = (s: Slot) => frameRef.current?.querySelector<HTMLIFrameElement>(`iframe[data-key="${CSS.escape(s.key)}"]`)?.contentWindow
    let done = false
    let asked = 0
    let moving = 0
    let target = 0
    const commit = () => {
      if (done) return
      done = true
      window.clearTimeout(moving)
      window.clearInterval(poll)
      window.clearInterval(retry)
      // Следующая серия играет, даже если прежняя уже кончилась (стоит на паузе).
      const paused = sameEpisode && liveState.current.paused
      send(next, 'unmute')
      send(next, paused ? 'pause' : 'play')
      next.paused = paused
      send(live, 'pause')
      send(live, 'mute')
      live.paused = true
      live.pos = liveNow()
      next.used = live.used = Date.now()
      liveKey.current = next.key
      pendingKey.current = null
      // Kodik сам перематывает на start_from, когда видео тронулось, и может перебить эту перемотку: пару секунд сверяем.
      settle.current = sameEpisode ? { at: target, since: performance.now(), paused, tries: 0, start: next.start } : null
      liveState.current = { duration: next.duration || (sameEpisode ? liveState.current.duration : 0), paused, t: target, at: performance.now() }
      if (sameEpisode) {
        // Прежняя озвучка остаётся прогретой: вернуться к ней — так же мгновенно.
        live.ready = true
      } else {
        // Прошлая серия больше не нужна: уходит, пока новая проявляется.
        heldKey.current = live.key
        window.setTimeout(release, 400)
      }
      setLoading(false)
      trim()
      rerender()
    }
    const go = (at: number) => {
      if (done || moving) return
      const paused = liveState.current.paused
      if (sameEpisode) {
        target = at + (paused ? 0 : SEEK_LEAD)
        send(next, 'seek', { seconds: Math.round(target * 10) / 10 })
        if (paused) return commit()
      } else {
        // Следующая серия прогрета с начала и стоит на первой секунде: пускаем оттуда, без перемотки —
        // перемотку в начало серии Kodik отдаёт рекламе и потом не слушает «play». Прежняя доигрывает,
        // пока новая не тронулась; откуда тронулась, узнаём по первому ответу get_time.
        target = -1
      }
      // «play» шлём всегда: новый мог стать готовым раньше, чем мы успели его запустить.
      send(next, 'play')
      next.paused = false
      // Пошёл ли новый, узнаём по его точному времени: time_update у Kodik приходит раз в секунду и целым числом.
      // Место уже в буфере — новый трогается за 0–0,4 с, далеко — за ~2 с; всё это время звучит прежний.
      poll = window.setInterval(() => {
        send(next, 'get_time')
        send(live, 'get_time')
      }, 150)
      moving = window.setTimeout(stall, 3500)
    }
    // Новый не тронулся за 3,5 с: в нём ещё идёт реклама (Kodik тогда не слушает «play»). Подмену отменяем —
    // прежний играет дальше со звуком, — и ждём, когда новый будет готов по-настоящему. Второй раз — показываем как есть.
    let aborted = false
    let retry = 0
    const stall = () => {
      if (aborted) return commit()
      aborted = true
      window.clearInterval(poll)
      moving = asked = 0
      next.ready = false
      next.t0 = undefined
      // Kodik не слушает «play», пока грузит рекламу: повторяем, пока видео в новом не пойдёт.
      send(next, 'play')
      retry = window.setInterval(() => !next.ready && send(next, 'play'), 1500)
      window.clearTimeout(giveUp)
      giveUp = window.setTimeout(() => go(liveNow()), 25000)
      rerender()
    }
    let poll = 0
    let caught = false
    const onMessage = (e: MessageEvent) => {
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (key !== 'kodik_player_time' || typeof value !== 'number') return
      if (e.source === win(live)) {
        liveState.current.t = value
        liveState.current.at = performance.now()
        if (asked && !moving) {
          window.clearTimeout(asked)
          go(value)
        }
        return
      }
      if (!moving || e.source !== win(next)) return
      if (target < 0) {
        target = value
        return
      }
      if (value < target + 0.15) return
      if (!sameEpisode) return commit()
      // Новый пошёл (время ушло дальше места перемотки, а не просто встало на него). Если перемотка была долгой, он отстал от прежнего: догоняем ещё раз — это место уже в буфере.
      const lag = liveNow() - value
      if (lag > 0.6 && !caught) {
        caught = true
        target = liveNow() + 0.35
        send(next, 'seek', { seconds: Math.round(target * 10) / 10 })
        return
      }
      if (lag < -1.5) return
      commit()
    }
    const start = () => {
      if (asked || done) return
      // Точное время показанного плеера — с него и продолжит новый. Нет ответа за 250 мс — считаем сами.
      send(live, 'get_time')
      asked = window.setTimeout(() => go(liveNow()), 250)
    }
    window.addEventListener('message', onMessage)
    onReady.current = (s) => s === next && start()
    if (next.ready) start()
    // Новый так и не заиграл: показываем его как есть (реклама или своя кнопка «play»).
    let giveUp = window.setTimeout(() => go(liveNow()), 20000)
    return () => {
      window.removeEventListener('message', onMessage)
      onReady.current = null
      window.clearTimeout(asked)
      window.clearTimeout(moving)
      window.clearInterval(poll)
      window.clearInterval(retry)
      window.clearTimeout(giveUp)
      // Подмену отменили (зритель выбрал другую), а прогретый мы уже пустили: снова на паузу, без звука.
      if (!done && moving && next.ready && next.key !== liveKey.current) {
        send(next, 'pause')
        send(next, 'mute')
        next.paused = true
      }
    }
  }, [pending?.key])

  // Плееры, которые не на экране: пока видео в них не пошло, держим без звука; пошло — ставим на паузу и считаем готовыми.
  useEffect(() => {
    const hush = window.setInterval(() => {
      for (const s of slots.current) if (s.loaded && !s.idle && (!s.ready || s.key === pendingKey.current) && s.key !== liveKey.current) send(s, 'mute')
    }, 250)
    const ready = (s: Slot) => {
      if (s.ready || s.idle || s.key === liveKey.current) return
      s.ready = s.loaded = true
      if (s.key !== pendingKey.current) {
        send(s, 'pause')
        s.paused = true
      }
      send(s, 'mute')
      onReady.current?.(s)
      rerender()
    }
    const onMessage = (e: MessageEvent) => {
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string' || !key.startsWith('kodik_player_')) return
      const box = frameRef.current
      const s = slots.current.find((x) => x.key !== liveKey.current && box?.querySelector<HTMLIFrameElement>(`iframe[data-key="${CSS.escape(x.key)}"]`)?.contentWindow === e.source)
      if (!s) return
      if (key === 'kodik_player_duration_update' && typeof value === 'number') s.duration = value
      // Готов — когда реклама позади (advert_ended приходит, даже если её не было) и время идёт. Пока реклама
      // не кончилась, Kodik не слушает «play» после паузы. Без advert_ended хватит 20 с идущего видео.
      if (key === 'kodik_player_advert_ended') s.ad = true
      // Время именно идёт: после перемотки на паузе Kodik тоже присылает одно время — место, куда встал.
      if (key === 'kodik_player_time_update' && typeof value === 'number') {
        s.t0 ??= value
        // Выбранная озвучка, которую не ставим на паузу, может подменить прежнюю и раньше: застрянет — подмена отменится.
        if ((s.ad && value !== s.t0) || value - s.t0 >= (s.key === pendingKey.current ? 3 : 20)) ready(s)
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(hush)
    }
  }, [])

  /** Лишние прогретые уходят: остаются показанный, готовящийся и самые недавние в пределах лимита. */
  function trim(room = 0) {
    const keep = new Set([liveKey.current, pendingKey.current, heldKey.current])
    const spare = slots.current.filter((s) => !keep.has(s.key)).sort((a, b) => b.used - a.used)
    const drop = new Set(spare.slice(Math.max(0, warmLimit() - room)))
    if (drop.size) slots.current = slots.current.filter((s) => !drop.has(s))
  }

  // Курсор на озвучке, которая уже прогрета: заранее перематываем её на текущее место, пока зритель не нажал.
  useEffect(() => {
    if (!props.hint) return
    const base = baseOf(kodikHost(props.hint), frameAttempt)
    const s = slots.current.find((x) => x.base === base && x.ready && x.key !== liveKey.current && x.episode === episodeKey)
    if (!s || liveState.current.paused || Math.abs(liveNow() + 2 - s.pos) < 10) return
    s.pos = liveNow() + 2
    s.sought = Date.now()
    send(s, 'seek', { seconds: Math.floor(s.pos) })
  }, [props.hint])

  useEffect(() => {
    const s = slotOf(promoteKey.current)
    promoteKey.current = null
    if (!s) return
    send(s, 'unmute')
    send(s, 'play')
    // Уже загружен — onLoad не будет: прежний уходит сразу, как новый проявился.
    window.setTimeout(release, 400)
  })
  useLayoutEffect(() => {
    const held = slotOf(heldKey.current)
    if (!held) return
    send(held, 'pause')
    // Новый так и не загрузился — прежний всё равно убираем, а под ним уже спиннер.
    const timer = window.setTimeout(release, 6000)
    return () => window.clearTimeout(timer)
  }, [heldKey.current])
  // Вместо iframe включилось своё видео (AniLibria, AnimeVost): прежний убираем, когда поток готов.
  useEffect(() => {
    if (!loading && !frame) release()
  }, [loading, !frame])
  function release() {
    const key = heldKey.current
    if (!key) return
    heldKey.current = null
    slots.current = slots.current.filter((s) => s.key !== key || s.key === liveKey.current)
    rerender()
  }

  /* ─── Хелпер: iframe загрузился ─── */
  const onIframeLoad = useCallback((e: { currentTarget: HTMLIFrameElement }) => {
    const el = e.currentTarget
    const slot = slots.current.find((s) => s.key === el.dataset.key)
    if (slot) slot.loaded = true
    const role = el.dataset.role
    const target = el.contentWindow
    if (slot?.idle && role === 'warm') return
    // Прогрев и новая озвучка под прежней: без звука проходят рекламу; «play» после подмены решает, играть ли дальше.
    if (role === 'warm' || role === 'next') {
      // Видео в нём уже пошло (Kodik прислал время раньше, чем страница догрузилась): не запускаем снова.
      if (!slot?.ready) {
        target?.postMessage({ key: 'kodik_player_api', value: { method: 'mute' } }, '*')
        target?.postMessage({ key: 'kodik_player_api', value: { method: 'play' } }, '*')
      }
      if (role === 'next') {
        setLoading(false)
        setError(null)
      }
      return
    }
    if (role !== 'live') return
    setLoading(false)
    setError(null)
    // Новый плеер показался — даём ему проявиться поверх прежнего и убираем прежний.
    window.setTimeout(release, 400)
    // Зритель сам сменил серию или озвучку: запускаем Kodik, не заставляя жать «play» ещё раз.
    // Kodik на «play» до загрузки сам подгружает видео; браузер пускает звук, раз клик был на этой странице.
    if (carry.current.user && target) {
      for (const delay of [0, 1200]) {
        window.setTimeout(() => target.postMessage({ key: 'kodik_player_api', value: { method: 'play' } }, '*'), delay)
      }
    }
  }, [])

  function renderFrames() {
    // Новый источник не может показать серию: на экране его пояснение, прежние и прогретые плееры убираем.
    const list = unavailable ? slots.current.filter((s) => s.key === targetKey.current) : slots.current
    const held = heldKey.current
    return list.map((s) => {
      const role = s.key === liveKey.current ? 'live' : s.key === pendingKey.current ? 'next' : s.key === held ? 'held' : 'warm'
      const hidden = role !== 'live'
      return (
        <iframe
          key={s.key}
          data-key={s.key}
          data-role={role}
          className={
            role === 'warm'
              ? 'player-warm'
              : `player-iframe${role === 'held' ? ' player-iframe--old' : role === 'next' ? ' player-iframe--prep' : held && loading ? ' player-iframe--wait' : ''}`
          }
          src={s.src}
          title={role === 'live' && s.key === targetKey.current ? frameTitle : s.title}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          tabIndex={hidden ? -1 : undefined}
          aria-hidden={hidden || undefined}
          onLoad={onIframeLoad}
        />
      )
    })
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

  // Прогрев заранее: по одному плееру, когда серия уже идёт. Сначала озвучка под курсором,
  // ближе к концу серии — следующая серия, затем популярные студии.
  const nextSrc = episode < totalEpisodes ? frameSrc(episode + 1) : null
  const wish = useRef<{ hint?: string; next: string | null; warm: string[] }>({ next: null, warm: [] })
  wish.current = { hint: props.hint, next: nextSrc, warm: props.warm ?? [] }
  const pooled = provider === 'kodik' || provider === 'anixart' || provider === 'embed'
  useEffect(() => {
    if (!pooled || unavailable) return
    const nextEpisode = `${shikimoriId}|${episode + 1}`
    const tick = () => {
      const live = slotOf(liveKey.current)
      if (!live?.ready || !isKodik(live.src) || pendingKey.current || document.hidden) return
      const now = Date.now()
      const t = liveNow()
      // Прогретые отстали: видео ушло дальше их буфера (Kodik держит ~30 с вперёд). Подтягиваем их на паузе
      // к текущему месту по одному, каждый не чаще раза в 45 с: такая перемотка — около 1,5 МБ. На телефоне —
      // только прежнюю озвучку, в «Экономии трафика» — никого.
      const close = saverOn() ? 0 : warmLimit() > 2 ? 3 : 1
      const back = slots.current
        .filter((s) => s !== live && s.ready && s.paused && s.episode === episodeKey)
        .sort((a, b) => b.used - a.used)
        .slice(0, close)
        .find((s) => (t - s.pos > 25 || t < s.pos - 1) && now - s.sought > 45000)
      if (back && !liveState.current.paused && now - live.used > 5000) {
        back.pos = t + 2
        back.sought = now
        send(back, 'seek', { seconds: Math.floor(back.pos) })
      }
      if (slots.current.some((s) => s !== live && !s.ready && !s.idle && now - s.since < 60000)) return
      const { hint, next, warm } = wish.current
      const { duration } = liveState.current
      const nearEnd = duration > 0 && (t / duration > 0.5 || duration - t < 360)
      const eager = !saverOn() && !slowNetwork() && now - live.used > 8000
      const order: [string, boolean][] = []
      if (hint) order.push([hint, false])
      if (next && nearEnd && !saverOn()) order.push([next, true])
      if (eager) for (const src of warm) order.push([src, false])
      for (const [raw, isNext] of order) {
        const src = kodikHost(raw)
        if (!isKodik(src)) continue
        const base = baseOf(src, frameAttempt)
        if (slots.current.some((s) => s.base === base)) continue
        const spare = slots.current.filter((s) => s.key !== liveKey.current && s.key !== heldKey.current).length
        if (spare >= warmLimit()) {
          // Озвучка под курсором и следующая серия важнее давно прогретых: те уступают место.
          if (raw !== hint && !isNext) return
          trim(1)
        }
        const start = isNext ? 0 : Math.floor(t)
        const slot = newSlot({ src: withStart(src, start), title: frameTitle, key: '' }, base, isNext ? nextEpisode : episodeKey, start)
        // Следующую серию только загружаем, не запуская: перемотку и паузу в начале серии Kodik отдаёт рекламе,
        // и запущенная заранее серия потом застывала. Готовый плеер на месте всё равно экономит его загрузку.
        slot.idle = isNext
        slots.current.push(slot)
        return rerender()
      }
    }
    const timer = window.setInterval(tick, 1500)
    return () => window.clearInterval(timer)
  }, [pooled, !!unavailable, shikimoriId, episode, frameAttempt, frameTitle])
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
        {loading && !unavailable && !pending && <Spinner over={!!heldKey.current} />}
        {pending && !pending.ready && !unavailable && (
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

/** Плеер Kodik в пуле: показан, готовится к подмене или прогрет про запас. */
interface Slot extends ShownFrame {
  /** озвучка и серия без start_from: по нему узнаём уже прогретый плеер */
  base: string
  /** id тайтла и серия */
  episode: string
  /** с какой секунды стартовал */
  start: number
  loaded: boolean
  /** видео в нём уже шло (реклама позади) */
  ready: boolean
  paused: boolean
  since: number
  /** где стоит на паузе и когда его туда перематывали */
  pos: number
  sought: number
  /** реклама в нём кончилась; первое время от него; длительность серии */
  ad?: boolean
  t0?: number
  /** только загружен, не запущен (следующая серия) */
  idle?: boolean
  duration?: number
  /** когда был на экране: из пула первым уходит давно не нужный */
  used: number
}

let slotSeq = 0
function newSlot(frame: ShownFrame, base: string, episode: string, start: number): Slot {
  return { ...frame, key: `${frame.src}#${++slotSeq}`, base, episode, start: Math.floor(start), pos: start, sought: 0, loaded: false, ready: false, paused: false, since: Date.now(), used: Date.now() }
}

/** Адрес плеера без места старта и кнопок пропуска: одна и та же озвучка той же серии. */
function baseOf(src: string, attempt: number) {
  try {
    const url = new URL(src)
    url.searchParams.delete('start_from')
    url.searchParams.delete('skip_button')
    return `${url}#${attempt}`
  } catch {
    return `${src}#${attempt}`
  }
}

/** Новый плеер перематываем чуть вперёд: пока он докачивает это место, прежний играет дальше. */
const SEEK_LEAD = 0.3

/**
 * Сколько прогретых плееров держать кроме показанного. Каждый на паузе всё равно докачивает
 * десяток секунд видео: на телефоне и в «Экономии трафика» — только прежнюю озвучку.
 */
function warmLimit() {
  if (saverOn() || slowNetwork()) return 1
  return matchMedia('(pointer: coarse)').matches || innerWidth < 760 ? 2 : 3
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
