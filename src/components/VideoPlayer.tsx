/**
 * VideoPlayer — мульти-провайдерный плеерный блок.
 *
 * Поддерживает три источника:
 *   1. Kodik    — iframe-балансер, основной для СНГ.
 *   2. Alloha   — iframe-балансер, резервный.
 *   3. AniLibria — кастомный HLS-плеер через Hls.js, без рекламы.
 *
 * Провайдер переключается табами над видео. При смене текущий поток
 * останавливается, контейнер динамически монтирует нужный плеер.
 * Если ни один источник не может показать серию, вместо пустого экрана — трейлер с Shikimori.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  findRelease,
  episodeStream,
  qualities,
  type AniLibriaRelease,
  type AniLibriaQuality,
} from '../api/anilibria'
import {
  kodikEmbedUrl,
  allohaEmbedUrl,
  isBalancerAvailable,
} from '../api/balancers'

/* ──────────────── Типы ──────────────── */

export type Provider = 'kodik' | 'alloha' | 'anilibria'

export interface VideoPlayerProps {
  /** Название аниме для поиска в AniLibria и Kodik. */
  title: string
  /** Оригинальное (ромадзи) название для фоллбэка поиска. */
  originalTitle?: string
  /** Английское название — последний вариант поиска в AniLibria. */
  englishTitle?: string
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
  /** Переход к другой серии (выбор в панели AniLibria). */
  onEpisodeChange?: (episode: number) => void
  /** Embed-ссылка на трейлер: показывается, когда серию взять негде. */
  trailerUrl?: string
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
    // AniLibria всегда доступна — бесплатный публичный API.
    { id: 'anilibria', label: 'AniLibria (Без рекламы)', available: true },
  ]
}

