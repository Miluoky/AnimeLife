import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { loadScreenshots } from '../api'
import { shotPreview } from '../api/shikimori'
import { onPlayerTime } from '../data/playerTime'
import { useAppearance } from '../data/theme'
import { toast } from '../data/toast'
import { SparkIcon } from './Icons'

/**
 * Подсветка вокруг плеера, как Ambient Mode на YouTube: за экраном размытое свечение в цветах того,
 * что сейчас на экране.
 *
 * Своё видео (AniLibria, AnimeVost): раз в полсекунды кадр уменьшается до 32×18 на canvas, новый кадр
 * ложится поверх старого полупрозрачным, поэтому цвет перетекает плавно. Пиксели не читаем, canvas только
 * показываем, так что CORS не нужен.
 * Kodik и другие плееры в iframe кадр не отдают. Тогда свет идёт от кадров тайтла с Shikimori: они медленно
 * сменяют друг друга по ходу серии (по времени Kodik, на паузе стоят), а до них — от постера.
 * Настоящий кадр Kodik на компьютере (любой браузер): кнопка «Свет из кадра» просит показать эту вкладку
 * (getDisplayMedia), 2 кадра в секунду. Chrome и Edge обрезают захват до плеера сами (cropTo), в Firefox и Safari
 * плеер вырезается из окна или экрана по его координатам (см. cropFor).
 *
 * Выключается в «Оформлении», в экономии трафика и на слабых телефонах (data-lite), в мини-плеере.
 * При «Без анимаций» и prefers-reduced-motion свет неподвижный: только постер.
 */
const W = 32
const H = 18
/** Сколько секунд серии светит один кадр тайтла. */
const SHOT_SECONDS = 25

const still = () => document.documentElement.dataset.calm === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches
const lite = () => document.documentElement.dataset.lite === '1'

/* ─── Свет из кадра iframe: захват своей вкладки, обрезанный до экрана плеера ─── */
let capture: MediaStream | null = null
const capListeners = new Set<() => void>()
const setCapture = (stream: MediaStream | null) => {
  capture = stream
  capListeners.forEach((l) => l())
}
const stopCapture = () => {
  capture?.getTracks().forEach((t) => t.stop())
  setCapture(null)
}
const useCapture = () =>
  useSyncExternalStore(
    (l) => {
      capListeners.add(l)
      return () => capListeners.delete(l)
    },
    () => capture,
  )

type Cropped = MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> }
const cropTargets = () => (window as unknown as { CropTarget?: { fromElement(el: Element): Promise<unknown> } }).CropTarget
/** Захват есть во всех браузерах на компьютере (Chrome, Edge, Яндекс, Opera, Firefox, Safari). На телефонах его нет. */
export const canCaptureFrame = () =>
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !matchMedia('(pointer: coarse)').matches

/**
 * Где на захваченной картинке экран плеера. Chrome и Edge обрезают захват сами (cropTo), тогда это весь кадр.
 * Firefox и Safari отдают окно или весь экран: место плеера считаем по его положению в окне и окна на экране.
 * Рамку окна угадываем (сверху вкладки и адресная строка), для свечения 32×18 точность в десяток пикселей не важна.
 */
let crop: ((w: number, h: number) => [number, number, number, number]) | null = null
function cropFor(frame: Element, surface: string | undefined) {
  return (w: number, h: number): [number, number, number, number] => {
    const r = frame.getBoundingClientRect()
    const side = Math.max(0, (outerWidth - innerWidth) / 2)
    const top = Math.max(0, outerHeight - innerHeight - side)
    let x = r.left
    let y = r.top
    let base = innerWidth
    // Окно или экран: картинка шире видимой части страницы.
    const kind = surface ?? (Math.abs(w / h - screen.width / screen.height) < 0.02 ? 'monitor' : 'window')
    if (kind === 'window' || kind === 'monitor') {
      x += side
      y += top
      base = outerWidth
    }
    if (kind === 'monitor') {
      x += screenX - ((screen as Screen & { availLeft?: number }).availLeft ?? 0)
      y += screenY - ((screen as Screen & { availTop?: number }).availTop ?? 0)
      base = screen.width
    }
    const k = w / base
    return [x * k, y * k, r.width * k, r.height * k]
  }
}

async function startCapture(frame: Element) {
  let stream: MediaStream | undefined
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 2 },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      // Весь экран в Chrome не нужен: вкладку он обрежет до плеера сам. Firefox и Safari этот ключ не знают.
      monitorTypeSurfaces: 'exclude',
    } as DisplayMediaStreamOptions)
    const track = stream.getVideoTracks()[0] as Cropped
    const targets = cropTargets()
    let cropped = false
    if (targets && track.cropTo) {
      // cropTo работает только для этой же вкладки: выбрали окно или экран — режем сами.
      cropped = await track.cropTo(await targets.fromElement(frame)).then(() => true, () => false)
    }
    crop = cropped ? null : cropFor(frame, track.getSettings().displaySurface)
    track.addEventListener('ended', () => capture === stream && setCapture(null))
    setCapture(stream)
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop())
    if ((e as Error).name !== 'NotAllowedError') toast('Этот браузер не дал показать вкладку')
  }
}

