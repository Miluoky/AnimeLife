import type { Anime } from '../data/catalog'
import { SHIKIMORI_URL, absolute, cleanDescription, fromShort, get, withPosters, type ShikiAnimeShort, type ShikiImage } from './shikimori'

// Страница персонажа грузится отдельно, поэтому и запрос к Shikimori живёт здесь, а не в основном бандле.

/** Кусок описания персонажа: обычный текст, подзаголовок или спойлер, который показываем по нажатию. */
export interface TextPart {
  kind: 'text' | 'heading' | 'spoiler'
  text: string
}

export interface CharacterPage {
  id: string
  name: string
  originalName?: string
  japanese?: string
  altName?: string
  image?: string
  description: TextPart[]
  /** сэйю: японские и прочие актёры озвучки */
  voices: { id: number; name: string; image?: string; url: string }[]
  animes: (Anime & { main: boolean })[]
}

interface ShikiCharacterFull {
  id: number
  name: string
  russian: string | null
  japanese: string | null
  altname: string | null
  image: ShikiImage
  url: string
  description: string | null
  seyu: { id: number; name: string; russian: string | null; image: ShikiImage; url: string }[]
  animes: (ShikiAnimeShort & { roles: string[] })[]
}

/** Описание Shikimori: подзаголовки [h3] и спойлеры [spoiler] отдельно, прочая разметка — просто текст. */
export function splitDescription(raw: string | null): TextPart[] {
  if (!raw) return []
  const parts: TextPart[] = []
  const re = /\[spoiler(?:=[^\]]*)?\]([\s\S]*?)\[\/spoiler\]|\[h3\]([\s\S]*?)\[\/h3\]/gi
  let last = 0
  const push = (kind: TextPart['kind'], text: string) => {
    const clean = cleanDescription(text)
    if (clean) parts.push({ kind, text: clean })
  }
  for (const m of raw.matchAll(re)) {
    push('text', raw.slice(last, m.index))
    if (m[1] !== undefined) push('spoiler', m[1])
    else push('heading', m[2])
    last = (m.index ?? 0) + m[0].length
  }
  push('text', raw.slice(last))
  return parts
}

const ANIMES_PER_CHARACTER = 48

/** Персонаж: описание со спойлерами, сэйю и аниме, где он появляется (сначала с главной ролью). */
export async function fetchCharacter(id: string): Promise<CharacterPage> {
  const c = await get<ShikiCharacterFull>(`/characters/${encodeURIComponent(id)}`)
  const animes = [...(c.animes ?? [])]
    .sort((a, b) => Number(b.roles?.includes('Main')) - Number(a.roles?.includes('Main')) || (a.aired_on ?? '9').localeCompare(b.aired_on ?? '9'))
    .slice(0, ANIMES_PER_CHARACTER)
  const withPics = await withPosters(animes)
  return {
    id: String(c.id),
    name: c.russian || c.name,
    originalName: c.russian ? c.name : undefined,
    japanese: c.japanese || undefined,
    altName: c.altname || undefined,
    image: absolute(c.image?.original),
    description: splitDescription(c.description),
    voices: (c.seyu ?? []).slice(0, 12).map((p) => ({
      id: p.id,
      name: p.russian || p.name,
      image: absolute(p.image?.original),
      url: new URL(p.url, SHIKIMORI_URL).toString(),
    })),
    animes: withPics.map((a) => ({ ...fromShort(a), main: a.roles?.includes('Main') ?? false })),
  }
}
