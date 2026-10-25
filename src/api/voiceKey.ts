const ALIASES: Record<string, string> = { cr: 'crunchyroll' }

/**
 * Ключ для сверки студий между источниками: «Studio Band» и «StudioBand», «ТО Дубляжная» и «Дубляжная»,
 * «Freedub Studio» и «Freedub» — одна студия.
 */
export function voiceKey(title: string): string {
  const key = title
    .toLowerCase()
    .replace(/^то\s+/, '')
    .replace(/studio|студия|project/g, '')
    .replace(/[^a-zа-яё0-9]/g, '')
  return ALIASES[key] ?? (key || title.toLowerCase())
}

/**
 * Ключ студии, выбранной вне плеера (на странице тайтла): по нему плеер найдёт её, из какого бы
 * источника она к нему ни пришла (Anixart, Kodik, YummyAnime).
 */
export const playerVoiceKey = (v: { kind: string; title: string }) => `title:${v.kind}:${voiceKey(v.title)}`

const STORE = 'anime.voice.v1'
const KEEP = 300

type Saved = Record<string, { key: string; at: number; studio?: string }>

function readSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Saved
  } catch {
    return {}
  }
}

/** Студия, которую зритель выбрал для этого тайтла: у каждого тайтла своя, и она помнится между визитами. */
export function savedVoice(animeId: string): string | undefined {
  return readSaved()[animeId]?.key
}

export function rememberVoice(animeId: string, key: string, title?: string) {
  const saved = readSaved()
  saved[animeId] = { key, at: Date.now(), studio: title ? voiceKey(title) : undefined }
  // Храним последние несколько сотен тайтлов: старые выбор забываем, чтобы запись не росла без конца.
  const keep = Object.entries(saved).sort((a, b) => b[1].at - a[1].at).slice(0, KEEP)
  try {
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    // Без хранилища плеер откроется в озвучке по умолчанию.
  }
}

/** Плеер откроется сразу в этой студии и запомнит её для тайтла. */
export function choosePlayerVoice(animeId: string, v: { kind: string; title: string }) {
  rememberVoice(animeId, playerVoiceKey(v), v.title)
}

/**
 * Любимые студии зрителя: те, что он сам выбирал хотя бы на двух тайтлах, — самые частые первыми.
 * Новый тайтл откроется в любимой озвучке, если она там есть.
 */
export function favoriteStudios(): string[] {
  const stats = new Map<string, { n: number; at: number }>()
  for (const { studio, at } of Object.values(readSaved())) {
    if (!studio) continue
    const s = stats.get(studio) ?? { n: 0, at: 0 }
    stats.set(studio, { n: s.n + 1, at: Math.max(s.at, at) })
  }
  return [...stats]
    .filter(([, s]) => s.n >= 2)
    .sort((a, b) => b[1].n - a[1].n || b[1].at - a[1].at)
    .map(([studio]) => studio)
}
