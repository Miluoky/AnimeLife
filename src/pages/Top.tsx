import { Link, useSearchParams } from 'react-router-dom'
import { srcset2x } from '../data/saver'
import { loadCatalog, useAsync, type CatalogQuery } from '../api'
import type { Anime } from '../data/catalog'
import { useMyList, listStatuses } from '../data/myList'
import { usePageMeta } from '../data/pageMeta'
import { prefetchTitle } from '../api/prefetch'
import { TrophyIcon } from '../components/Icons'
import './top.css'

const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter']
const SEASON_NAMES: Record<string, string> = { winter: 'зимы', spring: 'весны', summer: 'лета', fall: 'осени' }

function season(now = new Date()) {
  const name = SEASONS[now.getMonth()]
  const year = now.getFullYear() + (now.getMonth() === 11 ? 1 : 0)
  return { code: `${name}_${year}`, label: `${SEASON_NAMES[name]} ${year}` }
}

const tabs = [
  { id: 'best', title: 'Лучшие', lead: 'Самые высокие оценки зрителей Shikimori за всё время.', query: { order: 'ranked' } },
  { id: 'popular', title: 'Популярные', lead: 'То, что смотрят и добавляют в списки чаще всего.', query: { order: 'popularity' } },
  { id: 'ongoing', title: 'Онгоинги', lead: 'Лучшие из тех, что выходят прямо сейчас.', query: { order: 'ranked', status: 'ongoing' } },
  { id: 'season', title: 'Этот сезон', lead: '', query: { order: 'popularity' } },
] as const

const kinds = [
  { id: '', title: 'Всё' },
  { id: 'tv', title: 'Сериалы' },
  { id: 'movie', title: 'Фильмы' },
]

const LIMIT = 50
const PAGES = 2

async function loadTop(query: CatalogQuery): Promise<{ items: Anime[]; demo: boolean }> {
  const pages = await Promise.all(Array.from({ length: PAGES }, (_, i) => loadCatalog({ ...query, limit: LIMIT, page: i + 1 })))
  const seen = new Set<string>()
  const items = pages.flatMap((p) => p.data).filter((a) => !seen.has(a.id) && seen.add(a.id))
  return { items, demo: pages.some((p) => p.demo) }
}

const statusTitle = new Map(listStatuses.map((s) => [s.id, s.title]))

/** «Топ-100»: лучшие, популярные, онгоинги и тайтлы сезона. Первая тройка на пьедестале, дальше список с местами. */
export default function Top() {
  const [params, setParams] = useSearchParams()
  const tabId = tabs.some((t) => t.id === params.get('tab')) ? (params.get('tab') as (typeof tabs)[number]['id']) : 'best'
  const kind = kinds.some((k) => k.id === params.get('kind')) ? (params.get('kind') ?? '') : ''
  const tab = tabs.find((t) => t.id === tabId)!
  const now = season()
  const query: CatalogQuery = {
    ...tab.query,
    kind: kind || undefined,
    season: tabId === 'season' ? now.code : undefined,
  } as CatalogQuery
  const result = useAsync(() => loadTop(query), [tabId, kind])
  const list = useMyList()
  const status = new Map(list.map((e) => [e.anime.id, e.status]))

  const heading = tabId === 'season' ? `Топ ${now.label}` : `Топ-100: ${tab.title.toLowerCase()}`
  usePageMeta(`${heading} аниме`, 'Рейтинг аниме: лучшие за всё время, самые популярные, лучшие онгоинги и тайтлы этого сезона.')

  function set(name: string, value: string, fallback: string) {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(name)
    else next.set(name, value)
    setParams(next, { replace: true })
  }

  const items = result.value?.items ?? []
  const podium = items.slice(0, 3)
  const rest = items.slice(3)
  // Полоска показывает разницу внутри списка, а не от нуля: иначе у сотни тайтлов с 8–9 баллами она одинаковая.
  const scored = items.map((a) => a.score ?? 0).filter(Boolean)
  const top = Math.max(...scored, 1)
  const bottom = Math.min(...scored, top) - 0.3

  return (
    <main className="container top-page">
      <header className="top-head">
        <span className="top-head__icon" aria-hidden="true">
          <TrophyIcon size={22} />
        </span>
        <div>
          <h1 className="page-title">{heading}</h1>
          <p className="muted top-head__lead">{tabId === 'season' ? `Самые обсуждаемые тайтлы ${now.label}.` : tab.lead}</p>
        </div>
      </header>

      <div className="top-filters">
        <div className="chips" role="tablist" aria-label="Какой рейтинг">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tabId}
              className={`pill${t.id === tabId ? ' active' : ''}`}
              onClick={() => set('tab', t.id, 'best')}
            >
              {t.title}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Формат">
          {kinds.map((k) => (
            <button key={k.id || 'all'} type="button" aria-pressed={k.id === kind} className={`pill${k.id === kind ? ' active' : ''}`} onClick={() => set('kind', k.id, '')}>
              {k.title}
            </button>
          ))}
        </div>
      </div>

      {result.loading && !result.value ? (
        <div className="top-skeleton" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton top-skeleton__row" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="muted">Ничего не нашлось. Попробуйте другой формат.</p>
      ) : (
        <>
          <ol className="podium" aria-label="Первые три места">
            {podium.map((a, i) => (
              <li key={a.id} className={`podium__item podium__item--${i + 1}`}>
                <Link to={`/anime/${a.id}`} className="podium__card" onPointerEnter={() => prefetchTitle(a.id)}>
                  <span className="podium__poster">
                    {(a.posterSmall2x ?? a.posterUrl) && <img src={a.posterSmall2x ?? a.posterUrl} alt="" />}
                    <span className="podium__place" aria-hidden="true">
                      {i + 1}
                    </span>
                  </span>
                  <span className="podium__body">
                    <span className="podium__title">{a.title}</span>
                    <span className="muted podium__meta">{[a.year, a.kind].filter(Boolean).join(' · ')}</span>
                    {a.score ? <span className="podium__score">★ {a.score.toFixed(2)}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <ol className="top-list" start={4}>
            {rest.map((a, i) => {
              const st = status.get(a.id)
              return (
                <li key={a.id}>
                  <Link to={`/anime/${a.id}`} className="top-row" onPointerEnter={() => prefetchTitle(a.id)}>
                    <span className="top-row__place">{i + 4}</span>
                    <span className="top-row__poster" style={{ background: a.posterFill }}>
                      {a.posterSmall && <img src={a.posterSmall} srcSet={srcset2x(a.posterSmall, a.posterSmall2x)} alt="" loading="lazy" />}
                    </span>
                    <span className="top-row__body">
                      <span className="top-row__title">{a.title}</span>
                      <span className="muted top-row__meta">
                        {[a.year, a.kind, a.episodes && a.episodes > 1 ? `${a.episodes} эп.` : '', a.ongoing ? 'онгоинг' : ''].filter(Boolean).join(' · ')}
                      </span>
                      {st && <span className="top-row__status">{statusTitle.get(st)}</span>}
                    </span>
                    {a.score ? (
                      <span className="top-row__score" aria-label={`Оценка ${a.score}`}>
                        <span className="top-row__score-value">★ {a.score.toFixed(2)}</span>
                        <span className="top-row__bar" aria-hidden="true">
                          <span style={{ width: `${Math.max(8, ((a.score - bottom) / (top - bottom)) * 100)}%` }} />
                        </span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ol>
          {result.value?.demo && <p className="muted">Каталог сейчас не отвечает, показаны примеры.</p>}
        </>
      )}
    </main>
  )
}
