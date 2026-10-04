/**
 * Свои кнопки поверх HLS-видео AniLibria вместо системных: большая кнопка воспроизведения,
 * полоса перемотки с загруженным куском и подсказкой времени, громкость, качество, скорость,
 * полный экран, «картинка в картинке», двойное касание для перемотки и горячие клавиши.
 */
import { useEffect, useReducer, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import { FullscreenIcon, PauseIcon, PlayIcon, SkipIcon, VolumeIcon } from './Icons'
import type { AniLibriaQuality, SkipSpan } from '../api/anilibria'
import { createLocalStore } from '../data/localStore'

interface Props {
  video: RefObject<HTMLVideoElement>
  /** рамка плеера: её разворачиваем на весь экран, чтобы кнопки остались видны */
  frame: RefObject<HTMLDivElement>
  /** поток ещё не готов: вместо большой кнопки крутится загрузка */
  loading: boolean
  qualities: readonly AniLibriaQuality[]
  quality: AniLibriaQuality
  onQuality: (q: AniLibriaQuality) => void
  /** переход к следующей серии; кнопка появляется под конец серии */
  onNext?: () => void
  /** подпись кнопки следующей серии в углу, например «3 серия» */
  nextLabel?: string
  /** размеченные опенинг и эндинг: кнопка «Пропустить», метки на полосе и автопропуск */
  skips?: SkipSpan[]
}

/** Пропускать опенинг и эндинг самим: настройка зрителя, живёт в браузере. */
const autoSkipStore = createLocalStore('anime.autoskip.v1', false)
const SKIP_NAMES = { opening: 'опенинг', ending: 'эндинг' }
/** Включать следующую серию самим, когда эта закончилась: тоже настройка зрителя. */
export const autoNextStore = createLocalStore('anime.autonext.v1', true)
const AUTO_NEXT_SECONDS = 8

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void }
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

// Как на AniLife: от четверти скорости до тройной.
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3]
const SEEK_STEP = 10
const HIDE_AFTER = 2600
// Кнопка «Следующая серия» появляется за полторы минуты до конца — на титрах.
const NEXT_BEFORE = 90
// Таймер сна: через сколько минут поставить видео на паузу.
const SLEEP_MINUTES = [15, 30, 60, 90]
const HOTKEYS: [string, string][] = [
  ['Пробел K', 'Пауза и воспроизведение'],
  ['← →', 'Назад и вперёд на 5 секунд'],
  ['0…9', 'К началу, 10 %, 20 % … 90 % серии'],
  ['F', 'Во весь экран'],
  ['M', 'Выключить звук'],
  ['S', 'Пропустить опенинг или эндинг'],
  ['N', 'Следующая серия'],
  ['Shift+< Shift+>', 'Медленнее и быстрее'],
  ['?', 'Эта подсказка'],
]

export function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

function bufferedEnd(v: HTMLVideoElement) {
  for (let i = 0; i < v.buffered.length; i++) {
    if (v.buffered.start(i) <= v.currentTime + 0.5 && v.currentTime <= v.buffered.end(i)) return v.buffered.end(i)
  }
  return 0
}

