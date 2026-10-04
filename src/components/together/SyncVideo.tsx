import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { YT_ENDED, YT_PAUSED, YT_PLAYING, loadYouTube, type YTPlayer } from './youtube'

/** Общий пульт для ролика YouTube и для своего файла: комната управляет обоими одинаково. */
export interface VideoControl {
  play(): void
  pause(): void
  seek(seconds: number): void
  time(): number
  paused(): boolean
  /** мягкая подстройка скорости, чтобы догнать комнату без рывка (только для файла) */
  rate(r: number): void
}

interface Props {
  source: 'trailer' | 'file'
  videoId?: string
  file?: File | null
  title: string
  /** зритель сам нажал плей, паузу или перемотал */
  onUserChange: (state: { playing: boolean; position: number }) => void
  onReady: () => void
}

/** Сколько миллисекунд после команды комнаты события плеера считаем «эхом», а не действием человека. */
const ECHO_MS = 900

const SyncVideo = forwardRef<VideoControl, Props>(function SyncVideo(
  { source, videoId, file, title, onUserChange, onReady },
  ref,
) {
  const host = useRef<HTMLDivElement>(null)
  const yt = useRef<YTPlayer | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const quietUntil = useRef(0)
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const changeRef = useRef(onUserChange)
  changeRef.current = onUserChange
  const readyRef = useRef(onReady)
  readyRef.current = onReady

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
        if (yt.current) yt.current.playVideo()
        else void video.current?.play().catch(() => undefined)
      },
      pause() {
        hush()
        if (yt.current) yt.current.pauseVideo()
        else video.current?.pause()
      },
      seek(s) {
        hush()
        if (yt.current) yt.current.seekTo(s, true)
        else if (video.current) video.current.currentTime = s
      },
      time() {
        if (yt.current) return yt.current.getCurrentTime() || 0
        return video.current?.currentTime ?? 0
      },
      paused() {
        if (yt.current) return yt.current.getPlayerState() !== YT_PLAYING
        return video.current?.paused ?? true
      },
      rate(r) {
        if (video.current && Math.abs(video.current.playbackRate - r) > 0.001) video.current.playbackRate = r
      },
    }),
    [],
  )

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
  if (!url) return null
  return (
    <video
      ref={video}
      className="player-iframe sync-file"
      src={url}
      controls
      playsInline
      onLoadedMetadata={() => readyRef.current()}
      onPlay={(e) => report(true, e.currentTarget.currentTime)}
      onPause={(e) => !e.currentTarget.seeking && report(false, e.currentTarget.currentTime)}
      onSeeked={(e) => report(!e.currentTarget.paused, e.currentTarget.currentTime)}
    />
  )
})

export default SyncVideo
