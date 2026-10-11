import type { Anime } from '../data/catalog'
import { absolute, fromShort, get, withPosters, type ShikiAnimeShort, type ShikiImage } from './shikimori'

// Страница сэйю или автора (/person/:id) грузится отдельно, поэтому и запрос к Shikimori живёт здесь.

export interface PersonRole {
  character: { id: number; name: string; image?: string }
  anime: { id: string; title: string; year?: number; score?: number }
  /** сколько ещё тайтлов с этим персонажем, кроме показанного */
  more: number
}

export interface PersonWork {
  anime: Anime
  roles: string[]
}

export interface Person {
  id: string
  name: string
  originalName?: string
  japanese?: string
  image?: string
  job?: string
  birthday?: string
  age?: number
  deceased?: string
  website?: string
  /** «Сэйю — 297», «Режиссёр — 18»: чем человек занимался чаще всего */
  jobs: [string, number][]
  roles: PersonRole[]
  works: PersonWork[]
}

type ShikiDate = { day?: number | null; month?: number | null; year?: number | null } | null

interface ShikiPerson {
  id: number
  name: string
  russian: string | null
  japanese: string | null
  image: ShikiImage
  job_title: string | null
  birth_on: ShikiDate
  deceased_on: ShikiDate
  website: string | null
  groupped_roles: [string, number][]
  roles: { characters: { id: number; name: string; russian: string | null; image: ShikiImage }[]; animes: ShikiAnimeShort[] }[]
  works: { anime: ShikiAnimeShort | null; manga: unknown; role: string }[]
}

const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function dateLabel(d: ShikiDate) {
  if (!d?.month || !d.day) return d?.year ? `${d.year}` : undefined
  return `${d.day} ${months[d.month - 1]}${d.year ? ` ${d.year}` : ''}`
}

function ageOf(birth: ShikiDate, until: ShikiDate) {
  if (!birth?.year || !birth.month || !birth.day) return undefined
  const end = until?.year ? new Date(until.year, (until.month ?? 1) - 1, until.day ?? 1) : new Date()
  let age = end.getFullYear() - birth.year
  if (end.getMonth() + 1 < birth.month || (end.getMonth() + 1 === birth.month && end.getDate() < birth.day)) age--
  return age > 0 && age < 120 ? age : undefined
}

const year = (a: ShikiAnimeShort) => (a.aired_on ? Number(a.aired_on.slice(0, 4)) : undefined)
/** Сколько работ показать сеткой постеров: дальше постеры — лишние запросы, список и так длинный. */
const MAX_WORKS = 60

export async function fetchPerson(id: string): Promise<Person> {
  const p = await get<ShikiPerson>(`/people/${encodeURIComponent(id)}`)

  // Роль сэйю: персонаж и самый известный тайтл с ним (по оценке), остальные тайтлы — числом.
  const roles: PersonRole[] = (p.roles ?? [])
    .filter((r) => r.characters?.length && r.animes?.length)
    .map((r) => {
      const c = r.characters[0]
      const best = [...r.animes].sort((a, b) => Number(b.score) - Number(a.score))[0]
      return {
        character: { id: c.id, name: c.russian || c.name, image: absolute(c.image?.original) },
        anime: { id: String(best.id), title: best.russian || best.name, year: year(best), score: Number(best.score) || undefined },
        more: r.animes.length - 1,
      }
    })

  // Работы: один тайтл — одна карточка, роли через запятую.
  const byAnime = new Map<number, { anime: ShikiAnimeShort; roles: string[] }>()
  for (const w of p.works ?? []) {
    if (!w.anime) continue
    const item = byAnime.get(w.anime.id) ?? { anime: w.anime, roles: [] }
    if (!item.roles.includes(w.role)) item.roles.push(w.role)
    byAnime.set(w.anime.id, item)
  }
  const works = [...byAnime.values()].sort((a, b) => (b.anime.aired_on ?? '').localeCompare(a.anime.aired_on ?? '')).slice(0, MAX_WORKS)
  const withPics = await withPosters(works.map((w) => w.anime)).catch(() => works.map((w) => w.anime))

  return {
    id: String(p.id),
    name: p.russian || p.name,
    originalName: p.russian ? p.name : undefined,
    japanese: p.japanese || undefined,
    image: absolute(p.image?.original),
    job: p.job_title || undefined,
    birthday: dateLabel(p.birth_on),
    age: ageOf(p.birth_on, p.deceased_on),
    deceased: dateLabel(p.deceased_on),
    website: p.website && /^https?:\/\//.test(p.website) ? p.website : undefined,
    jobs: (p.groupped_roles ?? []).slice(0, 8),
    roles,
    works: withPics.map((a, i) => ({ anime: fromShort(a), roles: works[i].roles })),
  }
}
