import { Link, useNavigate, useParams } from 'react-router-dom'
import { type CSSProperties, type FormEvent, type ReactNode, useState } from 'react'
import type { ScoreStats } from '../api'
import Lightbox from '../components/Lightbox'
import { loadAnime, loadTitleExtras, useAsync } from '../api'
import { episodeFrame, findRelease } from '../api/anilibria'
import { episodeCount } from '../data/catalog'
import { useHistory } from '../data/history'
import PosterCard, { Poster } from '../components/PosterCard'
import ListButton from '../components/ListButton'
import WatchTogetherButton from '../components/together/WatchTogetherButton'
import EpisodeProgress from '../components/EpisodeProgress'
import ShareButton from '../components/ShareButton'
import { usePageMeta } from '../data/pageMeta'
import { ageLabel, animeInfo, genrePath, titlePageDescription, titlePageTitle } from '../data/seo'
import { useMyList } from '../data/myList'
import Reviews from '../components/Reviews'
import Shelf from '../components/Shelf'
import { PlayIcon } from '../components/Icons'
import NextEpisode from '../components/NextEpisode'
import FollowButton from '../components/FollowButton'
import WatchOrder from '../components/WatchOrder'
import { fetchStaff } from '../api/staff'
import NotFound from './NotFound'
import './title.css'

const MAX_SHOTS = 8

function votesLabel(n: number) {
  const word = new Intl.PluralRules('ru').select(n)
  return `${n.toLocaleString('ru')} ${word === 'one' ? 'оценка' : word === 'few' ? 'оценки' : 'оценок'}`
}

/** «9 ч 50 мин», «45 мин», «2 ч». */
function hoursLabel(total: number) {
  const h = Math.floor(total / 60)
  const m = Math.round(total % 60)
  return [h && `${h} ч`, m && `${m} мин`].filter(Boolean).join(' ') || '0 мин'
}

const VOICES_SHOWN = 6

