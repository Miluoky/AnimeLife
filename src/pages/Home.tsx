import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { loadAnime, loadCatalog, useAsync } from '../api'
import { useHistory } from '../data/history'
import CatalogSection from '../components/CatalogSection'
import Recommendations from '../components/Recommendations'
import { Poster } from '../components/PosterCard'
import { PlayIcon } from '../components/Icons'

function Hero() {
  // Подборка недели: самый популярный онгоинг, с подробностями для описания и жанров.
  const featured = useAsync(async () => {
    const list = await loadCatalog({ status: 'ongoing', limit: 1 })
    const first = list.data[0]
    if (!first) return undefined
    return (await loadAnime(first.id)).data ?? first
  }, [])
  const anime = featured.value

  if (!anime) {
    return <section className="hero skeleton hero--loading" aria-busy={featured.loading} />
  }

  const meta = [anime.year, anime.kind, anime.episodes && `${anime.episodes} серий`, anime.studio].filter(Boolean)

  return (
    <section className="hero">
      <div className="hero__text">
        <div className="eyebrow">Подборка недели</div>
        <h1 className="hero__title">{anime.title}</h1>
        <div className="meta-line">
          {meta.map((m, i) => (
            <span key={i}>
              {i > 0 && <span className="meta-dot">·</span>}
              {m}
            </span>
          ))}
        </div>
        <div className="chips">
          {anime.genres.slice(0, 4).map((g) => (
            <span key={g} className="chip">
              {g}
            </span>
          ))}
        </div>
        {anime.description && <p className="hero__desc clamp-4">{anime.description}</p>}
        <div className="actions">
          <Link to={`/watch/${anime.id}/1`} className="btn btn--accent">
            <PlayIcon />
            Смотреть
          </Link>
          <Link to={`/anime/${anime.id}`} className="btn btn--ghost">
            Подробнее
          </Link>
        </div>
      </div>
      <div className="hero__art" style={{ background: anime.posterFill }}>
        {anime.posterUrl ? (
          <>
            <img className="hero__art-bg" src={anime.posterUrl} alt="" />
            <img
              className="hero__art-poster"
              src={anime.posterUrl}
              alt={`Постер: ${anime.title}`}
              // @ts-expect-error fetchpriority ещё нет в типах React 18
              fetchpriority="high"
            />
          </>
        ) : (
          <span className="art-label">[Ключевой арт тайтла, 16:9]</span>
        )}
      </div>
    </section>
  )
}

function ContinueWatching() {
  const history = useHistory()
  if (!history.length) return null

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Продолжить просмотр</h2>
      </div>
      <div className="grid grid--wide">
        {history.slice(0, 4).map((h) => (
          <Link key={h.animeId} to={`/watch/${h.animeId}/${h.episode}`} className="continue-card">
            <div className="continue-card__img" style={{ background: h.posterFill }}>
              <Poster anime={h} className="poster-img--cover" />
              <span className="continue-card__play">
                <PlayIcon size={20} />
              </span>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${(h.episode / h.totalEpisodes) * 100}%` }} />
              </div>
            </div>
            <div>
              <div className="poster-card__title">{h.title}</div>
              <div className="poster-card__meta">
                Серия {h.episode} из {h.totalEpisodes}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function Home() {
  const [params] = useSearchParams()
  const query = (params.get('q') ?? '').trim()

  // Старые ссылки на поиск вида /?q=… ведут в каталог.
  if (query) return <Navigate to={`/catalog?q=${encodeURIComponent(query)}`} replace />

  return (
    <main className="container home">
      <Hero />
      <ContinueWatching />
      <Recommendations />
      <CatalogSection title="Популярное" moreLink="/catalog" />
    </main>
  )
}
