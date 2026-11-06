import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchHentaiCatalog } from '../api/hentai'
import { HENTAI_TAGS, HENTAI_SORTS } from '../data/hentaiGenres'
import type { Anime } from '../data/catalog'
import AgeGateModal, { isAgeVerified } from '../components/AgeGateModal'
import HentaiCard from '../components/HentaiCard'
import { usePageMeta } from '../data/pageMeta'
import './hentai-catalog.css'

export default function HentaiCatalog() {
  usePageMeta('Хентай каталог — смотреть онлайн (18+)', 'Отдельный каталог аниме для взрослых 18+. Полный список хентая, удобная фильтрация по категориям и студиям.')
  const [params, setParams] = useSearchParams()

  const currentTag = params.get('tag') || ''
  const currentSort = params.get('order') || 'popularity'
  const page = Math.max(1, parseInt(params.get('page') || '1', 10))

  const [items, setItems] = useState<Anime[]>([])
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlocked] = useState(isAgeVerified)

  useEffect(() => {
    if (!unlocked) return
    let alive = true
    setLoading(true)

    const selectedTagObj = HENTAI_TAGS.find((t) => t.slug === currentTag)
    const genreParam = selectedTagObj?.shikiGenreId ?? 12

    fetchHentaiCatalog({
      page,
      limit: 24,
      order: currentSort as 'popularity' | 'ranked' | 'aired_on' | 'name',
      genre: genreParam,
    })
      .then((data) => {
        if (!alive) return
        setItems(data)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setItems([])
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [unlocked, currentTag, currentSort, page])

  const setTag = (slug: string) => {
    const next = new URLSearchParams(params)
    if (slug) next.set('tag', slug)
    else next.delete('tag')
    next.delete('page')
    setParams(next)
  }

  const setSort = (sort: string) => {
    const next = new URLSearchParams(params)
    next.set('order', sort)
    next.delete('page')
    setParams(next)
  }

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(params)
    if (nextPage > 1) next.set('page', String(nextPage))
    else next.delete('page')
    setParams(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="container home hentai-page">
      {!unlocked && <AgeGateModal onVerified={() => setUnlocked(true)} />}

      <header className="hentai-header frame-corners">
        <span className="hentai-header__badge">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff5470' }} />
          18+ Контент для взрослых
        </span>
        <h1 className="hentai-header__title">Хентай Аниме</h1>
        <p className="hentai-header__desc">
          Отдельный изолированный раздел аниме 18+. Высокое качество, субтитры и русская озвучка.
        </p>

        <div className="hentai-switch" role="tablist" aria-label="Тип контента 18+">
          <Link to="/hentai" className="hentai-switch__btn is-active">
            Аниме (Видео)
          </Link>
          <Link to="/hentai-manga" className="hentai-switch__btn">
            Хентай Манга
          </Link>
        </div>
      </header>

      {unlocked && <section className="stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="hentai-tags" role="group" aria-label="Теги хентая">
            <button
              type="button"
              className={`hentai-tag-btn ${!currentTag ? 'is-active' : ''}`}
              onClick={() => setTag('')}
            >
              Все теги
            </button>
            {HENTAI_TAGS.slice(0, 14).map((tag) => (
              <button
                key={tag.slug}
                type="button"
                className={`hentai-tag-btn ${currentTag === tag.slug ? 'is-active' : ''}`}
                onClick={() => setTag(tag.slug === currentTag ? '' : tag.slug)}
              >
                {tag.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <label htmlFor="hentai-sort" className="muted" style={{ fontSize: '13px' }}>
              Сортировка:
            </label>
            <select
              id="hentai-sort"
              value={currentSort}
              onChange={(e) => setSort(e.target.value)}
              className="select"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                fontSize: '13px',
              }}
            >
              {HENTAI_SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="hentai-grid" aria-busy="true">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="poster-card skeleton" style={{ height: 280, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="hentai-grid">
            {items.map((item, idx) => (
              <HentaiCard key={item.id} anime={item} priority={idx < 4} />
            ))}
          </div>
        ) : (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            <p>Ничего не найдено в этой категории.</p>
            <button type="button" className="btn btn--ghost" onClick={() => setTag('')}>
              Сбросить фильтры
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 32 }}>
          {page > 1 && (
            <button type="button" className="btn btn--ghost" onClick={() => setPage(page - 1)}>
              ← Предыдущая страница
            </button>
          )}
          {items.length >= 24 && (
            <button type="button" className="btn btn--accent" onClick={() => setPage(page + 1)}>
              Следующая страница →
            </button>
          )}
        </div>
      </section>}
    </main>
  )
}
