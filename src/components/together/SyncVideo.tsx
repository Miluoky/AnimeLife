import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { YT_ENDED, YT_PAUSED, YT_PLAYING, loadYouTube, type YTPlayer } from './youtube'

/** Общий пульт для ролика YouTube, своего файла, потока сайта и плеера Kodik: комната управляет ими одинаково. */
export interface VideoControl {
  play(): void
  pause(): void
  seek(seconds: number): void
  time(): number
  paused(): boolean
  /** мягкая подстройка скорости, чтобы догнать комнату без рывка */
  rate(r: number): void
  /** плеер умеет менять скорость (своё видео и Kodik; YouTube — только ступенями, его догоняем перемоткой) */
  smooth(): boolean
  /** «плей» сразу за перемоткой стоящего плеера срабатывает (Kodik его пропускает: сначала включаем, потом перематываем) */
  seekThenPlay(): boolean
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

/**
 * Состояние iframe Kodik по его сообщениям. Само он присылает время целыми секундами (kodik_player_time_update),
 * это ошибка до секунды. Точное время с долями секунды отдаёт по запросу get_time (kodik_player_time),
 * его и спрашиваем дважды в секунду. Проверено на настоящем плеере Kodik.
 */
interface KodikState {
  time: number
  at: number
  playing: boolean
  rate: number
  /** когда последний раз пришло точное время */
  exact: number
  /** когда перематывали: ответы на get_time, отправленные до перемотки, ещё со старым временем */
  seekAt: number
  /** когда встал на паузу: ответы на get_time, ушедшие до паузы, ещё «идут» */
  pausedAt: number
}

/**
 * Сколько миллисекунд после команды комнаты события плеера считаем «эхом», а не действием человека.
 * Как на Senku: 1,8 секунды — после перемотки поток успевает догрузиться и прислать свои play/seek.
 */
const ECHO_MS = 1800

type Echo = 'play' | 'pause' | 'seek'
/** Какие события плеера вызывает наша команда: после перемотки плеер догружается и сам шлёт ещё и «плей». */
const ECHOES: Record<Echo, Echo[]> = { play: ['play'], pause: ['pause'], seek: ['seek', 'play'] }
/** Насколько перемотка Kodik может не совпасть с нашей командой и всё ещё быть её эхом (плеер округляет до кадра). */
const SEEK_ECHO_S = 2
/** Kodik принимает команды не сразу после загрузки страницы плеера, а когда поднимется его API. */
const KODIK_WARMUP_MS = 1500
/** Как часто спрашиваем у Kodik точное время. */
const KODIK_ASK_MS = 500
/** Сколько ждём точное время паузы от Kodik, прежде чем разослать прикидку. */
const PAUSE_EXACT_MS = 400

const SyncVideo = forwardRef<VideoControl, Props>(function SyncVideo(
  { source, videoId, file, src, title, onUserChange, onReady, onEnded },
  ref,
) {
  const host = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const kodik = useRef<KodikState>({ time: 0, at: 0, playing: false, rate: 1, exact: 0, seekAt: 0, pausedAt: 0 })
  const yt = useRef<YTPlayer | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  /** до какого момента события плеера считаем эхом своей команды — отдельно для плея, паузы и перемотки */
  const quietUntil = useRef<Record<Echo, number>>({ play: 0, pause: 0, seek: 0 })
  /** куда перематывали сами: эхом считается только перемотка Kodik в это же место */
  const seekTarget = useRef(0)
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

  // Глушим только эхо своей команды: пауза, нажатая зрителем сразу после нашей перемотки, — его действие,
  // и её надо разослать комнате (раньше глушилось всё подряд, и такая пауза терялась).
  const hush = (command: Echo) => {
    for (const e of ECHOES[command]) quietUntil.current[e] = Date.now() + ECHO_MS
  }
  const quiet = (kind: Echo) => Date.now() < quietUntil.current[kind]
  const report = (kind: Echo, playing: boolean, position: number) => {
    if (quiet(kind)) return
    changeRef.current({ playing, position })
  }

  useImperativeHandle(
    ref,
    () => ({
      play() {
        hush('play')
        if (frame.current) {
          kodikCall('play')
        } else if (yt.current) {
          yt.current.playVideo()
        } else if (video.current) {
          void video.current.play().catch(() => undefined)
        }
      },
      pause() {
        hush('pause')
        if (frame.current) {
          kodikCall('pause')
          kodik.current = { ...kodik.current, time: kodikTime(kodik.current), at: Date.now(), playing: false, pausedAt: Date.now() }
        } else if (yt.current) {
          yt.current.pauseVideo()
        } else if (video.current) {
          video.current.pause()
        }
      },
      seek(s) {
        hush('seek')
        seekTarget.current = s
        if (frame.current) {
          kodikCall('seek', { seconds: s })
          kodik.current = { ...kodik.current, time: s, at: Date.now(), seekAt: Date.now() }
        } else if (yt.current) {
          yt.current.seekTo(s, true)
        } else if (video.current) {
          video.current.currentTime = s
        }
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
        const k = kodik.current
        if (frame.current) {
          if (Math.abs(k.rate - r) < 0.001) return
          kodikCall('speed', { speed: r })
          kodik.current = { ...k, time: kodikTime(k), at: Date.now(), rate: r }
        } else if (video.current && Math.abs(video.current.playbackRate - r) > 0.001) {
          video.current.playbackRate = r
        }
      },
      smooth: () => !yt.current,
      seekThenPlay: () => !frame.current,
    }),
    [],
  )

  // Kodik: слушаем его события. Плей, пауза и перемотка руками в плеере уходят в комнату.
  useEffect(() => {
    if (source !== 'kodik') return
    kodik.current = { time: 0, at: Date.now(), playing: false, rate: 1, exact: 0, seekAt: 0, pausedAt: 0 }
    let askedAt = 0
    // Пауза зрителя: ждём точное время от плеера (get_time), а не прикидку по часам — иначе у ведущего
    // и гостей кадр паузы расходился на полсекунды. Не ответил быстро — шлём прикидку.
    let pausing: ReturnType<typeof setTimeout> | undefined
    const sendPause = (position: number) => {
      clearTimeout(pausing)
      pausing = undefined
      changeRef.current({ playing: false, position })
    }
    const ask = setInterval(() => {
      askedAt = Date.now()
      kodikCall('get_time')
    }, KODIK_ASK_MS)
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const { key, value } = (e.data ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string' || !key.startsWith('kodik_player_')) return
      const seconds = typeof value === 'number' ? value : Number((value as { time?: unknown } | null)?.time)
      const k = kodik.current
      const now = Date.now()
      if (key === 'kodik_player_time' && Number.isFinite(seconds)) {
        if (now - k.seekAt < KODIK_ASK_MS * 2) return
        // Ответ на get_time: время было снято примерно посередине между вопросом и ответом.
        if (pausing && !k.playing) {
          kodik.current = { ...k, time: seconds, at: now, exact: now }
          sendPause(seconds)
          return
        }
        const at = askedAt && now - askedAt < KODIK_ASK_MS ? (askedAt + now) / 2 : now
        // Ответы немного «дрожат» (плеер обновляет время пару раз в секунду): мелкую разницу сглаживаем,
        // чтобы скорость не дёргалась туда-сюда, а большую (перемотка, догрузка) принимаем сразу.
        const expected = kodikTime(k, at)
        // Стоял, а время пошло: зритель нажал плей в самом плеере, а событие kodik_player_play ещё в пути.
        // Сразу после паузы не верим: ответ мог уйти, пока видео ещё шло (так терялась пауза ведущего).
        const step = seconds - k.time
        const started = !k.playing && !!k.exact && now - k.exact < 1500 && now - k.pausedAt > 1500 && step > 0.3 && step < 1.5
        const time = Math.abs(seconds - expected) > 0.5 || !k.exact ? seconds : expected + (seconds - expected) * 0.3
        kodik.current = { ...k, time: started ? seconds : time, at, exact: now, playing: k.playing || started }
        if (started) report('play', true, seconds)
      } else if (key === 'kodik_player_time_update' && Number.isFinite(seconds)) {
        // Целые секунды: нужны, только если точное время давно не приходило или плеер прыгнул сам.
        if (now - k.exact > 3000 || Math.abs(seconds - kodikTime(k)) > 2) kodik.current = { ...k, time: seconds, at: now }
      } else if (key === 'kodik_player_play') {
        if (k.playing) return
        kodik.current = { ...k, playing: true, at: now, time: kodikTime(k) }
        report('play', true, kodikTime(kodik.current))
      } else if (key === 'kodik_player_pause') {
        kodik.current = { ...k, time: kodikTime(k), at: now, playing: false, pausedAt: now }
        if (quiet('pause')) return
        const guess = kodik.current.time
        clearTimeout(pausing)
        pausing = setTimeout(() => sendPause(guess), PAUSE_EXACT_MS)
        askedAt = now
        kodikCall('get_time')
      } else if (key === 'kodik_player_seek' && Number.isFinite(seconds)) {
        kodik.current = { ...k, time: seconds, at: now, seekAt: now }
        // Эхо — только перемотка туда, куда перематывали мы. Зритель перемотал в другое место сразу после
        // нашей подстройки к комнате — это его действие (раньше оно глохло, и комната оставалась на старом месте).
        if (quiet('seek') && Math.abs(seconds - seekTarget.current) < SEEK_ECHO_S) return
        changeRef.current({ playing: k.playing, position: seconds })
      } else if (key === 'kodik_player_speed_change') {
        const speed = Number((value as { speed?: unknown } | null)?.speed)
        if (speed > 0) kodik.current = { ...k, time: kodikTime(k), at: now, rate: speed }
      } else if (key === 'kodik_player_video_ended') {
        kodik.current = { ...k, playing: false }
        endedRef.current?.()
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      clearInterval(ask)
      clearTimeout(pausing)
      window.removeEventListener('message', onMessage)
    }
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
              if (e.data === YT_PLAYING) report('play', true, p.getCurrentTime())
              else if (e.data === YT_PAUSED || e.data === YT_ENDED) report('pause', false, p.getCurrentTime())
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
        onLoad={(e) => {
          const el = e.currentTarget
          window.setTimeout(() => el.isConnected && readyRef.current(), KODIK_WARMUP_MS)
        }}
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
      onPlay={(e) => {
        report('play', true, e.currentTarget.currentTime)
      }}
      onPause={(e) => {
        if (!e.currentTarget.seeking && !e.currentTarget.ended) report('pause', false, e.currentTarget.currentTime)
      }}
      onSeeked={(e) => {
        report('seek', !e.currentTarget.paused, e.currentTarget.currentTime)
      }}
      onEnded={() => endedRef.current?.()}
    />
  )
})

/** Где сейчас Kodik: последнее присланное время плюс сколько прошло с учётом скорости, если идёт. */
const kodikTime = (k: KodikState, now = Date.now()) => k.time + (k.playing && k.at ? ((now - k.at) / 1000) * k.rate : 0)

export default SyncVideo
