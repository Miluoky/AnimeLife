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

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react'
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
import PlayerControls, { AutoNext, autoNextStore, enhanceStore, formatTime } from './PlayerControls'
import { toast } from '../data/toast'
import { getPosition, savePosition } from '../data/positions'
import './player.css'
import {
  kodikEmbedUrl,
  kodikHost,
  allohaEmbedUrl,
  isBalancerAvailable,
} from '../api/balancers'
import { kodikTranslationUrl } from '../api/kodik'

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
  const [alQuality, setAlQuality] = useState<AniLibriaQuality>('1080')
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

  // Сброс загрузки при смене провайдера.
  useEffect(() => {
    setLoading(true)
    setError(null)
    setFrameAttempt(0)
  }, [provider, kodikLink, anixart?.type, embed?.url])

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
      const frame = frameRef.current?.querySelector('iframe')
      if (!frame || e.source !== frame.contentWindow) return
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string' || !key.startsWith('kodik_player_')) return
      const seconds = typeof value === 'number' ? value : Number((value as { time?: unknown } | null)?.time)
      if (key === 'kodik_player_duration_update' && Number.isFinite(seconds)) duration = seconds
      if (key === 'kodik_player_time_update' && Number.isFinite(seconds) && Math.abs(seconds - last) >= 5) {
        last = seconds
        savePosition(positionKey, episode, seconds, duration)
      }
      if ((key === 'kodik_player_video_started' || key === 'kodik_player_play') && !started) {
        started = true
        const source = e.source as Window
        const origin = e.origin
        resumeRef.current((t) => source.postMessage({ key: 'kodik_player_api', value: { method: 'seek', seconds: t } }, origin))
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

  /* ─── Хелпер: iframe загрузился ─── */
  const onIframeLoad = useCallback(() => {
    setLoading(false)
    setError(null)
  }, [])

  /* ─── Рендер провайдеров ─── */

  function renderKodik() {
    const src = kodikLink ? kodikTranslationUrl(kodikLink, episode, props.kodikSkips?.spans) : kodikEmbedUrl({
      shikimoriId,
      kinopoiskId,
      imdbId,
      title,
      episode,
    })
    if (!src) return null
    return (
      <iframe
        key={`${src}:${frameAttempt}`}
        className="player-iframe"
        src={src}
        title={`Kodik: ${title}`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={onIframeLoad}
      />
    )
  }

  function renderAlloha() {
    const src = allohaEmbedUrl({ kinopoiskId, imdbId, episode })
    if (!src) return null
    return (
      <iframe
        key={`${src}:${frameAttempt}`}
        className="player-iframe"
        src={src}
        title={`Alloha: ${title}`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={onIframeLoad}
      />
    )
  }

  function renderAnixart() {
    // Anixart отдаёт плееры Kodik: переводим их на рабочий домен, как и свои.
    const found = axEpisodes?.get(episode)
    if (!found) return null
    const src = kodikHost(found)
    return (
      <iframe
        key={`${src}:${frameAttempt}`}
        className="player-iframe"
        src={src}
        title={`${anixart?.title ?? 'Anixart'}: ${title}`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={onIframeLoad}
      />
    )
  }

  function renderEmbed() {
    if (!embed?.url) return null
    // Плееры Kodik из YummyAnime тоже открываем на рабочем домене Kodik; остальные адреса не меняются.
    const src = kodikHost(embed.url)
    return (
      <iframe
        key={`${src}:${frameAttempt}`}
        className="player-iframe"
        src={src}
        title={`${embed.voice}, плеер ${embed.player}: ${title}`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={onIframeLoad}
      />
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
        {loading && !unavailable && <Spinner />}

        {provider === 'kodik' && renderKodik()}
        {provider === 'alloha' && renderAlloha()}
        {provider === 'anixart' && renderAnixart()}
        {provider === 'embed' && renderEmbed()}
        {(provider === 'anilibria' || provider === 'animevost') && renderOwn()}
        {stream && !unavailable && (
          <PlayerControls
            video={videoRef}
            frame={frameRef}
            loading={loading}
            qualities={provider === 'animevost' ? avAvailable : alAvailable}
            quality={stream.quality}
            onQuality={setAlQuality}
            onNext={hasNext ? () => onEpisodeChange?.(episode + 1) : undefined}
            nextLabel={`${episode + 1} серия`}
            skips={ownSkips.length ? ownSkips : props.skips?.spans}
            skipsFor={ownSkips.length ? undefined : props.skips?.duration}
          />
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

function Spinner() {
  return (
    <div className="vp-spinner" aria-label="Загрузка…">
      <div className="vp-spinner__ring" />
    </div>
  )
}
