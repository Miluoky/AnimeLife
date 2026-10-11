import { SHIKIMORI_URL, get } from './shikimori'

// «Над аниме работали» показывается только на странице тайтла: запрос живёт в её части, а ответ /roles
// общий с персонажами, поэтому второго обращения к Shikimori нет.

export interface StaffEntry {
  role: string
  names: { id: number; name: string; url: string }[]
}

interface ShikiPersonRole {
  roles: string[]
  person: { id: number; name: string; russian: string | null; url: string } | null
}

/** Главные роли по порядку и как их подписать. */
const ROLES: [string, string][] = [
  ['Original Creator', 'Автор оригинала'],
  ['Director', 'Режиссёр'],
  ['Series Composition', 'Сценарий'],
  ['Character Design', 'Дизайн персонажей'],
  ['Music', 'Музыка'],
]
const MAX_NAMES = 2

export async function fetchStaff(id: string): Promise<StaffEntry[]> {
  const list = await get<ShikiPersonRole[]>(`/animes/${encodeURIComponent(id)}/roles`)
  return ROLES.map(([key, role]) => ({
    role,
    names: list
      .filter((r) => r.person && r.roles.includes(key))
      .slice(0, MAX_NAMES)
      .map((r) => ({ id: r.person!.id, name: r.person!.russian || r.person!.name, url: new URL(r.person!.url, SHIKIMORI_URL).toString() })),
  })).filter((s) => s.names.length > 0)
}
