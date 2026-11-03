import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import VoiceLogo from '../components/VoiceLogo'
import VoiceoverFilter, {
  getVoiceStudioBySlug,
  VOICE_STUDIOS,
} from '../components/VoiceoverFilter'
import CatalogGrid from '../components/CatalogGrid'
import Pager from '../components/Pager'
import { useCanonical, useJsonLd, usePageMeta } from '../data/pageMeta'
import {
  formatVoiceStudioDescription,
  formatVoiceStudioH1,
  formatVoiceStudioH2,
  formatVoiceStudioTitle,
} from '../utils/seoTemplates'
import { getCircularLinks } from '../data/semanticClusters'
import { GENRES, PAGE_SIZE, pageParam } from '../data/seo'
import type { CatalogOrder } from '../api'

export default function VoiceStudioPage() {
  const { studio_slug = 'anilibria' } = useParams()
  const [params, setParams] = useSearchParams()

  const studio = useMemo(() => getVoiceStudioBySlug(studio_slug), [studio_slug])

  // Filter states synchronized with URL search params or local state
  const genre = params.get('genre') ?? ''
  const status = (params.get('status') as 'ongoing' | 'released' | 'anons' | null) ?? ''
  const order = (params.get('order') as CatalogOrder | null) ?? 'popularity'
  const search = params.get('q') ?? ''
  const page = pageParam(params.get('page'))

  // How many items arrived on page 1 for pager
  const queryKey = `${studio.slug}:${genre}:${status}:${order}:${search}:${page}`
  const [firstBatch, setFirstBatch] = useState<[string, number]>()

  // Scroll to top on studio change or page change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [studio.slug, page])

  // Dynamic SEO Title & Description
  const metaTitle = formatVoiceStudioTitle(studio.name)
  const metaDescription = formatVoiceStudioDescription(studio.name, studio.stats.releases)
  const pageSuffix = page > 1 ? ` — Страница ${page}` : ''

  usePageMeta(`${metaTitle}${pageSuffix}`, metaDescription)
  useCanonical()

  // Dynamic Schema.org JSON-LD
  const canonicalUrl = `https://animelife.top/voice/${studio.slug}${page > 1 ? `?page=${page}` : ''}`
  useJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
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
          name: 'Студии озвучки',
          item: 'https://animelife.top/catalog',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: studio.name,
          item: `https://animelife.top/voice/${studio.slug}`,
        },
      ],
    },
    mainEntity: {
      '@type': 'Organization',
      name: studio.name,
      alternateName: studio.russianName,
      description: studio.bio,
      knowsAbout: ['Аниме', 'Русская озвучка', 'Дубляж', 'Фандаб'],
    },
  })

  // URL search params updater helper
  const updateParams = (newParams: Record<string, string | null | undefined>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, val] of Object.entries(newParams)) {
          if (!val) {
            next.delete(key)
          } else {
            next.set(key, val)
          }
        }
        // Reset page to 1 when changing filters
        if (!('page' in newParams)) {
          next.delete('page')
        }
        return next
      },
      { replace: true },
    )
  }

  // Circular cross-linking items
  const circularItems = useMemo(
    () => getCircularLinks(`voice-${studio.slug}`, 4),
    [studio.slug],
  )

  // Other voiceover studios for cross-linking
  const otherStudios = useMemo(
    () => VOICE_STUDIOS.filter((s) => s.slug !== studio.slug),
    [studio.slug],
  )

  // Popular genres subset for quick jump
  const topGenres = useMemo(() => GENRES.slice(0, 8), [])

  // Catalog query object for CatalogGrid
  const catalogQuery = useMemo(
    () => ({
      genre: genre ? Number(genre) || genre : undefined,
      status: status || undefined,
      order,
      search: search || undefined,
    }),
    [genre, status, order, search],
  )

  return (
    <main className="container home voice-studio-page">
      {/* Breadcrumbs navigation */}
      <section className="stack">
        <nav className="crumbs muted" aria-label="Хлебные крошки" style={{ marginBottom: '8px' }}>
          <Link to="/">Главная</Link>
          {' › '}
          <Link to="/catalog">Каталог</Link>
          {' › '}
          <span style={{ color: 'var(--text)' }}>Озвучка: {studio.name}</span>
        </nav>

        {/* Studio Profile Header Card */}
        <div
          className="studio-profile-card"
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
            border: '1px solid var(--line)',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: '0 12px 40px rgb(0 0 0 / 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '20px',
              alignItems: 'center',
            }}
          >
            {/* Logo / Monogram */}
            <div style={{ flexShrink: 0 }}>
              <VoiceLogo title={studio.name} size={76} />
            </div>

            {/* Title & Badges */}
            <div style={{ flex: '1 1 260px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: 'color-mix(in srgb, var(--accent) 20%, var(--surface))',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent-soft)',
                  }}
                >
                  {studio.badge}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Основана в {studio.stats.founded} г.
                </span>
              </div>

              <h1 className="page-title" style={{ margin: 0, fontSize: 'clamp(22px, 3.8vw, 32px)' }}>
                {formatVoiceStudioH1(studio.name)}
                {pageSuffix}
              </h1>
            </div>
          </div>

          {/* Studio Bio */}
          <p
            className="soft"
            style={{
              margin: 0,
              fontSize: '15px',
              lineHeight: 1.6,
              color: 'var(--text-soft)',
              maxWidth: '840px',
            }}
          >
            {studio.bio}
          </p>

          {/* Stats Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'rgb(0 0 0 / 0.25)',
              border: '1px solid var(--line)',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Переведено тайтлов</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                {studio.stats.releases.toLocaleString('ru-RU')}+
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Рейтинг зрителей</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#ffd166' }}>
                ★ {studio.stats.rating}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Тип перевода</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', paddingTop: '2px' }}>
                {studio.stats.type}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Команда озвучки</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', paddingTop: '2px' }}>
                {studio.team.length} голосов
              </div>
            </div>
          </div>

          {/* Dub Team Members */}
          {studio.team.length > 0 && (
            <div>
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--muted)',
                  marginBottom: '10px',
                }}
              >
                {formatVoiceStudioH2('actors', studio.name)}
              </h2>
              <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {studio.team.map((actor) => (
                  <span
                    key={actor}
                    className="pill"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      padding: '5px 12px',
                    }}
                  >
                    🎙️ {actor}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Popular Anime by Studio */}
          {studio.popularTitles.length > 0 && (
            <div style={{ paddingTop: '4px' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
                Популярные тайтлы в озвучке:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {studio.popularTitles.map((title) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => updateParams({ q: title })}
                    className="pill pill--link"
                    style={{
                      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      padding: '4px 10px',
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
      </section>

      {/* Catalog & Filter Section */}
      <section className="stack" style={{ marginTop: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'clamp(18px, 3vw, 24px)' }}>
              {formatVoiceStudioH2('catalog', studio.name)}
            </h2>
            <p className="soft" style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--muted)' }}>
              Фильтруйте по жанрам, статусу онгоинга и сортируйте каталог
            </p>
          </div>
        </div>

        {/* Interactive Voiceover Filter Component */}
        <VoiceoverFilter
          selectedStudio={studio.slug}
          selectedGenre={genre}
          selectedStatus={status}
          selectedOrder={order}
          searchQuery={search}
          onGenreChange={(val) => updateParams({ genre: val })}
          onStatusChange={(val) => updateParams({ status: val })}
          onOrderChange={(val) => updateParams({ order: val })}
          onSearchChange={(val) => updateParams({ q: val })}
          onReset={() => updateParams({ genre: null, status: null, order: 'popularity', q: null })}
          showStudioSelector={false}
        />

        {/* Filtered Anime Grid */}
        <CatalogGrid
          key={queryKey}
          query={catalogQuery}
          start={page}
          onFirst={(n) => setFirstBatch([queryKey, n])}
        />

        {/* Pager if multiple pages */}
        {firstBatch?.[0] === queryKey && (
          <Pager
            page={page}
            hasNext={firstBatch[1] === PAGE_SIZE}
            href={(n) => {
              const p = new URLSearchParams(params)
              if (n > 1) p.set('page', String(n))
              else p.delete('page')
              const qs = p.toString()
              return `/voice/${studio.slug}${qs ? `?${qs}` : ''}`
            }}
          />
        )}
      </section>

      {/* Cross-linking: Other Voice Studios */}
      <section className="stack" style={{ marginTop: '40px' }}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Другие популярные студии озвучки</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
          }}
        >
          {otherStudios.map((other) => (
            <Link
              key={other.slug}
              to={`/voice/${other.slug}`}
              className="card-studio-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '12px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                textDecoration: 'none',
                color: 'var(--text)',
                transition: 'all 0.2s ease',
              }}
            >
              <VoiceLogo title={other.name} size={42} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {other.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                  {other.badge} · {other.stats.releases}+
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Circular Cross-Linking: Rings and Related Topics */}
      {circularItems.length > 0 && (
        <section className="stack" style={{ marginTop: '36px' }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Рекомендуемые разделы и подборки</h2>
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
                  transition: 'border-color 0.2s ease, transform 0.2s ease',
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

      {/* Popular Genres Cross-Linking */}
      <section className="stack" style={{ marginTop: '36px', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Аниме по жанрам</h2>
        <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {topGenres.map((g) => (
            <Link
              key={g.slug}
              to={`/genre/${g.slug}`}
              className="pill pill--link"
              style={{
                fontSize: '13px',
                padding: '6px 14px',
                borderRadius: '999px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
              }}
            >
              {g.name}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
