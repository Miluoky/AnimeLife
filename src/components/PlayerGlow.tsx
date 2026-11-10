import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { useAppearance } from '../data/theme'
import { toast } from '../data/toast'
import { SparkIcon } from './Icons'
import './player-glow.css'

/**
 * Подсветка вокруг плеера, как Ambient Mode на YouTube: за экраном размытое свечение в цветах
 * постера (по умолчанию) или живого кадра.
 *
 * Своё видео / захват вкладки: раз в полсекунды кадр уменьшается до 32×18 на canvas, новый кадр
 * ложится поверх старого полупрозрачным. Пиксели не читаем — CORS не нужен.
 * Kodik и iframe: без захвата вкладки светит только постер. На компьютере кнопка «Свет из кадра»
 * включает getDisplayMedia (2 fps); Chrome/Edge обрезают до плеера (cropTo), Firefox/Safari — cropFor.
 *
 * Не монтируется без glow===true (см. Player.tsx). Выкл. в экономии трафика / data-lite и в мини-плеере.
 */
const W = 32
const H = 18

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
/** Захват есть во всех браузерах на компьютере. На телефонах его нет. */
export const canCaptureFrame = () =>
  // any-pointer: ноутбук с сенсорным экраном (Firefox на Windows) считает основным указателем палец, но мышь у него есть.
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && matchMedia('(any-pointer: fine)').matches

/**
 * Где на захваченной картинке экран плеера. Chrome/Edge обрезают сами (cropTo);
 * Firefox/Safari отдают окно/экран — режем по координатам плеера.
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
      monitorTypeSurfaces: 'exclude',
    } as DisplayMediaStreamOptions)
    const track = stream.getVideoTracks()[0] as Cropped
    const targets = cropTargets()
    let cropped = false
    if (targets && track.cropTo) {
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
  const { glow = false } = useAppearance()
  const active = useCapture()
  if (!canCaptureFrame() || !glow || lite()) return null
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

export default function PlayerGlow({ slot, poster }: { slot: RefObject<HTMLElement | null>; poster?: string; animeId: string }) {
  const { glow = false } = useAppearance()
  const on = glow === true && !lite()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
  const captured = useCapture()

  useEffect(() => stopCapture, [])
  useEffect(() => {
    if (!on) stopCapture()
  }, [on])

  // Живой кадр только при захвате вкладки («Свет из кадра»).
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d', { alpha: false })
    if (!(on && captured) || !ctx) return
    let shown = false
    const grabbed = document.createElement('video')
    grabbed.muted = true
    grabbed.srcObject = captured
    grabbed.play().catch(() => {})
    const tick = () => {
      const video = grabbed
      const ok =
        video.readyState >= 2 &&
        !document.hidden &&
        !document.fullscreenElement &&
        !slot.current?.classList.contains('video-slot--mini')
      if (ok && (!video.paused || !shown)) {
        try {
          ctx.globalAlpha = shown ? 0.45 : 1
          if (crop && video.videoWidth) ctx.drawImage(video, ...crop(video.videoWidth, video.videoHeight), 0, 0, W, H)
          else ctx.drawImage(video, 0, 0, W, H)
          shown = true
        } catch {
          shown = false
        }
      }
      if (video.readyState < 2) shown = false
      setLive(shown)
    }
    const t = setInterval(tick, 500)
    return () => {
      clearInterval(t)
      setLive(false)
      grabbed.srcObject = null
    }
  }, [on, slot, captured])

  if (!on) return null
  return (
    <div className="vp-glow" aria-hidden="true">
      {poster && (
        <img
          className="vp-glow__img"
          src={poster}
          alt=""
          decoding="async"
          loading="eager"
          // @ts-expect-error fetchpriority
          fetchpriority="high"
        />
      )}
      <canvas ref={canvas} width={W} height={H} className={`vp-glow__live${live ? ' vp-glow__live--on' : ''}`} hidden={!captured} />
    </div>
  )
}
