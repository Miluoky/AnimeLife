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
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  searchTitle,
  episodeList,
  hlsUrl,
  bestQuality,
  type AniLibriaTitle,
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

/* ──────────────── Компонент ──────────────── */

export default function VideoPlayer(props: VideoPlayerProps) {
  const { title, originalTitle, shikimoriId, kinopoiskId, imdbId, episode } = props

  const tabs = buildTabs()
  // Выбираем первый доступный провайдер.
  const defaultProvider = tabs.find((t) => t.available)?.id ?? 'anilibria'
  const [provider, setProvider] = useState<Provider>(defaultProvider)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── AniLibria state ───
  const [alTitle, setAlTitle] = useState<AniLibriaTitle | null>(null)
  const [alEpisode, setAlEpisode] = useState(episode)
  const [alQuality, setAlQuality] = useState<AniLibriaQuality>('fhd')
  const [alSearching, setAlSearching] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<import('hls.js').default | null>(null)

  // Сброс загрузки при смене провайдера.
  useEffect(() => {
    setLoading(true)
    setError(null)
  }, [provider])

  // Синхронизация серии из пропсов.
  useEffect(() => setAlEpisode(episode), [episode])

  /* ─── Поиск AniLibria тайтла ─── */
  useEffect(() => {
    if (provider !== 'anilibria') return

    let cancelled = false
    setAlSearching(true)
    setError(null)

    // Ищем по русскому, потом по оригинальному названию.
    ;(async () => {
      try {
        let results = await searchTitle(title)
        if (results.length === 0 && originalTitle) {
          results = await searchTitle(originalTitle)
        }
        if (cancelled) return

        if (results.length > 0) {
          setAlTitle(results[0])
          setError(null)
        } else {
          setAlTitle(null)
          setError('Тайтл не найден в AniLibria. Попробуйте другой источник.')
        }
      } catch {
        if (!cancelled) setError('Не удалось подключиться к AniLibria.')
      } finally {
        if (!cancelled) {
          setAlSearching(false)
          setLoading(false)
        }
      }
    })()

    return () => { cancelled = true }
  }, [provider, title, originalTitle])

  /* ─── Инициализация HLS потока для AniLibria ─── */
  useEffect(() => {
    if (provider !== 'anilibria' || !alTitle) return

    const video = videoRef.current
    if (!video) return

    const episodes = episodeList(alTitle.player)
    const ep = episodes.find((e) => e.episode === alEpisode) ?? episodes[0]
    if (!ep) {
      setError('Серия не найдена в AniLibria.')
      return
    }

    const hls = ep.hls
    const chosen =
      hls[alQuality]
        ? { quality: alQuality, path: hls[alQuality]! }
        : bestQuality(hls)

    if (!chosen) {
      setError('Нет доступного потока для этой серии.')
      return
    }

    const src = hlsUrl(alTitle.player.host, chosen.path)

    // Убиваем предыдущий экземпляр.
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // HLS.js нужен только для браузеров без нативной поддержки HLS (Chrome, Firefox).
    // Safari поддерживает HLS нативно.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.addEventListener('loadedmetadata', () => setLoading(false), { once: true })
    } else {
      import('hls.js/light').then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          setError('Ваш браузер не поддерживает HLS-воспроизведение.')
          return
        }
        const instance = new Hls({ enableWorker: true, lowLatencyMode: false })
        hlsRef.current = instance
        instance.loadSource(src)
        instance.attachMedia(video)
        instance.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false))
        instance.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setError('Ошибка воспроизведения HLS-потока.')
        })
      })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [provider, alTitle, alEpisode, alQuality])

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
    if (!src) return <FallbackMessage msg="Kodik: токен не настроен или нет идентификатора тайтла." onSwitch={suggestSwitch} />
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
    if (!src) return <FallbackMessage msg="Alloha: токен не настроен или нет Kinopoisk/IMDb ID." onSwitch={suggestSwitch} />
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
    if (alSearching) return null // спиннер показывается через loading
    if (error) return <FallbackMessage msg={error} onSwitch={suggestSwitch} />
    if (!alTitle) return null

    const episodes = episodeList(alTitle.player)
    const currentHls = episodes.find((e) => e.episode === alEpisode)?.hls
    const qualities: AniLibriaQuality[] = ['fhd', 'hd', 'sd']
    const available = currentHls ? qualities.filter((q) => currentHls[q]) : []

    return (
      <>
        {/* Видео-элемент */}
        <video
          ref={videoRef}
          className="player-video"
          controls
          playsInline
          autoPlay
        />

        {/* Панель управления AniLibria: серия + качество */}
        <div className="al-controls">
          {/* Селектор серии */}
          <div className="al-control-group">
            <label className="al-label" htmlFor="al-episode">Серия</label>
            <select
              id="al-episode"
              className="al-select"
              value={alEpisode}
              onChange={(e) => setAlEpisode(Number(e.target.value))}
            >
              {episodes.map((ep) => (
                <option key={ep.episode} value={ep.episode}>
                  {ep.episode}{ep.name ? ` — ${ep.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Селектор качества */}
          {available.length > 1 && (
            <div className="al-control-group">
              <label className="al-label" htmlFor="al-quality">Качество</label>
              <select
                id="al-quality"
                className="al-select"
                value={alQuality}
                onChange={(e) => setAlQuality(e.target.value as AniLibriaQuality)}
              >
                {available.map((q) => (
                  <option key={q} value={q}>
                    {q === 'fhd' ? '1080p' : q === 'hd' ? '720p' : '480p'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </>
    )
  }

  /* ─── Фоллбэк при ошибке: предложить переключиться ─── */

  function suggestSwitch() {
    const other = tabs.find((t) => t.available && t.id !== provider)
    if (other) setProvider(other.id)
  }

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
        {loading && <Spinner />}

        {provider === 'kodik' && renderKodik()}
        {provider === 'alloha' && renderAlloha()}
        {provider === 'anilibria' && renderAniLibria()}
      </div>
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

function FallbackMessage({ msg, onSwitch }: { msg: string; onSwitch: () => void }) {
  return (
    <div className="vp-fallback">
      <p className="vp-fallback__text">{msg}</p>
      <button type="button" className="btn btn--ghost btn--small" onClick={onSwitch}>
        Попробовать другой источник
      </button>
    </div>
  )
}
