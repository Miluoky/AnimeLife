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
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [unlocked, setUnlocked] = useState(isAgeVerified)

  useEffect(() => {
    if (!unlocked) return
    let alive = true
    setLoading(true)
    setLoadError(false)

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
  }, [unlocked, currentTag, currentSort, page, reloadToken])

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
          <span className="hentai-header__badge-dot" aria-hidden />
          18+ Контент для взрослых
        </span>
        <h1 className="hentai-header__title">Хентай Аниме</h1>
        <p className="hentai-header__desc">
          Отдельный изолированный раздел аниме 18+. Высокое качество, субтитры и русская озвучка.
        </p>

        <div className="hentai-switch" role="tablist" aria-label="Тип контента 18+">
          <Link to="/hentai" role="tab" aria-selected className="hentai-switch__btn is-active">
            Аниме (Видео)
          </Link>
          <Link to="/hentai-manga" role="tab" aria-selected={false} className="hentai-switch__btn">
            Хентай Манга
          </Link>
        </div>
      </header>

      {!unlocked ? (
        <section className="hentai-shell" aria-hidden>
          <p className="hentai-shell__title">Каталог скрыт до подтверждения возраста</p>
          <p className="hentai-shell__hint">
            После проверки здесь появятся постеры и фильтры. Подтвердите возраст в окне выше.
          </p>
        </section>
      ) : (
        <section className="stack">
          <div className="hentai-toolbar">
            <div className="hentai-toolbar__block">
              <span className="hentai-toolbar__label">Теги</span>
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
            </div>

            <div className="hentai-toolbar__block">
              <span className="hentai-toolbar__label" id="hentai-sort-label">
                Сортировка
              </span>
              <div className="hentai-sort">
                <label htmlFor="hentai-sort" className="hentai-sort__label">
                  Порядок:
                </label>
                <select
                  id="hentai-sort"
                  value={currentSort}
                  onChange={(e) => setSort(e.target.value)}
                  className="hentai-sort__select"
                  aria-labelledby="hentai-sort-label"
                >
                  {HENTAI_SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="hentai-grid hentai-skeleton-grid" aria-busy="true" aria-live="polite">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="poster-card skeleton" style={{ borderRadius: 'var(--radius-md)' }} />
              ))}
            </div>
          ) : loadError ? (
            <div className="hentai-error" role="status">
              <p className="hentai-error__title">Не удалось загрузить каталог</p>
              <p className="hentai-error__text">Проверьте соединение и попробуйте ещё раз чуть позже.</p>
              <button type="button" className="btn btn--accent" onClick={() => setReloadToken((n) => n + 1)}>
                Повторить
              </button>
            </div>
          ) : items.length > 0 ? (
            <div className="hentai-grid">
              {items.map((item, idx) => (
                <HentaiCard key={item.id} anime={item} priority={idx < 4} />
              ))}
            </div>
          ) : (
            <div className="hentai-empty">
              <p className="hentai-empty__title">Ничего не найдено</p>
              <p className="hentai-empty__text">В этой категории сейчас нет тайтлов — сбросьте тег или выберите другой.</p>
              <button type="button" className="btn btn--ghost" onClick={() => setTag('')}>
                Сбросить фильтры
              </button>
            </div>
          )}

          <nav className="hentai-pagination" aria-label="Страницы каталога">
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
