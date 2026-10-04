import { absolute, get, withPosters, type ShikiAnimeShort } from './shikimori'

// «Порядок просмотра» живёт на странице тайтла, поэтому и запрос лежит здесь, а не в основном бандле.

export interface FranchiseEntry {
  id: string
  title: string
  year?: number
  kind: string
  /** сериалы, фильмы и ONA: то, без чего сюжет не понять */
  main: boolean
  poster?: string
  poster2x?: string
}

interface ShikiFranchise {
  current_id: number
  nodes: { id: number; date: number | null; name: string; image_url: string; year: number | null; kind: string }[]
}

const MAIN_KINDS = new Set(['TV Сериал', 'Фильм', 'ONA'])
// Клипы и реклама к истории не относятся: их не показываем даже в полном списке.
const SKIP_KINDS = new Set(['Клип', 'Реклама', 'Промо'])

/** Вся франшиза по дате выхода. Пустой список, если тайтл стоит особняком. */
export async function fetchFranchise(id: string): Promise<FranchiseEntry[]> {
  const res = await get<ShikiFranchise>(`/animes/${encodeURIComponent(id)}/franchise`)
  const nodes = (res.nodes ?? [])
    .filter((n) => !SKIP_KINDS.has(n.kind))
    .sort((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity) || a.id - b.id)
  if (nodes.length < 2) return []
  // Маленькие картинки франшизы размыты, поэтому берём лёгкие webp-постеры тем же запросом, что и для сеток.
  const shorts = await withPosters(
    nodes.map(
      (n): ShikiAnimeShort => ({
        id: n.id,
        name: n.name,
        russian: n.name,
        image: { original: n.image_url.replace('/x96/', '/original/'), preview: n.image_url },
        kind: null,
        score: '0',
        status: '',
        episodes: 0,
        episodes_aired: 0,
        aired_on: null,
      }),
    ),
  )
  return nodes.map((n, i) => ({
    id: String(n.id),
    title: n.name,
    year: n.year ?? undefined,
    kind: n.kind.replace('TV Сериал', 'ТВ-сериал').replace('TV Спецвыпуск', 'ТВ-спецвыпуск'),
    main: MAIN_KINDS.has(n.kind),
    poster: shorts[i].image?.main ?? absolute(n.image_url),
    poster2x: shorts[i].image?.main2x,
  }))
}
