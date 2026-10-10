import { createLocalStore } from './localStore'

/** Оформление открытого профиля: обложка, рамка аватара, витрина любимых тайтлов. */
export interface ProfileStyle {
  cover?: string
  frame?: string
  showcase?: string[]
}

export const COVERS: { id: string; title: string; css: string }[] = [
  { id: 'night', title: 'Ночной зал', css: 'linear-gradient(135deg,#1a0f1f,#3a1030 55%,#0a0a0c)' },
  { id: 'sakura', title: 'Сакура', css: 'linear-gradient(135deg,#ffb7c5,#e2557a 50%,#3b1530)' },
  { id: 'dusk', title: 'Закат', css: 'linear-gradient(135deg,#ff8a3d,#c2185b 55%,#2a0f3a)' },
  { id: 'ocean', title: 'Океан', css: 'linear-gradient(135deg,#00bcd4,#1e3a8a 60%,#0a0a1c)' },
  { id: 'forest', title: 'Лес', css: 'linear-gradient(135deg,#7bd389,#1f6f50 55%,#08201a)' },
  { id: 'neon', title: 'Неон', css: 'linear-gradient(135deg,#7c3aed,#ec4899 50%,#06b6d4)' },
]

/** Рамки открываются уровнем зрителя. */
export const FRAMES: { id: string; title: string; level: number }[] = [
  { id: 'none', title: 'Без рамки', level: 1 },
  { id: 'accent', title: 'Акцент', level: 3 },
  { id: 'sakura', title: 'Сакура', level: 6 },
  { id: 'gold', title: 'Золото', level: 10 },
  { id: 'neon', title: 'Неон', level: 15 },
  { id: 'legend', title: 'Легенда', level: 30 },
]

export const profileStyleStore = createLocalStore<ProfileStyle>('anime.profilestyle.v1', {})
