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

type Saved = Record<string, { key: string; at: number }>

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

export function rememberVoice(animeId: string, key: string) {
  const saved = readSaved()
  saved[animeId] = { key, at: Date.now() }
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
  rememberVoice(animeId, playerVoiceKey(v))
}