/** Кнопка «Свет из кадра» у плееров в iframe: включает и выключает захват. */
export function GlowCaptureButton({ slot }: { slot: RefObject<HTMLElement | null> }) {
  const { glow = true, calm } = useAppearance()
  const active = useCapture()
  if (!canCaptureFrame() || !glow || calm || lite() || still()) return null
  return (
    <button
      type="button"
      className="btn btn--ghost watch-glow"
      aria-pressed={!!active}
      title={active ? 'Выключить свет из кадра' : 'Свет из кадра: подсветка вокруг видео в цветах того, что сейчас на экране. Браузер спросит разрешение показать вкладку (в Firefox и Safari — окно браузера)'}
      onClick={() => {
        const frame = slot.current?.querySelector('.player-frame')
        if (active) stopCapture()
        else if (frame) startCapture(frame)
      }}
    >
      <SparkIcon />
      <span className="sr-only">Свет из кадра</span>
    </button>
  )
}

export default function PlayerGlow({ slot, poster, animeId }: { slot: RefObject<HTMLElement | null>; poster?: string; animeId: string }) {
  const { glow = true, calm } = useAppearance()
  const on = glow && !lite()
  const moving = on && !calm && !still()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
  const captured = useCapture()
  // Ушли со страницы просмотра: захват вкладки больше не нужен.
  useEffect(() => stopCapture, [])
  const [shots, setShots] = useState<string[]>([])
  // Новый кадр проявляется поверх прежнего, прежний остаётся под ним.
  const [[under, shot], setPair] = useState<[string?, string?]>([])
  const setShot = (src?: string) => setPair(([, cur]) => (src ? [cur, src] : []))

  // Своё видео: кадр в canvas, пока оно играет и экран виден.
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d', { alpha: false })
    if (!moving || !ctx) return
    let shown = false
    let grabbed: HTMLVideoElement | undefined
    if (captured) {
      grabbed = document.createElement('video')
      grabbed.muted = true
      grabbed.srcObject = captured
      grabbed.play().catch(() => {})
    }
    const tick = () => {
      const video = grabbed ?? slot.current?.querySelector<HTMLVideoElement>('video.player-video:not([hidden])')
      const ok = !!video && video.readyState >= 2 && !document.hidden && !document.fullscreenElement && !slot.current?.classList.contains('video-slot--mini')
      if (ok && (!video.paused || !shown)) {
        try {
          ctx.globalAlpha = shown ? 0.45 : 1
          if (video === grabbed && crop && video.videoWidth) ctx.drawImage(video, ...crop(video.videoWidth, video.videoHeight), 0, 0, W, H)
          else ctx.drawImage(video, 0, 0, W, H)
          shown = true
        } catch {
          shown = false
        }
      }
      if (!video) shown = false
      setLive(shown)
    }
    const t = setInterval(tick, 500)
    return () => {
      clearInterval(t)
      setLive(false)
      if (grabbed) grabbed.srcObject = null
    }
  }, [moving, slot, captured])

  // Плеер в iframe: кадры тайтла, по одному на SHOT_SECONDS серии. Легкие копии (x332), грузим заранее.
  useEffect(() => {
    setShots([])
    setShot(undefined)
    if (!moving) return
    let alive = true
    loadScreenshots(animeId).then((list) => alive && setShots(list.slice(0, 12).map(shotPreview)))
    return () => {
      alive = false
    }
  }, [animeId, moving])

  useEffect(() => {
    if (!shots.length) return
    let index = -1
    let lastTime = 0
    const show = (i: number) => {
      if (i === index) return
      index = i
      const img = new Image()
      img.onload = () => index === i && setShot(img.src)
      img.src = shots[i]
    }
    const off = onPlayerTime((t) => {
      lastTime = Date.now()
      show(Math.floor(t / SHOT_SECONDS) % shots.length)
    })
    // Плееры, что не сообщают время (Alloha, Aksor, Sibnet): кадры просто сменяются.
    let n = 0
    const timer = setInterval(() => {
      if (document.hidden || Date.now() - lastTime < 10000) return
      show(n++ % shots.length)
    }, 14000)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [shots])

  if (!on) return null
  const top = shot ?? poster
  const below = shot ? (under ?? poster) : undefined
  return (
    <div className="vp-glow" aria-hidden="true">
      {below && <img key={below} className="vp-glow__img" src={below} alt="" decoding="async" />}
      {top && <img key={top} className="vp-glow__img vp-glow__img--in" src={top} alt="" decoding="async" />}
      <canvas ref={canvas} width={W} height={H} className={`vp-glow__live${live ? ' vp-glow__live--on' : ''}`} hidden={!moving} />
    </div>
  )
}