/** Кто озвучил тайтл или перевёл субтитрами: первые несколько, остальные по кнопке. */
function Voices({ title, names = [] }: { title: string; names?: string[] }) {
  const [all, setAll] = useState(false)
  if (!names.length) return null
  const shown = all ? names : names.slice(0, VOICES_SHOWN)
  return (
    <div className="stack voices" style={{ gap: 10 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500 }}>
        {title} <span className="muted voices__count">{names.length}</span>
      </h2>
      <ul className="voices__list">
        {shown.map((n) => (
          <li key={n}>{n}</li>
        ))}
        {names.length > VOICES_SHOWN && (
          <li>
            <button type="button" className="voices__more" aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? 'Свернуть' : `Ещё ${names.length - VOICES_SHOWN}`}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Распределение оценок зрителей Shikimori. */
function Scores({ stats }: { stats: ScoreStats }) {
  const top = Math.max(...stats.bars.map((b) => b.count))
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500 }}>Оценки зрителей</h2>
      <div className="score-bars" role="list">
        {stats.bars.map((b) => (
          <div key={b.score} className="score-bar" role="listitem" aria-label={`${b.score}: ${votesLabel(b.count)}`}>
            <span className="score-bar__label">{b.score}</span>
            <span className="score-bar__track">
              <span className="score-bar__fill" style={{ width: `${(b.count / top) * 100}%` }} />
            </span>
            <span className="score-bar__value muted">{Math.round((b.count / stats.votes) * 100)}%</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {votesLabel(stats.votes)}
        {stats.statuses.length > 0 &&
          ` · ${stats.statuses
            .filter((st) => st.count > 0)
            .map((st) => `${st.title.toLowerCase()} ${st.count.toLocaleString('ru')}`)
            .join(', ')}`}
      </p>
    </div>
  )
}

const PAGE_SIZE = 12
const MAX_PILLS = 8

export default function TitlePage() {
  const { id = '' } = useParams()
  const result = useAsync(() => loadAnime(id), [id])
  const extras = useAsync(() => loadTitleExtras(id), [id])
  const staff = useAsync(() => (/^\d+$/.test(id) ? fetchStaff(id).catch(() => []) : Promise.resolve([])), [id])
  const history = useHistory()
  // Открываем диапазон с серией, на которой остановились: у длинных сериалов это далеко не первая страница.
  const [pageWanted, setPage] = useState(() => {
    const episode = history.find((h) => h.animeId === id)?.episode ?? 1
    return Math.floor((episode - 1) / PAGE_SIZE)
  })
  const [shotOpen, setShotOpen] = useState<number>()
  const [videoOpen, setVideoOpen] = useState<number>()
  const [videoKind, setVideoKind] = useState('')
  const loaded = result.value?.data
  const info = loaded && animeInfo(loaded)
  // Кадры и названия серий из AniLibria, как в карточках серий AniLife. Плеер потом возьмёт тот же релиз из кэша.
  const release = useAsync(
    () =>
      loaded && loaded.id === id && !loaded.upcoming
        ? findRelease(loaded.id, [loaded.title, loaded.originalTitle, loaded.englishTitle]).catch(() => null)
        : Promise.resolve(null),
    [id, loaded?.id],
  )
  usePageMeta(info && titlePageTitle(info), info && titlePageDescription(info))

  if (result.loading && !result.value) return <main className="container empty-page" aria-busy="true" />
  const anime = result.value?.data
  if (!anime) return <NotFound title="Тайтл не найден" />

  const progress = history.find((h) => h.animeId === anime.id)
  const total = episodeCount(anime)
  const pages = Math.ceil(total / PAGE_SIZE)
  const page = Math.min(pageWanted, pages - 1)
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, from + PAGE_SIZE - 1)
  const episodes = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const minutes = anime.episodeMinutes ? `${anime.episodeMinutes} мин` : ''
  // Сколько времени займёт весь сериал (или вышедшие серии онгоинга) и сколько осталось от места, где остановились.
  const outNow = anime.ongoing ? (anime.episodesAired ?? 0) : (anime.episodes ?? 0)
  const left = Math.max(0, outNow - (progress ? progress.episode - 1 : 0))
  const totalTime =
    anime.episodeMinutes && outNow > 1
      ? `≈ ${hoursLabel(outNow * anime.episodeMinutes)}${progress && left > 0 && left < outNow ? ` · осталось ${hoursLabel(left * anime.episodeMinutes)}` : ''}`
      : ''
  const facts = (
    [
      ['Тип', anime.kind],
      [
        'Серии',
        anime.ongoing && anime.episodesAired
          ? anime.episodes
            ? `${anime.episodesAired} из ${anime.episodes}`
            : `${anime.episodesAired} вышло`
          : (anime.episodes ?? '?'),
      ],
      ['Длительность', minutes],
      [anime.ongoing ? 'Вышло на' : 'Всего', totalTime],
      [
        'Студия',
        anime.studio && anime.studioId ? <Link to={`/catalog?studio=${anime.studioId}`}>{anime.studio}</Link> : (anime.studio ?? ''),
      ],
      ['Сезон', anime.season ?? anime.year ?? ''],
    ] as [string, ReactNode][]
  ).filter((f) => f[1] !== '' && f[1] !== undefined)

  const shots = extras.value?.screenshots ?? []
  const related = extras.value?.related ?? []
  const similar = extras.value?.similar ?? []
  const watchLinks = extras.value?.watchLinks ?? []
  const characters = extras.value?.characters ?? []
  const allVideos = extras.value?.videos ?? []
  // Виды видео для фильтра (трейлеры, опенинги, эндинги…), как на AniLife; при одном виде фильтр не нужен.
  const videoKinds = [...new Set(allVideos.map((v) => v.kind))]
  const videos = videoKind ? allVideos.filter((v) => v.kind === videoKind) : allVideos
  const scores = extras.value?.scores
  const gallery = shots.slice(0, MAX_SHOTS)

  function rangeLabel(i: number) {
    const a = i * PAGE_SIZE + 1
    return `${a}–${Math.min(total, a + PAGE_SIZE - 1)}`
  }

  const alEpisodes = release.value && String(release.value.shikimori?.id) === anime.id ? release.value.episodes : []

  function episodeLabel(n: number) {
    if (progress && n < progress.episode) return 'Просмотрено'
    if (progress && n === progress.episode) return 'Вы здесь'
    return minutes
  }

  return (
    <>
      <div className="banner" style={{ background: anime.posterFill }}>
        {shots.length ? (
          <img className="banner__img banner__img--shot" src={shots[0]} alt="" />
        ) : anime.posterUrl ? (
          <img className="banner__img" src={anime.posterUrl} alt="" />
        ) : (
          <span className="art-label">[Широкий баннер тайтла]</span>
        )}
      </div>
      <main className="container title-page">
        <section className="title-head" style={{ '--glow': anime.posterFill } as CSSProperties}>
          <div className="title-head__poster" style={{ background: anime.posterFill, viewTransitionName: 'poster' }}>
            <Poster anime={anime} alt={`Постер аниме «${anime.title}»`} />
          </div>
          <div className="title-head__info">
            {anime.originalTitle && <div className="muted">{anime.originalTitle}</div>}
            <h1 className="title-head__title">{anime.title}</h1>
            <div className="chips">
              <span className="chip chip--accent">{anime.ongoing ? 'Онгоинг' : anime.upcoming ? 'Анонс' : 'Вышел'}</span>
              {anime.score ? <span className="chip">★ {anime.score.toFixed(1)}</span> : null}
              {ageLabel(anime.rating) && (
                <span className="chip chip--age" title="Возрастное ограничение">
                  {ageLabel(anime.rating)}
                </span>
              )}
              {anime.year && (
                <Link to={`/year/${anime.year}`} className="chip">
                  {anime.year}
                </Link>
              )}
              {/* Жанр со своей посадочной страницей — ссылка на неё, остальные просто подписи. */}
              {anime.genres.map((g) => {
                const to = genrePath(g)
                return to ? (
                  <Link key={g} to={to} className="chip">
                    {g}
                  </Link>
                ) : (
                  <span key={g} className="chip">
                    {g}
                  </span>
                )
              })}
            </div>
            {anime.nextEpisodeAt && <NextEpisode at={anime.nextEpisodeAt} episode={(anime.episodesAired ?? 0) + 1} />}
            <div className="actions">
              <Link to={`/watch/${anime.id}/${progress?.episode ?? 1}`} className="btn btn--accent">
                <PlayIcon />
                {progress ? `Продолжить: серия ${progress.episode}` : 'Смотреть'}
              </Link>
              <ListButton anime={anime} />
              <WatchTogetherButton anime={anime} />
              {(anime.ongoing || anime.upcoming) && <FollowButton animeId={anime.id} title={anime.title} />}
              <ShareButton title={anime.title} path={`/anime/${anime.id}`} className="btn btn--ghost title-share" />
            </div>
            {facts.length > 0 && (
              <dl className="fact-pills">
                {facts.map(([label, value]) => (
                  <div key={label} className="fact-pill">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <TitleProgress animeId={anime.id} />
            {anime.description && <About text={anime.description} />}
          </div>
        </section>

        <div className="title-body">
          <div className="stack">
            <div className="section-head" style={{ alignItems: 'center' }}>
              <h2>Серии</h2>
              <div className="episode-tools">
                {pages > 1 && pages <= MAX_PILLS && (
                  <div className="chips">
                    {Array.from({ length: pages }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`pill${i === page ? ' active' : ''}`}
                        aria-pressed={i === page}
                        onClick={() => setPage(i)}
                      >
                        {rangeLabel(i)}
                      </button>
                    ))}
                  </div>
                )}
                {pages > MAX_PILLS && (
                  // У длинных сериалов (Ван-Пис, Конан) сотня диапазонов: кнопками это стена, поэтому список.
                  <label className="btn btn--ghost list-select">
                    <span className="sr-only">Диапазон серий</span>
                    <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
                      {Array.from({ length: pages }, (_, i) => (
                        <option key={i} value={i}>
                          Серии {rangeLabel(i)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {total > PAGE_SIZE && <EpisodeJump animeId={anime.id} total={total} />}
              </div>
            </div>
            <div className="grid grid--episodes">
              {episodes.map((n) => {
                const watched = progress ? n < progress.episode : false
                const ep = alEpisodes.find((e) => e.ordinal === n)
                const frame = ep && episodeFrame(ep)
                return (
                  <Link key={n} to={`/watch/${anime.id}/${n}`} className="episode-card" title={ep?.name ? `Серия ${n}: ${ep.name}` : undefined}>
                    <div className="episode-card__img" style={{ background: anime.posterFill }}>
                      {frame ? (
                        <img
                          className="poster-img episode-card__shot episode-card__shot--frame"
                          src={frame.src}
                          srcSet={frame.srcSet}
                          sizes="(max-width: 640px) 50vw, 260px"
                          alt=""
                          loading="lazy"
                          onError={(e) => (e.currentTarget.hidden = true)}
                        />
                      ) : (
                        shots.length > 0 && (
                          <img className="poster-img episode-card__shot" src={shots[(n - 1) % shots.length]} alt="" loading="lazy" />
                        )
                      )}
                      <span className="episode-card__num">{n}</span>
                      {watched && (
                        <div className="progress-track" style={{ background: 'transparent' }}>
                          <div className="progress-bar" style={{ width: '100%' }} />
                        </div>
                      )}
                    </div>
                    <div className="episode-card__meta">
                      <span>Серия {n}</span>
                      <span className="muted">{episodeLabel(n)}</span>
                    </div>
                    {ep?.name && <div className="episode-card__name muted">{ep.name}</div>}
                  </Link>
                )
              })}
            </div>
          </div>

          <aside className="stack title-aside">
            {watchLinks.length > 0 && (
              <div className="stack" style={{ gap: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 500 }}>Где смотреть легально</h2>
                <div className="chips">
                  {watchLinks.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="pill pill--link">
                      {l.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {(staff.value?.length ?? 0) > 0 && (
              <div className="stack" style={{ gap: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 500 }}>Над аниме работали</h2>
                <dl className="staff-list">
                  {staff.value!.map((s) => (
                    <div key={s.role}>
                      <dt>{s.role}</dt>
                      <dd>
                        {s.names.map((p, i) => (
                          <span key={p.url}>
                            {i > 0 && ', '}
                            <a href={p.url} target="_blank" rel="noreferrer">
                              {p.name}
                            </a>
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <Voices title="Озвучка" names={extras.value?.dubbers} />
            <Voices title="Субтитры" names={extras.value?.subbers} />
            {scores && <Scores stats={scores} />}
            {!result.value?.demo && (
              <p className="muted source-note">
                Данные:{' '}
                <a href={`https://shikimori.io/animes/${anime.id}`} target="_blank" rel="noreferrer">
                  Shikimori
                </a>
              </p>
            )}
          </aside>
        </div>

        {characters.length > 0 && (
          <Shelf title="Персонажи" variant="compact">
              {characters.map((c) => (
                <Link key={c.id} to={`/character/${c.id}`} className="row-scroll__item character-card">
                  <span className="character-card__img">
                    <img src={c.image} alt="" loading="lazy" />
                  </span>
                  <span className="character-card__name">{c.name}</span>
                  <span className="muted character-card__role">{c.main ? 'Главный герой' : 'Второстепенный'}</span>
                </Link>
              ))}
          </Shelf>
        )}

        {videos.length > 0 && (
          <Shelf
            title="Видео"
            variant="wide"
            extra={
              videoKinds.length > 1 && (
                <div className="chips video-kinds" role="group" aria-label="Какие видео показать">
                  {['', ...videoKinds].map((k) => (
                    <button
                      key={k || 'all'}
                      type="button"
                      className={`pill${videoKind === k ? ' active' : ''}`}
                      aria-pressed={videoKind === k}
                      onClick={() => {
                        setVideoKind(k)
                        setVideoOpen(undefined)
                      }}
                    >
                      {k ? `${k} · ${allVideos.filter((v) => v.kind === k).length}` : `Все · ${allVideos.length}`}
                    </button>
                  ))}
                </div>
              )
            }
          >
              {videos.map((v, i) => (
                <button key={v.youtubeId} type="button" className="row-scroll__item video-card" onClick={() => setVideoOpen(i)}>
                  <span className="video-card__img">
                    <img src={`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`} alt="" loading="lazy" />
                    <span className="video-card__play" aria-hidden="true">
                      <PlayIcon size={22} />
                    </span>
                  </span>
                  <span className="video-card__title">{v.title}</span>
                </button>
              ))}
          </Shelf>
        )}

        {gallery.length > 1 && (
          <section className="stack">
            <div className="section-head">
              <h2>Кадры</h2>
            </div>
            <div className="shots-grid">
              {gallery.map((src, i) => (
                <button key={src} type="button" className="shot" onClick={() => setShotOpen(i)} aria-label={`Кадр ${i + 1}`}>
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}

        {shotOpen !== undefined && gallery[shotOpen] && (
          <Lightbox
            label={`Кадр ${shotOpen + 1} из ${gallery.length}`}
            onClose={() => setShotOpen(undefined)}
            onPrev={() => setShotOpen((shotOpen + gallery.length - 1) % gallery.length)}
            onNext={() => setShotOpen((shotOpen + 1) % gallery.length)}
          >
            <img className="lightbox__img" src={gallery[shotOpen]} alt={`Кадр ${shotOpen + 1}`} />
          </Lightbox>
        )}

        {videoOpen !== undefined && videos[videoOpen] && (
          <Lightbox label={videos[videoOpen].title} onClose={() => setVideoOpen(undefined)}>
            <div className="lightbox__video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videos[videoOpen].youtubeId}?autoplay=1&rel=0`}
                title={videos[videoOpen].title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </Lightbox>
        )}

        {!result.value?.demo && <WatchOrder animeId={anime.id} />}

        <Reviews animeId={anime.id} />

        {related.length > 0 && (
          <Shelf title="Связанное" subtitle="Сначала то, что смотрят по порядку, потом остальные части">
            {related.map((r) => (
              <div key={r.anime.id} className="row-scroll__item">
                <PosterCard anime={r.anime} tag={{ text: r.relation, accent: r.chain }} />
              </div>
            ))}
          </Shelf>
        )}

        {similar.length > 0 && (
          <Shelf title="Похожее" subtitle="Если понравилось это, загляните сюда">
            {similar.map((a) => (
              <div key={a.id} className="row-scroll__item">
                <PosterCard anime={a} />
              </div>
            ))}
          </Shelf>
        )}
      </main>
    </>
  )
}

/** Прогресс по сериям, если тайтл в списке. */
function TitleProgress({ animeId }: { animeId: string }) {
  const entry = useMyList().find((e) => e.anime.id === animeId)
  return entry ? <EpisodeProgress entry={entry} /> : null
}

const ABOUT_LIMIT = 320

/** «О чём»: описание сразу под названием, длинное свёрнуто до нескольких строк. */
function About({ text }: { text: string }) {
  const long = text.length > ABOUT_LIMIT
  const [open, setOpen] = useState(false)
  return (
    <div className="about-card">
      <h2 className="about-card__title">О чём</h2>
      <p className={`soft prewrap about-card__text${long && !open ? ' clamp-4' : ''}`}>{text}</p>
      {long && (
        <button type="button" className="about-card__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </div>
  )
}

/** Переход к серии по номеру: у длинных сериалов листать диапазоны долго. */
function EpisodeJump({ animeId, total }: { animeId: string; total: number }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = Math.round(Number(value))
    if (n >= 1 && n <= total) navigate(`/watch/${animeId}/${n}`)
  }
  return (
    <form className="episode-jump" onSubmit={submit} role="search">
      <label className="sr-only" htmlFor="episode-jump">
        Номер серии
      </label>
      <input
        id="episode-jump"
        type="number"
        inputMode="numeric"
        min={1}
        max={total}
        placeholder={`Серия 1–${total}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="btn btn--ghost">
        Перейти
      </button>
    </form>
  )
}
