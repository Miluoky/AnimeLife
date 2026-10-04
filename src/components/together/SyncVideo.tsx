import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { YT_ENDED, YT_PAUSED, YT_PLAYING, loadYouTube, type YTPlayer } from './youtube'

/** Общий пульт для ролика YouTube, своего файла, потока сайта и плеера Kodik: комната управляет ими одинаково. */
export interface VideoControl {
  play(): void
  pause(): void
  seek(seconds: number): void
  time(): number
  paused(): boolean
  /** мягкая подстройка скорости, чтобы догнать комнату без рывка (только для своего видео) */
  rate(r: number): void
  /** время известно лишь примерно (Kodik сообщает его раз в секунду): мелкие расхождения не трогаем */
  coarse(): boolean
}

interface Props {
  /** video — поток AniLibria или AnimeVost в нашем <video>; kodik — iframe плеера Kodik с его postMessage API */
  source: 'trailer' | 'file' | 'video' | 'kodik'
  videoId?: string
  file?: File | null
  /** адрес потока (video) или страницы плеера (kodik) */
  src?: string
  title: string
  /** зритель сам нажал плей, паузу или перемотал */
  onUserChange: (state: { playing: boolean; position: number }) => void
  onReady: () => void
  /** серия кончилась */
  onEnded?: () => void
}

/** Состояние iframe Kodik по его сообщениям: время приходит само, раз в секунду. */
interface KodikState {
  time: number
  at: number
  playing: boolean
}

/** Сколько миллисекунд после команды комнаты события плеера считаем «эхом», а не действием человека. */
const ECHO_MS = 900

