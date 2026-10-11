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
