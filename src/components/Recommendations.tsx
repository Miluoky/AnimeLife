import { loadRecommendations, useAsync, type RecommendationSeed } from '../api'
import { useMyList, type ListEntry } from '../data/myList'
import PosterCard from './PosterCard'

const MAX_SEEDS = 5

/** Вес тайтла из списка: высокие оценки важнее, без оценки учитываем то, что смотрите и досмотрели. */
function seedWeight(e: ListEntry) {
  if (e.rating) return e.rating >= 7 ? e.rating - 5 : 0
  if (e.status === 'completed') return 2
  if (e.status === 'watching') return 1.5
  return 0
}

function pickSeeds(list: ListEntry[]): RecommendationSeed[] {
  return list
    .map((e) => ({ id: e.anime.id, title: e.anime.title, weight: seedWeight(e), at: e.updatedAt ?? e.addedAt }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight || b.at - a.at)
    .slice(0, MAX_SEEDS)
    .map(({ id, title, weight }) => ({ id, title, weight }))
}

export default function Recommendations() {
  const list = useMyList()
  const seeds = pickSeeds(list)
  const key = seeds.map((s) => `${s.id}:${s.weight}`).join(',')
  const inList = new Set(list.map((e) => e.anime.id))
  const recs = useAsync(() => loadRecommendations(seeds, inList), [key])

  if (!seeds.length) return null
  if (!recs.loading && !recs.value?.items.length) return null

  const used = recs.value?.used ?? seeds
  const titles = used.slice(0, 3).map((s) => `«${s.title}»`)

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Вам понравится</h2>
      </div>
      <p className="muted section-note">
        Подобрали по тому, что вы высоко оценили и смотрите: {titles.join(', ')}
        {used.length > 3 ? ' и другим' : ''}.
      </p>
      {recs.value ? (
        <div className="grid grid--posters">
          {recs.value.items.map((r) => (
            <div key={r.anime.id} className="rec-card" title={`Похоже на «${r.because.title}»`}>
              <PosterCard anime={r.anime} />
              <div className="rec-card__because muted">Похоже на «{r.because.title}»</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid--posters" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="poster-card">
              <div className="poster-card__img skeleton" />
              <div className="skeleton skeleton--line" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
