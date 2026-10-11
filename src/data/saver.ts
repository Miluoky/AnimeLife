import { appearanceStore } from './theme'

/**
 * «Экономия трафика» для медленной связи и мобильного интернета: постеры без версии 2x,
 * без кадров в баннере, без предзагрузки страниц и тайтлов, без тяжёлых эффектов (data-lite на <html>).
 * «Авто» включает её сама, если браузер просит экономить трафик или сеть 2G.
 */
type Connection = { saveData?: boolean; effectiveType?: string }
const connection = () => (globalThis.navigator as (Navigator & { connection?: Connection }) | undefined)?.connection

export function slowNetwork() {
  const c = connection()
  return Boolean(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType ?? '')))
}

export function saverOn() {
  const mode = appearanceStore.get().saver ?? 'auto'
  return mode === 'on' || (mode === 'auto' && slowNetwork())
}

/** srcset «1x, 2x» для постера; в экономии трафика только 1x. */
export const srcset2x = (one: string | undefined, two: string | undefined) => (one && two && !saverOn() ? `${one} 1x, ${two} 2x` : undefined)

const QUALITY_KEY = 'anime.quality.v1'

/**
 * С какого качества начинать видео AniLibria и AnimeVost: выбранное зрителем раньше, иначе по сети.
 * В экономии трафика и на 3G — 480p, на мобильной сети с узким экраном — 720p, иначе 1080p.
 */
export function startQuality(): '480' | '720' | '1080' {
  try {
    const saved = localStorage.getItem(QUALITY_KEY)
    if (saved === '480' || saved === '720' || saved === '1080') return saved
  } catch {
    // Хранилище недоступно: выбираем по сети.
  }
  const c = connection() as (Connection & { type?: string }) | undefined
  if (saverOn() || c?.effectiveType === '3g') return '480'
  if (c?.type === 'cellular' || (globalThis.innerWidth ?? 1920) <= 600) return '720'
  return '1080'
}

/** Зритель сам выбрал качество: запоминаем для следующих серий. */
export function rememberQuality(q: string) {
  try {
    localStorage.setItem(QUALITY_KEY, q)
  } catch {
    // Без хранилища выбор живёт до конца серии.
  }
}