export default function PlayerControls({ video, frame, loading, qualities, quality, onQuality, onNext, nextLabel, skips }: Props) {
  // Состояние берём прямо из <video>, а события лишь просят перерисовать кнопки.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const [active, setActive] = useState(true)
  const [menu, setMenu] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  // Подсказки: вспышка значка по центру и волна при перемотке двойным касанием.
  const [flash, setFlash] = useState<{ key: number; play: boolean } | null>(null)
  const [ripple, setRipple] = useState<{ key: number; side: 'back' | 'fwd' } | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const lastTap = useRef(0)
  const autoSkip = autoSkipStore.use()
  // Отрезки, которые уже пропустили сами: если зритель вернётся назад, второй раз не прыгаем.
  const autoSkipped = useRef(new Set<string>())
  const [skipNote, setSkipNote] = useState<{ key: number; span: SkipSpan } | null>(null)
  const bar = useRef<HTMLDivElement>(null)

  const v = video.current
  const duration = v && Number.isFinite(v.duration) ? v.duration : 0
  const time = v?.currentTime ?? 0
  const paused = v ? v.paused : true
  // Поток ещё не отдал даже длительность: показываем загрузку вместо кнопки.
  const notReady = loading || !v || v.readyState < 1
  const muted = !v || v.muted || v.volume === 0
  const fsEl = (document as FsDoc).fullscreenElement ?? (document as FsDoc).webkitFullscreenElement
  const fullscreen = !!fsEl && fsEl === frame.current
  const pip = typeof document !== 'undefined' && document.pictureInPictureEnabled

  useEffect(() => {
    const el = video.current
    if (!el) return
    const events = ['play', 'pause', 'timeupdate', 'durationchange', 'progress', 'volumechange', 'ratechange', 'ended', 'loadedmetadata']
    events.forEach((e) => el.addEventListener(e, refresh))
    const wait = () => setWaiting(true)
    const go = () => setWaiting(false)
    const fresh = () => autoSkipped.current.clear()
    el.addEventListener('loadstart', fresh)
    el.addEventListener('waiting', wait)
    el.addEventListener('playing', go)
    el.addEventListener('canplay', go)
    document.addEventListener('fullscreenchange', refresh)
    document.addEventListener('webkitfullscreenchange', refresh)
    refresh()
    return () => {
      events.forEach((e) => el.removeEventListener(e, refresh))
      el.removeEventListener('loadstart', fresh)
      el.removeEventListener('waiting', wait)
      el.removeEventListener('playing', go)
      el.removeEventListener('canplay', go)
      document.removeEventListener('fullscreenchange', refresh)
      document.removeEventListener('webkitfullscreenchange', refresh)
    }
  }, [video])

  // Кнопки прячутся через пару секунд без движения, пока видео идёт и меню закрыто.
  const poke = () => {
    setActive(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setActive(false), HIDE_AFTER)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const togglePlay = () => {
    const el = video.current
    if (!el) return
    const start = el.paused
    if (start) void el.play().catch(() => undefined)
    else el.pause()
    setFlash({ key: Date.now(), play: start })
    poke()
  }

  const seekBy = (delta: number) => {
    const el = video.current
    if (!el) return
    el.currentTime = Math.min(Math.max(0, el.currentTime + delta), el.duration || el.currentTime + delta)
    poke()
  }

  const toggleMute = () => {
    const el = video.current
    if (!el) return
    el.muted = !muted
    if (!el.muted && el.volume === 0) el.volume = 0.5
  }

  const toggleFullscreen = () => {
    const doc = document as FsDoc
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
      return
    }
    const el = frame.current as FsEl | null
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => undefined)
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen()
    // iPhone не умеет разворачивать элементы: на весь экран уходит само видео с системными кнопками.
    else (video.current as IosVideo | null)?.webkitEnterFullscreen?.()
  }

  const togglePip = () => {
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined)
    else void video.current?.requestPictureInPicture().catch(() => undefined)
  }

  const [rateNote, setRateNote] = useState<{ key: number; rate: number } | null>(null)
  const setRate = (r: number) => {
    const el = video.current
    if (!el) return
    el.defaultPlaybackRate = r
    el.playbackRate = r
  }
  useEffect(() => {
    if (!rateNote) return
    const t = setTimeout(() => setRateNote(null), 1200)
    return () => clearTimeout(t)
  }, [rateNote])
  // Таймер сна считает обычное время, а не время видео: на паузе он тоже идёт, как у телевизора.
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const [note, setNote] = useState<{ key: number; text: string; stay?: boolean } | null>(null)
  const setSleep = (min: number | null) => {
    setSleepAt(min ? Date.now() + min * 60_000 : null)
    setNote({ key: Date.now(), text: min ? `Таймер сна: ${min} мин` : 'Таймер сна выключен' })
  }
  useEffect(() => {
    if (!sleepAt) return
    const t = setTimeout(() => {
      const el = video.current
      el?.pause()
      setSleepAt(null)
      setNote({ key: Date.now(), text: 'Таймер сна: видео на паузе', stay: true })
      // Подпись держится, пока зритель снова не включит видео. Событие play из очереди, отправленное
      // ещё до паузы, приходит уже на стоящее видео: его пропускаем.
      const resumed = () => {
        if (!el || el.paused) return
        el.removeEventListener('play', resumed)
        setNote((n) => (n?.stay ? null : n))
      }
      el?.addEventListener('play', resumed)
    }, Math.max(0, sleepAt - Date.now()))
    return () => clearTimeout(t)
  }, [sleepAt, video])
  useEffect(() => {
    if (!note || note.stay) return
    // Убираем только ту подпись, для которой ставили таймер: если таймеры сработали пачкой
    // (вкладка спала), более новая подпись «на паузе» должна остаться.
    const t = setTimeout(() => setNote((n) => (n === note ? null : n)), 1200)
    return () => clearTimeout(t)
  }, [note])
  const sleepLeft = sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60_000)) : 0

  // Shift + > и Shift + < (как на YouTube): шаг по списку скоростей и короткая подсказка поверх видео.
  const stepRate = (dir: 1 | -1) => {
    const now = video.current?.playbackRate ?? 1
    const i = SPEEDS.findIndex((r) => r >= now - 0.001)
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.length - 1 : i) + dir))]
    setRate(next)
    setRateNote({ key: Date.now(), rate: next })
  }

  // Отрезок, который сейчас идёт; за секунду до конца кнопку уже не показываем.
  const spanNow = skips?.find((s) => time >= s.start && time < (duration ? Math.min(s.stop, duration) : s.stop) - 1)
  const skipTo = (span: SkipSpan) => {
    const el = video.current
    if (!el) return
    el.currentTime = Math.min(span.stop, el.duration || span.stop)
    poke()
  }
  const skipNow = () => spanNow && skipTo(spanNow)

  useEffect(() => {
    if (!autoSkip || !spanNow || paused) return
    const id = `${spanNow.kind}:${spanNow.start}`
    if (autoSkipped.current.has(id)) return
    autoSkipped.current.add(id)
    skipTo(spanNow)
    setSkipNote({ key: Date.now(), span: spanNow })
  })
  useEffect(() => {
    if (!skipNote) return
    const t = setTimeout(() => setSkipNote(null), 5000)
    return () => clearTimeout(t)
  }, [skipNote])

  // Горячие клавиши на компьютере: пробел/K, стрелки, F, M, S — пропустить опенинг или эндинг,
  // N — следующая серия, цифры — к 0–90 % серии, ? — подсказка со всеми клавишами.
  const [help, setHelp] = useState(false)

  // Серия закончилась: отсчёт до следующей, как на стримингах. «Отмена» — до конца этой серии.
  const autoNext = autoNextStore.use()
  const [counting, setCounting] = useState(false)
  const ended = !!v?.ended
  const hasNext = !!onNext
  useEffect(() => {
    setCounting(ended && hasNext && autoNext)
  }, [ended, hasNext, autoNext])
  const seekToPart = (part: number) => {
    const el = video.current
    if (!el) return
    const total = Number.isFinite(el.duration) ? el.duration : el.seekable.length ? el.seekable.end(el.seekable.length - 1) : 0
    if (!total) return
    el.currentTime = total * part
    poke()
  }
  const keys = useRef({ togglePlay, seekBy, toggleFullscreen, toggleMute, skipNow, stepRate, seekToPart, onNext, setHelp })
  keys.current = { togglePlay, seekBy, toggleFullscreen, toggleMute, skipNow, stepRate, seekToPart, onNext, setHelp }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || target?.closest('input, textarea, select, [contenteditable]')) return
      const inside = !!target && !!frame.current?.contains(target)
      // Пробел на чужой кнопке или ссылке нажимает её, а не ставит паузу.
      const onControl = !inside && !!target?.closest('button, a, [role="slider"]')
      const k = e.key.toLowerCase()
      const run = keys.current
      if ((k === ' ' && !onControl) || k === 'k' || k === 'л') run.togglePlay()
      else if (k === 'arrowleft' && !onControl) run.seekBy(-5)
      else if (k === 'arrowright' && !onControl) run.seekBy(5)
      else if (k === 'f' || k === 'а') run.toggleFullscreen()
      else if (k === 'm' || k === 'ь') run.toggleMute()
      else if (k === 's' || k === 'ы') run.skipNow()
      // По коду клавиши: в русской раскладке на этих местах «Ю» и «Б».
      else if (e.shiftKey && e.code === 'Period') run.stepRate(1)
      else if (e.shiftKey && e.code === 'Comma') run.stepRate(-1)
      else if (e.shiftKey && e.code === 'Slash') run.setHelp((h) => !h)
      else if (k === 'escape') run.setHelp(false)
      else if ((k === 'n' || k === 'т') && run.onNext) run.onNext()
      else if (/^Digit\d$/.test(e.code) && !e.shiftKey) run.seekToPart(Number(e.code.slice(5)) / 10)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [frame])

  /* ─── Полоса перемотки ─── */
  const ratioAt = (e: PointerEvent) => {
    const rect = bar.current!.getBoundingClientRect()
    return clamp((e.clientX - rect.left) / rect.width)
  }
  const onSeekDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    setPreview(ratioAt(e))
  }
  const onSeekMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging || e.pointerType === 'mouse') setPreview(ratioAt(e))
    poke()
  }
  const onSeekUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    const el = video.current
    if (el && duration) el.currentTime = ratioAt(e) * duration
    if (e.pointerType !== 'mouse') setPreview(null)
  }

  /* ─── Касания и клики по самому видео ─── */
  const onSurface = (e: PointerEvent<HTMLDivElement>) => {
    if (menu) return setMenu(false)
    if (e.pointerType === 'mouse') return togglePlay()
    // Двойное касание у края: ±10 секунд; одиночное — показать или спрятать кнопки.
    const now = Date.now()
    if (now - lastTap.current < 320) {
      const rect = e.currentTarget.getBoundingClientRect()
      const side = e.clientX - rect.left < rect.width / 2 ? 'back' : 'fwd'
      seekBy(side === 'back' ? -SEEK_STEP : SEEK_STEP)
      setRipple({ key: now, side })
      lastTap.current = 0
      return
    }
    lastTap.current = now
    if (active) {
      clearTimeout(hideTimer.current)
      setActive(false)
    } else poke()
  }

  const played = duration ? (dragging && preview !== null ? preview : time / duration) : 0
  const buffered = v && duration ? bufferedEnd(v) / duration : 0
  const hidden = !active && !paused && !menu && !dragging
  const nearEnd = !!onNext && duration > 0 && (duration - time < NEXT_BEFORE || !!v?.ended)

  return (
    <div
      className={`vp-ui${hidden ? ' vp-ui--hidden' : ''}`}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
      onMouseLeave={() => !paused && setActive(false)}
    >
      <div className="vp-surface" onPointerUp={onSurface} onDoubleClick={toggleFullscreen} aria-hidden="true" />

      {ripple && (
        <span key={ripple.key} className={`vp-ripple vp-ripple--${ripple.side}`} aria-hidden="true">
          {ripple.side === 'back' ? `−${SEEK_STEP}` : `+${SEEK_STEP}`} с
        </span>
      )}
      {flash && (
        <span key={flash.key} className="vp-flash" aria-hidden="true">
          {flash.play ? <PlayIcon size={36} /> : <PauseIcon size={36} />}
        </span>
      )}

      {notReady || (waiting && !paused) ? (
        <span className="vp-loader" role="status" aria-label="Загрузка…" />
      ) : (
        paused && !counting && (
          <button type="button" className="vp-big-play" aria-label="Смотреть" onClick={togglePlay}>
            <PlayIcon size={34} />
          </button>
        )
      )}

      {rateNote && (
        <div key={rateNote.key} className="vp-rate-note" role="status">
          {rateNote.rate === 1 ? 'Обычная скорость' : `Скорость ${rateNote.rate}×`}
        </div>
      )}

      {note && !rateNote && (
        <div key={note.key} className={`vp-rate-note${note.stay ? ' vp-rate-note--stay' : ''}`} role="status">
          {note.text}
        </div>
      )}

      {help && (
        <div className="vp-help" role="dialog" aria-label="Горячие клавиши" onPointerDown={(e) => e.stopPropagation()}>
          <div className="vp-help__head">
            <span>Горячие клавиши</span>
            <button type="button" className="vp-btn" aria-label="Закрыть" onClick={() => setHelp(false)}>
              ✕
            </button>
          </div>
          <dl className="vp-help__list">
            {HOTKEYS.map(([k, what]) => (
              <div key={k}>
                <dt>
                  {k.split(' ').map((x) => (
                    <kbd key={x}>{x}</kbd>
                  ))}
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {spanNow && !(spanNow.kind === 'ending' && nearEnd) && (
        <button type="button" className="btn btn--small vp-skip" onClick={skipNow}>
          Пропустить {SKIP_NAMES[spanNow.kind]}
          <SkipIcon />
        </button>
      )}
      {skipNote && !spanNow && (
        <div key={skipNote.key} className="vp-skip-note" role="status">
          {skipNote.span.kind === 'opening' ? 'Опенинг пропущен' : 'Эндинг пропущен'}
          <button
            type="button"
            onClick={() => {
              const el = video.current
              if (el) el.currentTime = skipNote.span.start
              setSkipNote(null)
            }}
          >
            Вернуть
          </button>
        </div>
      )}

      {/* Следующая серия всегда под рукой в углу, а под конец серии — большая кнопка. */}
      {onNext && !nearEnd && (
        <button type="button" className="vp-next-top" onClick={onNext} aria-label={`Следующая: ${nextLabel ?? 'серия'}`}>
          <span>{nextLabel ?? 'Дальше'}</span>
          <SkipIcon />
        </button>
      )}

      {counting && onNext ? (
        <AutoNext label={nextLabel} onNext={onNext} onCancel={() => setCounting(false)} />
      ) : (
        nearEnd && (
          <button type="button" className="btn btn--accent btn--small vp-next" onClick={onNext}>
            Следующая серия
            <SkipIcon />
          </button>
        )
      )}

      <div className="vp-bar">
        <div
          ref={bar}
          className="vp-seek"
          role="slider"
          tabIndex={0}
          aria-label="Перемотка"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatTime(time)} из ${formatTime(duration)}`}
          style={{ '--played': played, '--buffered': buffered } as CSSProperties}
          onPointerDown={onSeekDown}
          onPointerMove={onSeekMove}
          onPointerUp={onSeekUp}
          onPointerLeave={() => !dragging && setPreview(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault()
              e.stopPropagation()
              seekBy(e.key === 'ArrowLeft' ? -5 : 5)
            }
          }}
        >
          <span className="vp-seek__track" />
          {duration > 0 &&
            skips?.map((span) => (
              <span
                key={span.kind}
                className="vp-seek__mark"
                title={span.kind === 'opening' ? 'Опенинг' : 'Эндинг'}
                style={{ '--from': span.start / duration, '--to': Math.min(span.stop, duration) / duration } as CSSProperties}
              />
            ))}
          <span className="vp-seek__thumb" />
          {preview !== null && duration > 0 && (
            <span className="vp-seek__tip" style={{ '--at': preview } as CSSProperties}>
              {formatTime(preview * duration)}
            </span>
          )}
        </div>

        <div className="vp-row">
          <button type="button" className="vp-btn" aria-label={paused ? 'Смотреть' : 'Пауза'} onClick={togglePlay}>
            {paused ? <PlayIcon size={22} /> : <PauseIcon size={22} />}
          </button>
          <div className="vp-volume">
            <button type="button" className="vp-btn" aria-label={muted ? 'Включить звук' : 'Выключить звук'} onClick={toggleMute}>
              {muted ? <MutedIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              className="vp-volume__range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : v?.volume ?? 1}
              aria-label="Громкость"
              style={{ '--vol': muted ? 0 : v?.volume ?? 1 } as CSSProperties}
              onChange={(e) => {
                if (!v) return
                v.volume = Number(e.target.value)
                v.muted = v.volume === 0
              }}
            />
          </div>
          <span className="vp-time">
            {formatTime(time)} <span className="vp-time__total">/ {formatTime(duration)}</span>
          </span>
          <span className="vp-row__gap" />

          <div className="vp-menu-wrap">
            <button
              type="button"
              className={`vp-btn vp-btn--gear${menu ? ' vp-btn--on' : ''}`}
              aria-label="Качество и скорость"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <GearIcon />
              <span className="vp-badge">{sleepAt ? `☾ ${sleepLeft}′` : `${quality}p`}</span>
            </button>
            {menu && (
              <div
                className="vp-menu"
                role="group"
                aria-label="Качество и скорость"
                // На телефоне плеер невысокий: меню не выше рамки, остальное прокручивается внутри.
                style={{ maxHeight: frame.current ? Math.max(160, frame.current.clientHeight - 76) : undefined }}
              >
                {qualities.length > 1 && (
                  <>
                    <div className="vp-menu__title">Качество</div>
                    <div className="vp-menu__opts">
                      {qualities.map((q) => (
                        <button key={q} type="button" aria-pressed={q === quality} onClick={() => onQuality(q)}>
                          {q}p
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="vp-menu__title">Скорость</div>
                <div className="vp-menu__opts">
                  {SPEEDS.map((r) => (
                    <button key={r} type="button" aria-pressed={(v?.playbackRate ?? 1) === r} onClick={() => setRate(r)}>
                      {r === 1 ? 'Обычная' : `${r}×`}
                    </button>
                  ))}
                </div>
                <div className="vp-menu__title">Таймер сна{sleepAt ? ` · ${sleepLeft} мин` : ''}</div>
                <div className="vp-menu__opts">
                  <button type="button" aria-pressed={!sleepAt} onClick={() => setSleep(null)}>
                    Выкл
                  </button>
                  {SLEEP_MINUTES.map((m) => (
                    <button key={m} type="button" onClick={() => setSleep(m)}>
                      {m} мин
                    </button>
                  ))}
                </div>
                {onNext && (
                  <>
                    <div className="vp-menu__title">Следующая серия</div>
                    <div className="vp-menu__opts">
                      <button type="button" aria-pressed={autoNext} onClick={() => autoNextStore.set(true)}>
                        Включать сама
                      </button>
                      <button type="button" aria-pressed={!autoNext} onClick={() => autoNextStore.set(false)}>
                        Кнопкой
                      </button>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  className="vp-menu__link"
                  onClick={() => {
                    setMenu(false)
                    setHelp(true)
                  }}
                >
                  Горячие клавиши <kbd>?</kbd>
                </button>
                {!!skips?.length && (
                  <>
                    <div className="vp-menu__title">Опенинг и эндинг</div>
                    <div className="vp-menu__opts">
                      <button type="button" aria-pressed={!autoSkip} onClick={() => autoSkipStore.set(false)}>
                        Кнопкой
                      </button>
                      <button type="button" aria-pressed={autoSkip} onClick={() => autoSkipStore.set(true)}>
                        Пропускать сами
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {pip && (
            <button type="button" className="vp-btn vp-btn--pip" aria-label="Картинка в картинке" onClick={togglePip}>
              <PipIcon />
            </button>
          )}
          <button
            type="button"
            className="vp-btn"
            aria-label={fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
            onClick={toggleFullscreen}
          >
            <FullscreenIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Значки, которые нужны только плееру ─── */

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function MutedIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  )
}

function PipIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="11" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * Отсчёт до следующей серии, как на стримингах: через 8 секунд вызывает onNext. «Отмена» убирает отсчёт.
 * Общий для своего плеера и встроенного Kodik.
 */
export function AutoNext({ label, onNext, onCancel }: { label?: string; onNext: () => void; onCancel: () => void }) {
  const [left, setLeft] = useState(AUTO_NEXT_SECONDS)
  // Обработчик приходит новой функцией на каждой отрисовке родителя: держим его в ref, чтобы отсчёт не сбрасывался.
  const nextRef = useRef(onNext)
  nextRef.current = onNext
  useEffect(() => {
    if (left <= 0) {
      nextRef.current()
      return
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return (
    <div className="vp-autonext" role="status" style={{ '--vp-autonext': `${AUTO_NEXT_SECONDS}s` } as CSSProperties}>
      <span className="vp-autonext__text">
        {label ? `${label[0].toUpperCase()}${label.slice(1)}` : 'Следующая серия'} через {left}
      </span>
      <div className="vp-autonext__actions">
        <button type="button" className="btn btn--small btn--ghost" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn btn--accent btn--small" onClick={onNext}>
          Смотреть сейчас
          <SkipIcon />
        </button>
      </div>
      <span className="vp-autonext__bar" aria-hidden="true" />
    </div>
  )
}
