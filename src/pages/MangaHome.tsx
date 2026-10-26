import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync } from '../api'
import { MANGA_PAGE_SIZE, searchMangas, type MangaQuery } from '../api/manga'
import { allProgress, chapterLabel } from '../api/mangadex'
import type { Anime } from '../data/catalog'
import PosterCard from '../components/PosterCard'
import { usePageMeta } from '../data/pageMeta'
import './manga.css'

const tabs = [
  { id: 'popular', title: 'Популярное', query: { order: 'popularity' } },
  { id: 'best', title: 'Лучшее', query: { order: 'ranked' } },
  { id: 'ongoing', title: 'Выходит', query: { order: 'popularity', status: 'ongoing' } },
] as const

const kinds = [
  { id: '', title: 'Всё' },
  { id: 'manga', title: 'Манга' },
  { id: 'manhwa', title: 'Манхва' },
  { id: 'manhua', title: 'Маньхуа' },
]

/** «Читаю»: манга, которую уже открывали в читалке, со ссылкой на место остановки. */
function Reading() {
  const list = allProgress().slice(0, 12)
  if (!list.length) return null
  return (
    <section className="stack">
      <h2>Читаю</h2>
      <ul className="manga-reading">
        {list.map((p) => (
          <li key={p.id}>
            <Link to={`/manga/${p.id}/chapter/${p.chapterId}?lang=${p.lang}`}>
              <span className="manga-reading__img">{p.image && <img src={p.image} alt="" width={60} height={90} loading="lazy" decoding="async" />}</span>
              <span className="manga-reading__text">
                <b>{p.title ?? 'Манга'}</b>
                <span className="muted">
                  {chapterLabel({ num: p.num })}
                  {p.page ? `, стр. ${p.page}` : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Раздел «Манга»: поиск, популярное, лучшее и выходящее, полка «Читаю». Читать можно прямо на сайте. */
export default function MangaHome() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tabId = tabs.some((t) => t.id === params.get('tab')) ? (params.get('tab') as (typeof tabs)[number]['id']) : 'popular'
  const kind = kinds.some((k) => k.id === params.get('kind')) ? (params.get('kind') ?? '') : ''
  const tab = tabs.find((t) => t.id === tabId)!
  const [text, setText] = useState(q)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Anime[]>([])
  useEffect(() => setText(q), [q])
  useEffect(() => setPage(1), [q, tabId, kind])

  const query: MangaQuery = { ...tab.query, search: q || undefined, kind: kind || undefined, page }
  const result = useAsync(() => searchMangas(query).catch(() => null), [q, tabId, kind, page])
  useEffect(() => {
    if (result.loading || !result.value) return
    const fresh = result.value
    setItems((prev) => (page === 1 ? fresh : [...prev, ...fresh.filter((a) => !prev.some((p) => p.id === a.id))]))
  }, [result])

  usePageMeta(
    q ? `Манга «${q}»: поиск` : 'Читать мангу онлайн',
    'Манга, манхва и маньхуа: поиск, популярное, лучшее и выходящее. Читайте главы на русском прямо на Anime Life.',
  )

  function set(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: true })
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    set('q', text.trim())
  }

  const hasMore = result.value?.length === MANGA_PAGE_SIZE
  return (
    <main className="container stack manga-home">
      <header className="stack">
        <h1 className="page-title">Манга</h1>
        <p className="muted">Манга, манхва и маньхуа. Главы на русском и других языках читаются прямо здесь: переводы команд с MangaDex и загруженные к нам.</p>
        <form className="manga-home__search" role="search" onSubmit={submit}>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Название манги"
            aria-label="Название манги"
            enterKeyHint="search"
          />
          <button type="submit" className="btn btn--accent">
            Найти
          </button>
        </form>
      </header>

      {!q && <Reading />}

      <div className="stack">
        {q ? (
          <div className="chips">
            <span>Результаты по запросу «{q}»</span>
            <button type="button" className="pill" onClick={() => set('q', '')}>
              Сбросить
            </button>
          </div>
        ) : (
          <div className="chips" role="tablist" aria-label="Подборка">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tabId}
                className={`pill${t.id === tabId ? ' active' : ''}`}
                onClick={() => set('tab', t.id === 'popular' ? '' : t.id)}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}
        <div className="chips" role="group" aria-label="Вид">
          {kinds.map((k) => (
            <button key={k.id || 'all'} type="button" aria-pressed={k.id === kind} className={`pill${k.id === kind ? ' active' : ''}`} onClick={() => set('kind', k.id)}>
              {k.title}
            </button>
          ))}
        </div>
      </div>

      {result.value === null && !result.loading && page === 1 ? (
        <p className="muted">Shikimori сейчас не отвечает. Попробуйте обновить страницу через минуту.</p>
      ) : !result.loading && items.length === 0 ? (
        <p className="muted">Ничего не нашлось. Попробуйте другое название или вид.</p>
      ) : (
        <div className="grid grid--posters" aria-busy={result.loading}>
          {items.map((a, i) => (
            <PosterCard key={a.id} anime={a} href={`/manga/${a.id.replace('manga-', '')}`} priority={i < 2} />
          ))}
        </div>
      )}
      {hasMore && (
        <button type="button" className="btn btn--ghost load-more" disabled={result.loading} onClick={() => setPage(page + 1)}>
          {result.loading ? 'Загружаем…' : 'Показать ещё'}
        </button>
      )}
      <p className="muted manga__credit">
        Данные о манге:{' '}
        <a href="https://shikimori.io/mangas" target="_blank" rel="noopener noreferrer">
          Shikimori
        </a>
        . Главы: команды переводчиков на Anime Life и{' '}
        <a href="https://mangadex.org" target="_blank" rel="noopener noreferrer">
          MangaDex
        </a>
        .
      </p>
    </main>
  )
}
