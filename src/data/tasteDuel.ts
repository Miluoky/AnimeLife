/** Дуэль вкуса живёт в sessionStorage: код открывается в этом сеансе браузера, без сервера. */
const KEY = 'anime.duel.v1'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface DuelTitle {
  id: string
  title: string
  posterUrl?: string
  posterFill?: string
  year?: number
}

export interface DuelBoard {
  titles: DuelTitle[]
  /** 0 — левый тайтл пары, 1 — правый. Длина до числа пар. */
  a?: number[]
  b?: number[]
}

function readAll(): Record<string, DuelBoard> {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, DuelBoard>) : {}
  } catch {
    return {}
  }
}

function isTitle(v: unknown): v is DuelTitle {
  if (!v || typeof v !== 'object') return false
  const o = v as DuelTitle
  return typeof o.id === 'string' && o.id.length > 0 && typeof o.title === 'string' && o.title.length > 0
}

function isPicks(v: unknown, n: number): v is number[] {
  return Array.isArray(v) && v.length <= n && v.every((x) => x === 0 || x === 1)
}

export function loadDuel(code: string): DuelBoard | undefined {
  const raw = readAll()[code]
  if (!raw || !Array.isArray(raw.titles)) return undefined
  const titles = raw.titles.filter(isTitle).slice(0, 5)
  if (titles.length < 2) return undefined
  const board: DuelBoard = { titles }
  if (isPicks(raw.a, titles.length)) board.a = raw.a
  if (isPicks(raw.b, titles.length)) board.b = raw.b
  return board
}

export function saveDuel(code: string, board: DuelBoard) {
  const all = readAll()
  all[code] = board
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Приватный режим: дуэль остаётся в состоянии страницы до ухода.
  }
}

export function makeDuelCode(): string {
  const all = readAll()
  const bytes = new Uint8Array(5)
  for (let attempt = 0; attempt < 5; attempt++) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
    if (!all[code]) return code
  }
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** Соседние тайтлы и замыкание кольца: пять пар на пятёрку, порядок стабильный. */
export function duelPairs(titles: DuelTitle[]): [DuelTitle, DuelTitle][] {
  return titles.map((t, i) => [t, titles[(i + 1) % titles.length]])
}

export function matchPercent(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (!n) return 0
  let same = 0
  for (let i = 0; i < n; i++) if (a[i] === b[i]) same++
  return Math.round((same / n) * 100)
}

export function pickDuelTitles<T>(list: T[], n = 5): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}
