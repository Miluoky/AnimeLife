import { loadRecommendations, useAsync, type RecommendationSeed } from '../api'
import { useMyList, type ListEntry } from '../data/myList'
import { notInterestedStore, setNotInterested, useNotInterested } from '../data/notInterested'
import { toast } from '../data/toast'
import { tasteStore } from '../data/taste'
import { useHistory, type HistoryEntry } from '../data/history'
import { GENRES } from '../data/seo'
import PosterCard from './PosterCard'
import './recs.css'

const MAX_SEEDS = 5
const SHOWN = 12

/** Вес тайтла из списка: высокие оценки важнее, без оценки учитываем то, что смотрите и досмотрели. */
function seedWeight(e: ListEntry) {
  if (e.rating) return e.rating >= 7 ? e.rating - 5 : 0
  if (e.status === 'completed') return 2
  if (e.status === 'watching') return 1.5
  return 0
}

/**
 * Вес тайтла из истории просмотра: большинство зрителей смотрит, ничего не добавляя в список.
 * Три серии и больше (или весь фильм) — тайтл зацепил; одна-две — слабее.
 */
function historyWeight(h: HistoryEntry) {
  if (h.episode >= 3 || (h.totalEpisodes > 0 && h.episode >= h.totalEpisodes)) return 1.5
  return 1
}

function pickSeeds(list: ListEntry[], history: HistoryEntry[]): RecommendationSeed[] {
  const listed = new Set(list.map((e) => e.anime.id))
  return [
    ...list.map((e) => ({ id: e.anime.id, title: e.anime.title, weight: seedWeight(e), at: e.updatedAt ?? e.addedAt })),
    // Что в списке, оценено там: брошенное не должно тянуть похожие из истории.
    ...history.filter((h) => !listed.has(h.animeId)).map((h) => ({ id: h.animeId, title: h.title, weight: historyWeight(h), at: h.updatedAt })),
  ]
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight || b.at - a.at)
    .slice(0, MAX_SEEDS)
    .map(({ id, title, weight }) => ({ id, title, weight }))
}

export default function Recommendations() {
  const list = useMyList()
  const taste = tasteStore.use()
  const history = useHistory()
  // Список и история пока пусты: берём тайтлы, отмеченные при знакомстве (Onboarding).
  const fromList = pickSeeds(list, history)
  const seeds = fromList.length ? fromList : taste.liked.slice(0, MAX_SEEDS).map((t) => ({ ...t, weight: 2 }))
  // Любимые жанры из знакомства поднимают похожие тайтлы этих жанров повыше.
  const genres = taste.genres.map((id) => GENRES.find((g) => g.id === id)?.name).filter((g): g is string => !!g)
  const key = seeds.map((s) => `${s.id}:${s.weight}`).join(',') + '|' + genres.join(',')
  const hidden = useNotInterested()
  // Уже начатое (в списке или в истории) не советуем: оно и так в «Продолжить просмотр».
  const seen = new Set([...list.map((e) => e.anime.id), ...history.map((h) => h.animeId)])
  // Берём с запасом и скрываем уже на экране: «Не интересно» сразу заменяется следующим тайтлом,
  // а «Вернуть» показывает скрытое обратно, без нового запроса.
  const recs = useAsync(() => loadRecommendations(seeds, seen, SHOWN + 12, genres), [key])
  const items = recs.value?.items.filter((r) => !hidden[r.anime.id]).slice(0, SHOWN) ?? []

  if (!seeds.length) return null
  if (!recs.loading && !items.length) return null

  const used = recs.value?.used ?? seeds
  const titles = used.slice(0, 3).map((s) => `«${s.title}»`)

  return (
    <section className="stack" id="recs">
      <div className="section-head">
        <h2>Вам понравится</h2>
      </div>
      <p className="muted section-note">
        {fromList.length ? 'Подобрали по тому, что вы смотрите и высоко оценили' : 'Подобрали по тому, что вы отметили'}: {titles.join(', ')}
        {used.length > 3 ? ' и другим' : ''}.
        {Object.keys(hidden).length > 0 && (
          <>
            {' '}
            Скрыто: {Object.keys(hidden).length}.{' '}
            <button type="button" className="link-btn" onClick={() => notInterestedStore.set({})}>
              Вернуть
            </button>
          </>
        )}
      </p>
      {recs.value ? (
        <div className="grid grid--posters">
          {items.map((r) => (
            <div key={r.anime.id} className="rec-card" title={`Похоже на «${r.because.title}»`}>
              <PosterCard anime={r.anime} />
              <div className="rec-card__foot">
                <span className="rec-card__because muted">Похоже на «{r.because.title}»</span>
                <button
                  type="button"
                  className="rec-card__hide"
                  aria-label={`Не интересно: ${r.anime.title}`}
                  title="Не интересно"
                  onClick={() => {
                    setNotInterested(r.anime.id, true)
                    toast(`«${r.anime.title}» больше не будем советовать`, {
                      label: 'Отменить',
                      onClick: () => setNotInterested(r.anime.id, false),
                    })
                  }}
                >
                  ×
                </button>
              </div>
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