const NO_SOURCES = 'Серий этого аниме пока нет в доступных источниках'
const PLAY_ERROR = 'Не удалось воспроизвести серию из AniLibria'

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
  const { title, originalTitle, englishTitle, shikimoriId, kinopoiskId, imdbId, episode, totalEpisodes, onEpisodeChange, trailerUrl } = props

  const tabs = buildTabs()
  // Выбранный ранее провайдер, иначе первый доступный; если источников нет вовсе — сразу трейлер.
  const [provider, setProviderState] = useState<Provider | undefined>(() => {
    const saved = savedProvider()
    return (tabs.find((t) => t.available && t.id === saved) ?? tabs.find((t) => t.available))?.id
  })
  const setProvider = (id: Provider) => {
    saveProvider(id)
    setProviderState(id)
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── AniLibria state ───
  const [alRelease, setAlRelease] = useState<AniLibriaRelease | null>(null)
  const [alQuality, setAlQuality] = useState<AniLibriaQuality>('1080')
  const [alSearching, setAlSearching] = useState(false)
  // Ошибка воспроизведения текущего потока (сбрасывается при смене потока).
  const [streamError, setStreamError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<import('hls.js').default | null>(null)

  // Сброс загрузки при смене провайдера.
  useEffect(() => {
    setLoading(true)
    setError(null)
  }, [provider])

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
        if (!release) setError(NO_SOURCES)
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

  // Серия и поток AniLibria для текущей страницы: без подмены на другую серию.
  const alEp = alRelease?.episodes.find((e) => e.ordinal === episode)
  const alStream = provider === 'anilibria' && alEp ? episodeStream(alEp, alQuality) : null
  const src = alStream?.url

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

    const onLoaded = () => setLoading(false)
    const onError = () => setStreamError(PLAY_ERROR)
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
        instance.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false))
        instance.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setStreamError(PLAY_ERROR)
        })
      }).catch(() => {
        if (!cancelled) setStreamError('Не удалось загрузить плеер AniLibria')
      })
    }

    return () => {
      cancelled = true
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
  }, [src])

  /* ─── Хелпер: iframe загрузился ─── */
  const onIframeLoad = useCallback(() => setLoading(false), [])

  /* ─── Рендер провайдеров ─── */

  function renderKodik() {
    const src = kodikEmbedUrl({
      shikimoriId,
      kinopoiskId,
      imdbId,
      title,
      episode,
    })
    if (!src) return null
    return (
      <iframe
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

  function renderAniLibria() {
    if (!src) return null
    // Видео остаётся в DOM и при ошибке потока: эффект HLS привязан к нему.
    return <video ref={videoRef} className="player-video" controls playsInline autoPlay hidden={!!streamError} />
  }

  /* ─── Почему текущий источник не может показать серию (null — может) ─── */

  function unavailableReason(): string | null {
    if (!provider) return NO_SOURCES
    if (provider === 'kodik' && !kodikEmbedUrl({ shikimoriId, kinopoiskId, imdbId, title, episode })) {
      return 'Kodik: токен не настроен или нет идентификатора тайтла'
    }
    if (provider === 'alloha' && !allohaEmbedUrl({ kinopoiskId, imdbId, episode })) {
      return 'Alloha: токен не настроен или нет Kinopoisk/IMDb ID'
    }
    if (provider !== 'anilibria' || alSearching) return null
    if (error) return error
    if (!alRelease) return null
    if (!alEp) return `Серии ${episode} пока нет в AniLibria`
    if (!alStream) return 'Нет доступного потока для этой серии'
    return streamError
  }

  const unavailable = unavailableReason()
  // Кнопка смены источника — только когда переключаться есть куда.
  const other = tabs.find((t) => t.available && t.id !== provider)
  const switchButton = other && (
    <button type="button" className="btn btn--ghost btn--small" onClick={() => setProvider(other.id)}>
      Попробовать другой источник
    </button>
  )
  const alAvailable = alEp ? qualities.filter((q) => alEp[`hls_${q}` as const]) : []

  /* ─── Рендер ─── */

  return (
    <div className="video-player">
      {/* Табы переключения провайдера */}
      <div className="vp-tabs" role="tablist" aria-label="Источник видео">
        {tabs.filter((t) => t.available).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            className={`vp-tab${tab.id === provider ? ' vp-tab--active' : ''}`}
            aria-selected={tab.id === provider}
            onClick={() => setProvider(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Контейнер плеера 16:9 */}
      <div className="player-frame">
        {loading && !unavailable && <Spinner />}

        {provider === 'kodik' && renderKodik()}
        {provider === 'alloha' && renderAlloha()}
        {provider === 'anilibria' && renderAniLibria()}

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

      {/* Панель управления AniLibria: серия + качество */}
      {alRelease && alStream && !unavailable && (
        <div className="al-controls">
          {/* Селектор серии: переключает страницу, чтобы заголовок и прогресс совпадали с видео */}
          {onEpisodeChange && (
            <div className="al-control-group">
              <label className="al-label" htmlFor="al-episode">Серия</label>
              <select
                id="al-episode"
                className="al-select"
                value={episode}
                onChange={(e) => onEpisodeChange(Number(e.target.value))}
              >
                {/* Только серии, которые есть на сайте: страница дальше последней вышедшей не откроется */}
                {alRelease.episodes.filter((ep) => ep.ordinal <= totalEpisodes).map((ep) => (
                  <option key={ep.ordinal} value={ep.ordinal}>
                    {ep.ordinal}{ep.name ? ` — ${ep.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Селектор качества */}
          {alAvailable.length > 1 && (
            <div className="al-control-group">
              <label className="al-label" htmlFor="al-quality">Качество</label>
              <select
                id="al-quality"
                className="al-select"
                value={alStream.quality}
                onChange={(e) => setAlQuality(e.target.value as AniLibriaQuality)}
              >
                {alAvailable.map((q) => (
                  <option key={q} value={q}>{q}p</option>
                ))}
              </select>
            </div>
          )}
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
