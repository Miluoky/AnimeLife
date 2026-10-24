import { useEffect, useRef, useState, type RefObject } from 'react'
import { loadScreenshots } from '../api'
import { shotPreview } from '../api/shikimori'
import { onPlayerTime } from '../data/playerTime'
import { useAppearance } from '../data/theme'

/**
 * Подсветка вокруг плеера, как Ambient Mode на YouTube: за экраном размытое свечение в цветах того,
 * что сейчас на экране.
 *
 * Своё видео (AniLibria, AnimeVost): раз в полсекунды кадр уменьшается до 32×18 на canvas, новый кадр
 * ложится поверх старого полупрозрачным, поэтому цвет перетекает плавно. Пиксели не читаем, canvas только
 * показываем, так что CORS не нужен.
 * Kodik и другие плееры в iframe кадр не отдают. Тогда свет идёт от кадров тайтла с Shikimori: они медленно
 * сменяют друг друга по ходу серии (по времени Kodik, на паузе стоят), а до них — от постера.
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

export default function PlayerGlow({ slot, poster, animeId }: { slot: RefObject<HTMLElement | null>; poster?: string; animeId: string }) {
  const { glow = true, calm } = useAppearance()
  const on = glow && !lite()
  const moving = on && !calm && !still()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
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
    const tick = () => {
      const video = slot.current?.querySelector<HTMLVideoElement>('video.player-video:not([hidden])')
      const ok = !!video && video.readyState >= 2 && !document.hidden && !document.fullscreenElement && !slot.current?.classList.contains('video-slot--mini')
      if (ok && (!video.paused || !shown)) {
        try {
          ctx.globalAlpha = shown ? 0.45 : 1
          ctx.drawImage(video, 0, 0, W, H)
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
    }
  }, [moving, slot])

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
