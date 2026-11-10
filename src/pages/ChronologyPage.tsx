import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ANIME_FRANCHISES,
  getFranchiseById,
  type Franchise,
} from '../data/franchises'
import FranchiseTimeline from '../components/FranchiseTimeline'
import SeoMeta from '../components/SeoMeta'
import { useCanonical, usePageMeta } from '../data/pageMeta'
import {
  formatFranchiseDescription,
  formatFranchiseH1,
  formatFranchiseH2,
  formatFranchiseTitle,
} from '../utils/seoTemplates'
import { getCircularLinks } from '../data/semanticClusters'
import NotFound from './NotFound'

export default function ChronologyPage() {
  const { id = '' } = useParams()
  const franchise = useMemo(() => getFranchiseById(id), [id])
  if (!franchise) {
    return (
      <NotFound
        title="Хронология не найдена"
        text="Такой франшизы в наших гидах нет — проверьте адрес или выберите другую хронологию."
      />
    )
  }
  return <ChronologyContent franchise={franchise} />
}

function ChronologyContent({ franchise }: { franchise: Franchise }) {

  // Watch order mode: default to recommended or first order
  const [activeOrderId, setActiveOrderId] = useState<'chronological' | 'release' | 'recommended'>(
    franchise.watchOrders[0]?.id ?? 'recommended',
  )

  // Scroll to top on franchise change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setActiveOrderId(franchise.watchOrders[0]?.id ?? 'recommended')
  }, [franchise.id])

  // Dynamic SEO Meta
  const metaTitle = formatFranchiseTitle(franchise.title)
  const metaDescription = formatFranchiseDescription(franchise.title, franchise.items.length)
  usePageMeta(metaTitle, metaDescription)
  useCanonical()

  const canonicalUrl = `https://animelife.top/chronology/${franchise.id}`
  const pageSchema = useMemo(
    () => ({
      '@type': 'WebPage',
      name: metaTitle,
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
            name: 'Хронологии франшиз',
            item: 'https://animelife.top/catalog',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: franchise.title,
            item: canonicalUrl,
          },
        ],
      },
      mainEntity: {
        '@type': 'ItemList',
        name: formatFranchiseH1(franchise.title),
        numberOfItems: franchise.items.length,
        itemListElement: franchise.items.map((item, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: item.title,
          description: item.synopsis,
        })),
      },
    }),
    [canonicalUrl, franchise.items, franchise.title, metaDescription, metaTitle],
  )

  // Circular cross-linking
  const circularItems = useMemo(
    () => getCircularLinks(`chronology-${franchise.id}`, 4),
    [franchise.id],
  )

  // Other franchises for quick switching
  const otherFranchises = useMemo(
    () => ANIME_FRANCHISES.filter((f) => f.id !== franchise.id),
    [franchise.id],
  )

  const activeOrderDetails = useMemo(
    () => franchise.watchOrders.find((o) => o.id === activeOrderId) || franchise.watchOrders[0],
    [franchise.watchOrders, activeOrderId],
  )

  return (
    <main className="container home chronology-page" style={{ paddingBottom: '60px' }}>
      <SeoMeta faq={franchise.faq?.length ? franchise.faq : undefined} items={[pageSchema]} />
      {/* Breadcrumbs */}
      <section className="stack">
        <nav className="crumbs muted" aria-label="Хлебные крошки" style={{ marginBottom: '12px' }}>
          <Link to="/">Главная</Link>
          {' › '}
          <Link to="/catalog">Каталог</Link>
          {' › '}
          <span style={{ color: 'var(--text)' }}>Хронология: {franchise.title}</span>
        </nav>

        {/* Hero Card */}
        <div
          style={{
            position: 'relative',
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
            border: '1px solid var(--line)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 12px 40px rgb(0 0 0 / 0.35)',
            marginBottom: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--accent)',
                letterSpacing: '0.06em',
              }}
            >
              {franchise.badge}
            </span>
            <span style={{ color: 'var(--line)' }}>•</span>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {franchise.items.length} экранизаций
            </span>
          </div>

          <h1
            style={{
              margin: '0 0 6px 0',
              fontSize: 'clamp(22px, 3.8vw, 32px)',
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            {formatFranchiseH1(franchise.title)}
          </h1>

          {franchise.originalTitle && (
            <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '16px' }}>
              {franchise.originalTitle}
            </div>
          )}

          <p
            style={{
              fontSize: '15px',
              color: 'var(--text)',
              lineHeight: 1.6,
              maxWidth: '820px',
              margin: '0 0 20px 0',
              opacity: 0.92,
            }}
          >
            {franchise.description}
          </p>

          {/* Beginner Tip Callout */}
          {franchise.beginnerTip && (
            <div
              style={{
                background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
                borderLeft: '4px solid var(--accent)',
                borderRadius: '0 12px 12px 0',
                padding: '16px 20px',
                marginTop: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--accent)',
                  textTransform: 'uppercase',
                  marginBottom: '4px',
                }}
              >
                💡 {formatFranchiseH2('guide', franchise.title)}
              </div>
              <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text)' }}>
                {franchise.beginnerTip}
              </div>
            </div>
          )}
        </div>

        {/* Watch Order Selector Tabs */}
        {franchise.watchOrders.length > 1 && (
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
              Выберите порядок просмотра
            </h2>
            <div
              className="chips"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              {franchise.watchOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setActiveOrderId(order.id)}
                  className={`pill ${activeOrderId === order.id ? 'active' : ''}`}
                  style={{
                    background: activeOrderId === order.id ? 'var(--accent)' : 'var(--surface)',
                    color: activeOrderId === order.id ? '#fff' : 'var(--text)',
                    border: '1px solid var(--line)',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {order.title}
                </button>
              ))}
            </div>

            {/* Active Order Description Box */}
            {activeOrderDetails && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ color: 'var(--text)', marginBottom: '4px' }}>
                  {activeOrderDetails.description}
                </div>
                <div style={{ color: '#22c55e', fontSize: '12px' }}>
                  ✓ Плюсы: {activeOrderDetails.pros}
                </div>
                {activeOrderDetails.cons && (
                  <div style={{ color: '#f59e0b', fontSize: '12px', marginTop: '2px' }}>
                    ⚠ Особенности: {activeOrderDetails.cons}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Timeline Visualization */}
        <section>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '24px 0 8px 0' }}>
            {activeOrderId === 'release'
              ? formatFranchiseH2('release_order', franchise.title)
              : formatFranchiseH2('timeline', franchise.title)}
          </h2>
          <FranchiseTimeline franchise={franchise} activeOrderId={activeOrderId} />
        </section>

        {/* FAQ Accordion Section */}
        {franchise.faq && franchise.faq.length > 0 && (
          <section style={{ marginTop: '48px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
              Частые вопросы о хронологии {franchise.title}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {franchise.faq.map((item, index) => (
                <details
                  key={index}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                  }}
                >
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '15px',
                      color: 'var(--text)',
                      userSelect: 'none',
                    }}
                  >
                    {item.question}
                  </summary>
                  <p
                    style={{
                      margin: '12px 0 0 0',
                      fontSize: '14px',
                      lineHeight: 1.6,
                      color: 'var(--text)',
                      opacity: 0.88,
                    }}
                  >
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Other Franchises Grid */}
        <section style={{ marginTop: '48px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
            Другие популярные хронологии аниме
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '14px',
            }}
          >
            {otherFranchises.map((item) => (
              <Link
                key={item.id}
                to={`/chronology/${item.id}`}
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
                  {item.title}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {item.items.length} частей в серии
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Circular Cross-Linking Ring */}
        {circularItems.length > 0 && (
          <section style={{ marginTop: '44px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px' }}>
              Рекомендуемые разделы и озвучки
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
