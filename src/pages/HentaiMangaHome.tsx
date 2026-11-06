import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchHentaiMangas } from '../api/hentaiManga'
import type { Anime } from '../data/catalog'
import AgeGateModal, { isAgeVerified } from '../components/AgeGateModal'
import HentaiCard from '../components/HentaiCard'
import { usePageMeta } from '../data/pageMeta'
import './hentai-catalog.css'
import './hentai-manga.css'

export default function HentaiMangaHome() {
  usePageMeta('Хентай Манга — читать онлайн (18+)', 'Каталог хентай-манги, додзинси и вебтунов 18+. Удобное чтение онлайн бесплатно на AnimeLife.')
  const [params, setParams] = useSearchParams()

  const currentSort = params.get('order') || 'popularity'
  const page = Math.max(1, parseInt(params.get('page') || '1', 10))

  const [items, setItems] = useState<Anime[]>([])
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlocked] = useState(isAgeVerified)

  useEffect(() => {
    if (!unlocked) return
    let alive = true
    setLoading(true)

    searchHentaiMangas({
      page,
      order: currentSort as 'popularity' | 'ranked',
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
  }, [unlocked, currentSort, page])

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
    <main className="container home hentai-manga-page">
      {!unlocked && <AgeGateModal onVerified={() => setUnlocked(true)} />}

      <header className="hentai-header frame-corners">
        <span className="hentai-header__badge">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff5470' }} />
          18+ Контент для взрослых
        </span>
        <h1 className="hentai-header__title">Хентай Манга & Додзинси</h1>
        <p className="hentai-header__desc">
          Коллекция манги для взрослых, додзинси и веб-комиксов 18+. Переводы на русский язык, высокое разрешение страниц.
        </p>

        <div className="hentai-switch" role="tablist" aria-label="Тип контента 18+">
          <Link to="/hentai" className="hentai-switch__btn">
            Аниме (Видео)
          </Link>
          <Link to="/hentai-manga" className="hentai-switch__btn is-active">
            Хентай Манга
          </Link>
        </div>
      </header>

      {unlocked && <section className="stack">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="s-chips">
            <button
              type="button"
              className={currentSort === 'popularity' ? 'is-on' : undefined}
              onClick={() => setSort('popularity')}
            >
              Популярное
            </button>
            <button
              type="button"
              className={currentSort === 'ranked' ? 'is-on' : undefined}
              onClick={() => setSort('ranked')}
            >
              Высокий рейтинг
            </button>
          </div>
        </div>

        {loading ? (
          <div className="hentai-manga-grid" aria-busy="true">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="poster-card skeleton" style={{ height: 280, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="hentai-manga-grid">
            {items.map((item, idx) => (
              <HentaiCard key={item.id} anime={item} priority={idx < 4} isManga />
            ))}
          </div>
        ) : (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            <p>Ничего не найдено.</p>
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
