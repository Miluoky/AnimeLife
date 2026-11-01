import { createLocalStore } from './localStore'

/** Оформление открытого профиля: обложка, рамка аватара, цвет ника, витрина любимых тайтлов. */
export interface ProfileStyle {
  cover?: string
  coverUrl?: string
  avatarUrl?: string
  nameColor?: string
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

export interface FrameDef {
  id: string
  title: string
  level: number
  animated?: boolean
  desc?: string
}

/** Рамки открываются уровнем зрителя. Поддерживаются анимированные шейдерные эффекты. */
export const FRAMES: FrameDef[] = [
  { id: 'none', title: 'Без рамки', level: 1 },
  { id: 'accent', title: 'Акцент', level: 3 },
  { id: 'inferno', title: '🔥 Инферно', level: 5, animated: true, desc: 'Огненное вращающееся пламя' },
  { id: 'sakura', title: 'Сакура', level: 6 },
  { id: 'sakura_anim', title: '🌸 Сакура (аним.)', level: 8, animated: true, desc: 'Парящие розовые лепестки' },
  { id: 'gold', title: 'Золото', level: 10 },
  { id: 'cyber', title: '⚡ Киберпанк', level: 12, animated: true, desc: 'Неоновый глитч-импульс' },
  { id: 'neon', title: 'Неон', level: 15 },
  { id: 'lightning', title: '⚡ Молнии', level: 18, animated: true, desc: 'Электрические разряды' },
  { id: 'void', title: '🌀 Бездна', level: 22, animated: true, desc: 'Тёмно-фиолетовый вихрь' },
  { id: 'crown', title: '👑 Монарх', level: 25, animated: true, desc: 'Золотая корона с сиянием' },
  { id: 'legend', title: 'Легенда', level: 30, animated: true, desc: 'Космический спектральный ореол' },
]

export interface NameColorDef {
  id: string
  title: string
  color: string
}

export const NAME_COLORS: NameColorDef[] = [
  { id: 'default', title: 'Обычный', color: '#ffffff' },
  { id: 'neon-red', title: 'Неоновый красный', color: '#ff3366' },
  { id: 'cyber-purple', title: 'Кибер-фиолетовый', color: '#b24bf3' },
  { id: 'gold', title: 'Королевское золото', color: '#ffd700' },
  { id: 'emerald', title: 'Изумрудный', color: '#10b981' },
  { id: 'ice-blue', title: 'Ледяной лазурит', color: '#38bdf8' },
  { id: 'sunset', title: 'Закат', color: '#fb923c' },
]

export const profileStyleStore = createLocalStore<ProfileStyle>('anime.profilestyle.v1', {})
