/** Дуэль вкуса: короткий код в localStorage этого браузера, ссылка для второго игрока несёт доску в адресе. */
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
    const raw = localStorage.getItem(KEY) ?? takeSession()
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, DuelBoard>) : {}
  } catch {
    return {}
  }
}

/** Старые дуэли из sessionStorage переезжают один раз, чтобы пережить новую вкладку. */
function takeSession(): string | null {
  try {
    const old = sessionStorage.getItem(KEY)
    if (!old) return null
    localStorage.setItem(KEY, old)
    sessionStorage.removeItem(KEY)
    return old
  } catch {
    return null
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
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Приватный режим: дуэль остаётся в состоянии страницы до ухода.
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(pack: string): Uint8Array {
  const b64 = pack.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

type Packed = { t?: unknown; a?: unknown; b?: unknown }

function cellString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Компактная доска в адресе: `{t:[[id,title,year,poster,fill],...],a?,b?}`. */
export function packDuel(board: DuelBoard): string {
  const body: { t: (string | number | null)[][]; a?: number[]; b?: number[] } = {
    t: board.titles.map((item) => [
      item.id,
      item.title,
      item.year ?? null,
      item.posterUrl ?? null,
      item.posterFill ?? null,
    ]),
  }
  if (board.a?.length) body.a = board.a
  if (board.b?.length) body.b = board.b
  return toBase64Url(new TextEncoder().encode(JSON.stringify(body)))
}

export function unpackDuel(pack: string): DuelBoard | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(pack.trim()))) as unknown
    if (!parsed || typeof parsed !== 'object') return undefined
    const o = parsed as Packed
    if (!Array.isArray(o.t)) return undefined
    const titles: DuelTitle[] = []
    for (const row of o.t) {
      if (!Array.isArray(row) || row.length < 2) continue
      const id = typeof row[0] === 'number' ? String(row[0]) : cellString(row[0])
      const title = cellString(row[1])
      if (!id || !title) continue
      const item: DuelTitle = { id, title }
      if (typeof row[2] === 'number' && Number.isFinite(row[2])) item.year = row[2]
      const poster = cellString(row[3])
      const fill = cellString(row[4])
      if (poster) item.posterUrl = poster
      if (fill) item.posterFill = fill
      titles.push(item)
    }
    const sliced = titles.slice(0, 5)
    if (sliced.length < 2) return undefined
    const board: DuelBoard = { titles: sliced }
    if (isPicks(o.a, sliced.length)) board.a = o.a
    if (isPicks(o.b, sliced.length)) board.b = o.b
    return board
  } catch {
    return undefined
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
