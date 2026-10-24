import './en.css'
import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { absolute, get, withPosters, type ShikiAnimeShort } from '../api/shikimori'
import { usePageMeta } from '../data/pageMeta'
import { EN_HOME, enDescription, enFacts, enName, enPath, enTitle, enYear, type EnAnime } from '../data/en'
import { animeIdFromParam, animePath } from '../data/animeUrl'
import NotFound from './NotFound'

/**
 * Английская версия: /en и /en/anime/<id>-<slug>. Тексты общие с Worker (src/data/en.ts),
 * плеер и остальной сайт русские. На время страницы <html lang="en">, чтобы браузер и читалки знали язык.
 */
function useEnglish() {
  useEffect(() => {
    document.documentElement.lang = 'en'
    return () => {
      document.documentElement.lang = 'ru'
    }
  }, [])
}

type Short = ShikiAnimeShort & { english?: (string | null)[] }

function Crumbs({ trail }: { trail: [string, string?][] }) {
  return (
    <nav className="crumbs muted" aria-label="Breadcrumbs">
      {trail.map(([name, to], i) => (
        <Fragment key={name}>
          {i > 0 && ' › '}
          {to ? <Link to={to}>{name}</Link> : <span>{name}</span>}
        </Fragment>
      ))}
    </nav>
  )
}

function Card({ a }: { a: Short }) {
  const poster = absolute(a.image?.main ?? a.image?.original ?? '')
  return (
    <li>
      <Link to={enPath(a.id, a.name)} className="en-card">
        {poster ? <img src={poster} alt={`${enName(a)} poster`} loading="lazy" width={225} height={318} /> : <span className="en-card__ph" />}
        <b>{enName(a)}</b>
        <span className="muted">{[enYear(a), Number(a.score) > 0 ? `★ ${a.score}` : ''].filter(Boolean).join(' · ')}</span>
      </Link>
    </li>
  )
}

function Shelf({ title, params }: { title: string; params: Record<string, string | number> }) {
  const [items, setItems] = useState<Short[] | null>(null)
  useEffect(() => {
    let live = true
    get<Short[]>('/animes', { order: 'popularity', censored: 'true', ...params })
      .then((list) => withPosters(list))
      .then((list) => live && setItems(list))
      .catch(() => live && setItems([]))
    return () => {
      live = false
    }
  }, [params])
  return (
    <section className="stack">
      <h2>{title}</h2>
      {items === null ? (
        <div className="skeleton skeleton--line" style={{ height: 240 }} aria-busy="true" />
      ) : (
        <ul className="en-grid">
          {items.map((a) => (
            <Card key={a.id} a={a} />
          ))}
        </ul>
      )}
    </section>
  )
}

const AIRING = { status: 'ongoing', limit: 12, page: 1 }
const POPULAR = { limit: 24, page: 1 }

function EnHome() {
  usePageMeta(EN_HOME.title, EN_HOME.description)
  return (
    <main className="container home en" lang="en">
      <section className="stack">
        <div className="en-lang">
          <Link to="/" hrefLang="ru" lang="ru" className="pill pill--link">
            Русская версия
          </Link>
        </div>
        <h1 className="page-title">{EN_HOME.h1}</h1>
        {EN_HOME.intro.map((p) => (
          <p key={p} className="soft en-intro">
            {p}
          </p>
        ))}
        <ul className="en-features">
          {EN_HOME.features.map(([h, t]) => (
            <li key={h}>
              <b>{h}</b>
              <span className="muted">{t}</span>
            </li>
          ))}
        </ul>
      </section>
      <Shelf title="Airing now" params={AIRING} />
      <Shelf title="Popular anime" params={POPULAR} />
    </main>
  )
}

function EnTitle({ param }: { param: string }) {
  const id = animeIdFromParam(param)
  const [a, setA] = useState<(EnAnime & { image?: ShikiAnimeShort['image'] }) | null | undefined>()
  useEffect(() => {
    let live = true
    setA(undefined)
    get<EnAnime & ShikiAnimeShort>(`/animes/${encodeURIComponent(id)}`)
      .then((x) => withPosters([x], { onlyMissing: true }))
      .then(([x]) => live && setA(x))
      .catch(() => live && setA(null))
    return () => {
      live = false
    }
  }, [id])
  usePageMeta(a ? enTitle(a) : undefined, a ? enDescription(a) : undefined)
  if (a === null || !/^\d+$/.test(id)) return <NotFound />
  if (!a) return <main className="container page-fallback" aria-busy="true" />
  const name = enName(a)
  const poster = absolute(a.image?.original ?? '')
  const watchable = a.status !== 'anons'
  const others = [...new Set([a.name, ...(a.japanese ?? [])].filter((n): n is string => !!n && n !== name))]
  return (
    <main className="container en" lang="en">
      <Crumbs trail={[['Anime Life', '/en'], [name]]} />
      <div className="en-title">
        {poster && <img className="en-title__poster" src={poster} alt={`${name} poster`} width={225} height={318} />}
        <div className="stack">
          <h1 className="page-title">{name}</h1>
          {others.length > 0 && <p className="muted">{others.join(' / ')}</p>}
          <p>{enFacts(a).join(' · ')}</p>
          {(a.genres?.length ?? 0) > 0 && <p className="muted">Genres: {a.genres!.map((g) => g.name).join(', ')}</p>}
          {Number(a.score) > 0 && <p>Shikimori score: ★ {a.score}</p>}
          <p className="soft">{enDescription(a)}</p>
          <div className="actions">
            {watchable && (
              <Link to={`/watch/${a.id}/1`} className="btn btn--accent">
                {a.kind === 'movie' ? 'Watch the movie' : 'Watch episode 1'}
              </Link>
            )}
            <Link to={animePath(a.id, a.name)} hrefLang="ru" lang="ru" className="btn btn--ghost">
              Страница на русском
            </Link>
          </div>
          <p className="muted en-note">The player and the rest of the site are in Russian. Pick a voice-over or Japanese audio with subtitles in the player.</p>
        </div>
      </div>
    </main>
  )
}

export default function En() {
  useEnglish()
  const { id } = useParams()
  return id ? <EnTitle param={id} /> : <EnHome />
}