const SyncVideo = forwardRef<VideoControl, Props>(function SyncVideo(
  { source, videoId, file, src, title, onUserChange, onReady, onEnded },
  ref,
) {
  const host = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const kodik = useRef<KodikState>({ time: 0, at: 0, playing: false })
  const yt = useRef<YTPlayer | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const quietUntil = useRef(0)
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const changeRef = useRef(onUserChange)
  changeRef.current = onUserChange
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  const kodikCall = (method: string, extra: Record<string, unknown> = {}) =>
    frame.current?.contentWindow?.postMessage({ key: 'kodik_player_api', value: { method, ...extra } }, '*')

  const hush = () => {
    quietUntil.current = Date.now() + ECHO_MS
  }
  const report = (playing: boolean, position: number) => {
    if (Date.now() < quietUntil.current) return
    changeRef.current({ playing, position })
  }

  useImperativeHandle(
    ref,
    () => ({
      play() {
        hush()
        if (frame.current) {
          // Пока Kodik не подтвердил плей событием, комната повторит команду через секунду.
          kodikCall('play')
        } else if (yt.current) yt.current.playVideo()
        else void video.current?.play().catch(() => undefined)
      },
      pause() {
        hush()
        if (frame.current) {
          kodikCall('pause')
          kodik.current = { time: kodikTime(kodik.current), at: Date.now(), playing: false }
        } else if (yt.current) yt.current.pauseVideo()
        else video.current?.pause()
      },
      seek(s) {
        hush()
        if (frame.current) {
          kodikCall('seek', { seconds: s })
          kodik.current = { ...kodik.current, time: s, at: Date.now() }
        } else if (yt.current) yt.current.seekTo(s, true)
        else if (video.current) video.current.currentTime = s
      },
      time() {
        if (frame.current) return kodikTime(kodik.current)
        if (yt.current) return yt.current.getCurrentTime() || 0
        return video.current?.currentTime ?? 0
      },
      paused() {
        if (frame.current) return !kodik.current.playing
        if (yt.current) return yt.current.getPlayerState() !== YT_PLAYING
        return video.current?.paused ?? true
      },
      rate(r) {
        if (video.current && Math.abs(video.current.playbackRate - r) > 0.001) video.current.playbackRate = r
      },
      coarse: () => !!frame.current,
    }),
    [],
  )

  // Kodik: слушаем его события. Плей, пауза и перемотка руками в плеере уходят в комнату.
  useEffect(() => {
    if (source !== 'kodik') return
    kodik.current = { time: 0, at: Date.now(), playing: false }
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string' || !key.startsWith('kodik_player_')) return
      const seconds = typeof value === 'number' ? value : Number((value as { time?: unknown } | null)?.time)
      const k = kodik.current
      if (key === 'kodik_player_time_update' && Number.isFinite(seconds)) kodik.current = { ...k, time: seconds, at: Date.now() }
      else if (key === 'kodik_player_play') {
        kodik.current = { ...k, playing: true, at: Date.now(), time: kodikTime(k) }
        report(true, kodikTime(kodik.current))
      } else if (key === 'kodik_player_pause') {
        kodik.current = { time: kodikTime(k), at: Date.now(), playing: false }
        report(false, kodik.current.time)
      } else if (key === 'kodik_player_seek' && Number.isFinite(seconds)) {
        kodik.current = { ...k, time: seconds, at: Date.now() }
        report(k.playing, seconds)
      } else if (key === 'kodik_player_video_ended') {
        kodik.current = { ...k, playing: false }
        endedRef.current?.()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, src])

  // Поток сайта: mp4 браузер играет сам, HLS — сам Safari, остальным нужен hls.js.
  useEffect(() => {
    const v = video.current
    if (source !== 'video' || !src || !v) return
    let hls: { destroy(): void } | null = null
    let dead = false
    if (/\.mp4(\?|$)/.test(src) || v.canPlayType('application/vnd.apple.mpegurl')) v.src = src
    else
      import('hls.js/light')
        .then(({ default: Hls }) => {
          if (dead) return
          if (!Hls.isSupported()) return setFailed(true)
          const instance = new Hls({ enableWorker: true })
          hls = instance
          instance.loadSource(src)
          instance.attachMedia(v)
          instance.on(Hls.Events.ERROR, (_, data) => data.fatal && setFailed(true))
        })
        .catch(() => setFailed(true))
    return () => {
      dead = true
      hls?.destroy()
      v.removeAttribute('src')
      v.load()
    }
  }, [source, src])


  // YouTube: плеер создаётся заново, если сменился ролик.
  useEffect(() => {
    if (source !== 'trailer' || !videoId || !host.current) return
    let dead = false
    const mount = document.createElement('div')
    host.current.replaceChildren(mount)
    loadYouTube()
      .then((YT) => {
        if (dead) return
        yt.current = new YT.Player(mount, {
          videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1, origin: location.origin },
          events: {
            onReady: () => readyRef.current(),
            onStateChange: (e) => {
              const p = yt.current
              if (!p) return
              if (e.data === YT_PLAYING) report(true, p.getCurrentTime())
              else if (e.data === YT_PAUSED || e.data === YT_ENDED) report(false, p.getCurrentTime())
            },
          },
        })
      })
      .catch(() => setFailed(true))
    return () => {
      dead = true
      yt.current?.destroy()
      yt.current = null
    }
  }, [source, videoId])

  // Свой файл: ссылка на него живёт, пока файл выбран.
  useEffect(() => {
    if (source !== 'file' || !file) return setUrl(undefined)
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [source, file])

  if (source === 'trailer') {
    if (!videoId || failed)
      return (
        <div className="player-empty">
          <span className="art-label">{failed ? 'YouTube не загрузился' : 'У тайтла нет трейлера'}</span>
        </div>
      )
    return <div ref={host} className="player-iframe sync-yt" title={title} />
  }
  if (source === 'kodik') {
    if (!src) return null
    return (
      <iframe
        key={src}
        ref={frame}
        className="player-iframe"
        src={src}
        title={`Плеер: ${title}`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => readyRef.current()}
      />
    )
  }
  if (source === 'video' && failed)
    return (
      <div className="player-empty">
        <span className="art-label">Серия не загрузилась. Ведущий может выбрать другую озвучку.</span>
      </div>
    )
  const own = source === 'file' ? url : src
  if (!own) return null
  return (
    <video
      ref={video}
      className="player-iframe sync-file"
      src={source === 'file' ? url : undefined}
      controls
      playsInline
      onLoadedMetadata={() => readyRef.current()}
      onPlay={(e) => report(true, e.currentTarget.currentTime)}
      onPause={(e) => !e.currentTarget.seeking && !e.currentTarget.ended && report(false, e.currentTarget.currentTime)}
      onSeeked={(e) => report(!e.currentTarget.paused, e.currentTarget.currentTime)}
      onEnded={() => endedRef.current?.()}
    />
  )
})

/** Где сейчас Kodik: последнее присланное время плюс сколько прошло, если идёт. */
const kodikTime = (k: KodikState) => k.time + (k.playing && k.at ? (Date.now() - k.at) / 1000 : 0)

export default SyncVideo
