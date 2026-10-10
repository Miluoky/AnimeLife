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

/** Плеер откроется сразу в этой студии (Player.tsx читает тот же ключ хранилища). */
export function choosePlayerVoice(v: { kind: string; title: string }) {
  try {
    sessionStorage.setItem('player-voice', playerVoiceKey(v))
  } catch {
    // Без хранилища плеер откроется в озвучке по умолчанию.
  }
}
