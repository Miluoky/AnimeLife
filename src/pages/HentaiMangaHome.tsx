import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { searchHentaiMangas } from '../api/hentaiManga'
import type { Anime } from '../data/catalog'
import AgeGateModal, { isAgeVerified } from '../components/AgeGateModal'
import HentaiCard from '../components/HentaiCard'
import { useNoIndex, usePageMeta } from '../data/pageMeta'
import './hentai-catalog.css'
import './hentai-manga.css'

export default function HentaiMangaHome() {
  usePageMeta('Хентай Манга — читать онлайн (18+)', 'Каталог хентай-манги, додзинси и вебтунов 18+. Удобное чтение онлайн бесплатно на AnimeLife.')
  useNoIndex(true)
  const [params, setParams] = useSearchParams()

  const currentSort = params.get('order') || 'popularity'
  const page = Math.max(1, parseInt(params.get('page') || '1', 10))

  const [items, setItems] = useState<Anime[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [unlocked, setUnlocked] = useState(isAgeVerified)

  useEffect(() => {
    if (!unlocked) return
    let alive = true
    setLoading(true)
    setLoadError(false)

    searchHentaiMangas({
      page,
      order: currentSort as 'popularity' | 'ranked',
    })
      .then((data) => {
        if (!alive) return
        setItems(data)
        setLoading(false)
        setLoadError(false)
      })
      .catch(() => {
        if (!alive) return
        setItems([])
        setLoading(false)
        setLoadError(true)
      })

    return () => {
      alive = false
    }
  }, [unlocked, currentSort, page, reloadToken])

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
          <span className="hentai-header__badge-dot" aria-hidden />
          18+ Контент для взрослых
        </span>
        <h1 className="hentai-header__title">Хентай Манга & Додзинси</h1>
        <p className="hentai-header__desc">
          Коллекция манги для взрослых, додзинси и веб-комиксов 18+. Переводы на русский язык, высокое разрешение страниц.
        </p>

        <div className="hentai-switch" role="tablist" aria-label="Тип контента 18+">
          <Link to="/hentai" role="tab" aria-selected={false} className="hentai-switch__btn">
            Аниме (Видео)
          </Link>
          <Link to="/hentai-manga" role="tab" aria-selected className="hentai-switch__btn is-active">
            Хентай Манга
          </Link>
        </div>
      </header>

      {!unlocked ? (
        <section className="hentai-shell" aria-hidden>
          <p className="hentai-shell__title">Каталог скрыт до подтверждения возраста</p>
          <p className="hentai-shell__hint">
            Когда возраст будет подтверждён, здесь появятся обложки и сортировка. Используйте окно проверки выше.
          </p>
        </section>
      ) : (
        <section className="stack">
          <div className="hentai-manga-toolbar">
            <div className="hentai-manga-toolbar__block">
              <span className="hentai-manga-toolbar__label" id="hentai-manga-sort-label">
                Сортировка
              </span>
              <div className="hentai-manga-chips" role="group" aria-labelledby="hentai-manga-sort-label">
                <button
                  type="button"
                  className={currentSort === 'popularity' ? 'is-on' : ''}
                  aria-pressed={currentSort === 'popularity'}
                  onClick={() => setSort('popularity')}
                >
                  Популярное
                </button>
                <button
                  type="button"
                  className={currentSort === 'ranked' ? 'is-on' : ''}
                  aria-pressed={currentSort === 'ranked'}
                  onClick={() => setSort('ranked')}
                >
                  По рейтингу
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="hentai-manga-grid hentai-skeleton-grid" aria-busy="true" aria-live="polite">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="poster-card skeleton" style={{ borderRadius: 'var(--radius-md)' }} />
              ))}
            </div>
          ) : loadError ? (
            <div className="hentai-error" role="status">
              <p className="hentai-error__title">Не удалось загрузить мангу</p>
              <p className="hentai-error__text">Проверьте соединение и попробуйте обновить список.</p>
              <button type="button" className="btn btn--accent" onClick={() => setReloadToken((n) => n + 1)}>
                Повторить
              </button>
            </div>
          ) : items.length > 0 ? (
            <div className="hentai-manga-grid">
              {items.map((item, idx) => (
                <HentaiCard key={item.id} anime={item} priority={idx < 4} isManga />
              ))}
            </div>
          ) : (
            <div className="hentai-empty">
              <p className="hentai-empty__title">Пока пусто</p>
              <p className="hentai-empty__text">По текущим параметрам ничего не нашлось — смените сортировку или загляните позже.</p>
            </div>
          )}

          <nav className="hentai-pagination" aria-label="Страницы каталога манги">
            {page > 1 && (
              <button type="button" className="btn btn--ghost" onClick={() => setPage(page - 1)}>
                ← Назад
              </button>
            )}
            {!loadError && items.length >= 24 && (
              <button type="button" className="btn btn--accent" onClick={() => setPage(page + 1)}>
                Дальше →
              </button>
            )}
          </nav>
        </section>
      )}
    </main>
  )
}
