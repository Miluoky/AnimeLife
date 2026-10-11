import { createLocalStore } from './localStore'

/**
 * Оформление: тема и цвет акцента. Хранится в браузере и применяется атрибутами на <html>,
 * а стартовый скрипт в index.html ставит их до первой отрисовки, чтобы ничего не мигало.
 */
export type Theme = 'night' | 'oled'
export type Accent = 'rose' | 'teal' | 'amber' | 'violet'

export interface Appearance {
  theme: Theme
  accent: Accent
  /** без анимаций, даже если в системе они включены */
  calm: boolean
  /** экономия трафика: сама на медленной сети, всегда или никогда (src/data/saver.ts) */
  saver?: 'auto' | 'on' | 'off'
}

export const themes: { id: Theme; title: string; hint: string }[] = [
  { id: 'night', title: 'Ночной кинотеатр', hint: 'тёмно-синий фон' },
  { id: 'oled', title: 'Чёрный', hint: 'чистый чёрный для OLED-экранов' },
]

export const accents: { id: Accent; title: string; color: string }[] = [
  { id: 'rose', title: 'Розовый', color: '#ff5470' },
  { id: 'teal', title: 'Бирюзовый', color: '#4fd1c5' },
  { id: 'amber', title: 'Янтарный', color: '#f6ad55' },
  { id: 'violet', title: 'Фиолетовый', color: '#a78bfa' },
]

export const appearanceStore = createLocalStore<Appearance>('anime.appearance', {
  theme: 'night',
  accent: 'rose',
  calm: false,
})

export function applyAppearance(a: Appearance = appearanceStore.get()) {
  const root = document.documentElement
  root.dataset.theme = a.theme
  root.dataset.accent = a.accent
  root.dataset.calm = a.calm ? '1' : ''
  // Облегчённый режим: экономия трафика или слабый телефон (как стартовый скрипт в index.html).
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number })
  const slow = Boolean(c.connection && (c.connection.saveData || /(^|-)2g$/.test(c.connection.effectiveType ?? '')))
  const weak = Boolean(c.deviceMemory && c.deviceMemory <= 2)
  root.dataset.lite = a.saver === 'on' || (a.saver !== 'off' && (slow || weak)) ? '1' : ''
  const color = a.theme === 'oled' ? '#000000' : '#0a0a0c'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

export function setAppearance(patch: Partial<Appearance>) {
  const next = { ...appearanceStore.get(), ...patch }
  appearanceStore.set(next)
  applyAppearance(next)
}

export const useAppearance = appearanceStore.use
