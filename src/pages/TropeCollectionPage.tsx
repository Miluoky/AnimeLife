import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  TROPE_CATEGORIES,
  getTropeBySlug,
  getTropesByCategory,
  type TropeItem,
} from '../data/animeTropes'
import CatalogGrid from '../components/CatalogGrid'
import Pager from '../components/Pager'
import { useCanonical, useJsonLd, usePageMeta } from '../data/pageMeta'
import {
  formatTropeDescription,
  formatTropeH1,
  formatTropeH2,
  formatTropeTitle,
} from '../utils/seoTemplates'
import { getCircularLinks } from '../data/semanticClusters'
import { PAGE_SIZE, pageParam } from '../data/seo'
import type { CatalogOrder } from '../api'
import NotFound from './NotFound'

export default function TropeCollectionPage() {
  const { slug = '' } = useParams()
  const trope = useMemo(() => getTropeBySlug(slug), [slug])
  if (!trope) {
    return (
      <NotFound
        title="Подборка не найдена"
        text="Такого тропа в наших подборках нет — откройте каталог или другую тему."
      />
    )
  }
  return <TropeCollectionContent trope={trope} />
}

function TropeCollectionContent({ trope }: { trope: TropeItem }) {
  const [params, setParams] = useSearchParams()

  // Filters state
  const status = (params.get('status') as 'ongoing' | 'released' | null) ?? ''
  const order = (params.get('order') as CatalogOrder | null) ?? 'popularity'
  const search = params.get('q') ?? trope.suggestedCatalogQuery.search ?? ''
  const page = pageParam(params.get('page'))

  const queryKey = `${trope.slug}:${status}:${order}:${search}:${page}`
  const [firstBatch, setFirstBatch] = useState<[string, number]>()

  // Scroll to top on trope switch or page change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [trope.slug, page])

  // Dynamic SEO Meta
  const metaTitle = formatTropeTitle(trope.name)
  const metaDescription = formatTropeDescription(trope.name, trope.shortSummary)
  const pageSuffix = page > 1 ? ` — Страница ${page}` : ''

  usePageMeta(`${metaTitle}${pageSuffix}`, metaDescription)
  useCanonical()

  // Dynamic Schema.org JSON-LD (CollectionPage + BreadcrumbList)
  const canonicalUrl = `https://animelife.top/trope/${trope.slug}${page > 1 ? `?page=${page}` : ''}`
  useJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${metaTitle}${pageSuffix}`,
    description: metaDescription,
    url: canonicalUrl,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Главная',
          item: 'https://animelife.top',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Подборки по темам и тропам',
          item: 'https://animelife.top/catalog',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: trope.name,
          item: canonicalUrl,
        },
      ],
    },
  })

  // Helper to update query parameters
  function updateParams(newParams: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, val] of Object.entries(newParams)) {
          if (val === null || val === '') {
            next.delete(key)
          } else {
            next.set(key, val)
          }
        }
        if (!('page' in newParams)) {
          next.delete('page')
        }
        return next
      },
      { replace: true },
    )
  }

  // Circular cross-linking
  const circularItems = useMemo(
    () => getCircularLinks(`trope-${trope.slug}`, 4),
    [trope.slug],
  )

  // Related tropes in the same category or explicit links
  const relatedTropes = useMemo(() => {
    if (trope.relatedSlugs.length > 0) {
      return trope.relatedSlugs
        .map((s) => getTropeBySlug(s))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
    }
    return getTropesByCategory(trope.category).filter((t) => t.slug !== trope.slug).slice(0, 4)
  }, [trope])

  // Category metadata
  const categoryInfo = useMemo(
    () => TROPE_CATEGORIES.find((c) => c.id === trope.category) ?? TROPE_CATEGORIES[0],
    [trope.category],
  )

  // Catalog query object (Omit<CatalogQuery, 'page' | 'limit'>)
  const catalogQuery = useMemo(
    () => ({
      genre: trope.suggestedCatalogQuery.genre ? String(trope.suggestedCatalogQuery.genre) : undefined,
      status: (status || trope.suggestedCatalogQuery.status) || undefined,
      order,
      search: search || undefined,
    }),
    [trope, status, order, search],
  )

  return (
    <main className="container home trope-collection-page" style={{ paddingBottom: '60px' }}>
      {/* Breadcrumbs */}
      <section className="stack">
        <nav className="crumbs muted" aria-label="Хлебные крошки" style={{ marginBottom: '12px' }}>
          <Link to="/">Главная</Link>
          {' › '}
          <Link to="/catalog">Каталог</Link>
          {' › '}
          <span style={{ color: 'var(--text)' }}>Троп: {trope.name}</span>
        </nav>

        {/* Hero Banner */}
        <div
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
            border: '1px solid var(--line)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 12px 40px rgb(0 0 0 / 0.35)',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px' }}>{categoryInfo.icon}</span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--accent)',
                letterSpacing: '0.05em',
              }}
            >
              {trope.badge}
            </span>
            <span style={{ color: 'var(--line)' }}>•</span>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{categoryInfo.name}</span>
          </div>

          <h1
            style={{
              margin: '0 0 10px 0',
              fontSize: 'clamp(22px, 3.8vw, 32px)',
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            {formatTropeH1(trope.name)}
          </h1>

          <p
            style={{
              fontSize: '15px',
              color: 'var(--text)',
              lineHeight: 1.6,
              maxWidth: '840px',
              margin: '0 0 18px 0',
              opacity: 0.92,
            }}
          >
            {trope.description}
          </p>

          {/* Trope Key Features Badges */}
          <div style={{ marginTop: '16px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              {formatTropeH2('features', trope.name)}:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {trope.features.map((feature, idx) => (
                <span
                  key={idx}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '5px 12px',
                    fontSize: '13px',
                    color: 'var(--text)',
                  }}
                >
                  ✓ {feature}
                </span>
              ))}
            </div>
          </div>

          {/* Popular Example Search Chips */}
          {trope.popularTitles.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', marginRight: '10px' }}>
                Популярные примеры тропа:
              </span>
              <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {trope.popularTitles.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => updateParams({ q: title })}
                    style={{
                      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                      borderRadius: '6px',
                      padding: '3px 10px',
                      fontSize: '12px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    🔍 {title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filter Bar */}
        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '14px',
            padding: '12px 18px',
            marginBottom: '20px',
          }}
        >
          {/* Order Sort Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Сортировка:</span>
            <div className="chips" style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => updateParams({ order: 'popularity' })}
                className={`pill ${order === 'popularity' ? 'active' : ''}`}
                style={{
                  background: order === 'popularity' ? 'var(--accent)' : 'var(--surface-2)',
                  color: order === 'popularity' ? '#fff' : 'var(--text)',
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  cursor: 'pointer',
                }}
              >
                По популярности
              </button>
              <button
                type="button"
                onClick={() => updateParams({ order: 'ranked' })}
                className={`pill ${order === 'ranked' ? 'active' : ''}`}
                style={{
                  background: order === 'ranked' ? 'var(--accent)' : 'var(--surface-2)',
                  color: order === 'ranked' ? '#fff' : 'var(--text)',
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  cursor: 'pointer',
                }}
              >
                По рейтингу
              </button>
              <button
                type="button"
                onClick={() => updateParams({ order: 'aired_on' })}
                className={`pill ${order === 'aired_on' ? 'active' : ''}`}
                style={{
                  background: order === 'aired_on' ? 'var(--accent)' : 'var(--surface-2)',
                  color: order === 'aired_on' ? '#fff' : 'var(--text)',
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  cursor: 'pointer',
                }}
              >
                По новизне
              </button>
            </div>
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => updateParams({ status: status === 'released' ? '' : 'released' })}
              style={{
                background: status === 'released' ? 'var(--accent)' : 'var(--surface-2)',
                color: status === 'released' ? '#fff' : 'var(--text)',
                fontSize: '12px',
                padding: '5px 12px',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              Завершённые
            </button>
            <button
              type="button"
              onClick={() => updateParams({ status: status === 'ongoing' ? '' : 'ongoing' })}
              style={{
                background: status === 'ongoing' ? 'var(--accent)' : 'var(--surface-2)',
                color: status === 'ongoing' ? '#fff' : 'var(--text)',
                fontSize: '12px',
                padding: '5px 12px',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              Онгоинги
            </button>
            {search && (
              <button
                type="button"
                onClick={() => updateParams({ q: '' })}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Сбросить поиск
              </button>
            )}
          </div>
        </section>

        {/* Catalog Grid of Anime */}
        <CatalogGrid
          key={queryKey}
          query={catalogQuery}
          start={page}
          onFirst={(n: number) => setFirstBatch([queryKey, n])}
        />

        {/* Pagination */}
        {firstBatch?.[0] === queryKey && (
          <Pager
            page={page}
            hasNext={firstBatch[1] === PAGE_SIZE}
            href={(n: number) => {
              const q = new URLSearchParams(params)
              if (n > 1) q.set('page', String(n))
              else q.delete('page')
              const qs = q.toString()
              return `/trope/${trope.slug}${qs ? `?${qs}` : ''}`
            }}
          />
        )}

        {/* Related Tropes Section */}
        {relatedTropes.length > 0 && (
          <section style={{ marginTop: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
              {formatTropeH2('related', trope.name)}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '14px',
              }}
            >
              {relatedTropes.map((item) => (
                <Link
                  key={item.slug}
                  to={`/trope/${item.slug}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '16px',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '14px',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'transform 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                    }}
                  >
                    {item.badge}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {item.shortSummary}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* All Tropes Category Discovery */}
        <section style={{ marginTop: '48px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
            Все тематические подборки и тропы
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {TROPE_CATEGORIES.map((cat) => {
              const catTropes = getTropesByCategory(cat.id)
              if (catTropes.length === 0) return null
              return (
                <div
                  key={cat.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '14px',
                    padding: '18px 20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{cat.icon}</span>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{cat.name}</h3>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {catTropes.map((t) => (
                      <Link
                        key={t.slug}
                        to={`/trope/${t.slug}`}
                        className={`pill ${t.slug === trope.slug ? 'active' : ''}`}
                        style={{
                          background: t.slug === trope.slug ? 'var(--accent)' : 'var(--surface-2)',
                          color: t.slug === trope.slug ? '#fff' : 'var(--text)',
                          border: '1px solid var(--line)',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {t.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Circular Cross-Linking Ring */}
        {circularItems.length > 0 && (
          <section style={{ marginTop: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px' }}>
              Популярные озвучки и хронологии
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              {circularItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.targetPath}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '14px',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                    }}
                  >
                    {item.badge}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                    {item.anchorText}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {item.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
