import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Franchise, FranchiseItem, ItemImportance } from '../data/franchises'
import { prefetchTitle } from '../api/prefetch'

interface FranchiseTimelineProps {
  franchise: Franchise
  activeOrderId: 'chronological' | 'release' | 'recommended'
}

const IMPORTANCE_LABELS: Record<ItemImportance, { label: string; bg: string; color: string }> = {
  essential: {
    label: 'Обязательно',
    bg: 'color-mix(in srgb, #ef4444 15%, transparent)',
    color: '#ef4444',
  },
  recommended: {
    label: 'Рекомендуется',
    bg: 'color-mix(in srgb, #3b82f6 15%, transparent)',
    color: '#60a5fa',
  },
  optional: {
    label: 'Опционально',
    bg: 'color-mix(in srgb, var(--muted) 20%, transparent)',
    color: 'var(--muted)',
  },
  'spin-off': {
    label: 'Спин-офф',
    bg: 'color-mix(in srgb, #a855f7 15%, transparent)',
    color: '#c084fc',
  },
  alternate: {
    label: 'Альтернатива',
    bg: 'color-mix(in srgb, #eab308 15%, transparent)',
    color: '#facc15',
  },
}

const TYPE_LABELS: Record<string, string> = {
  TV: 'ТВ-сериал',
  Movie: 'Фильм',
  OVA: 'OVA',
  ONA: 'ONA',
  Special: 'Спешл',
}

export default function FranchiseTimeline({ franchise, activeOrderId }: FranchiseTimelineProps) {
  // Sort items based on the active watch order
  const sortedItems = useMemo(() => {
    const list = [...franchise.items]
    if (activeOrderId === 'release') {
      return list.sort((a, b) => a.releaseOrder - b.releaseOrder)
    }
    // Default to chronological order
    return list.sort((a, b) => a.chronologicalOrder - b.chronologicalOrder)
  }, [franchise.items, activeOrderId])

  return (
    <div className="franchise-timeline" style={{ position: 'relative', marginTop: '24px' }}>
      {/* Central Guide Line */}
      <div
        style={{
          position: 'absolute',
          top: '24px',
          bottom: '24px',
          left: '20px',
          width: '2px',
          background: 'linear-gradient(to bottom, var(--accent) 0%, var(--line) 50%, var(--accent) 100%)',
          opacity: 0.6,
        }}
        aria-hidden="true"
      />

      {/* Timeline entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {sortedItems.map((item: FranchiseItem, index: number) => {
          const importance = IMPORTANCE_LABELS[item.importance] || IMPORTANCE_LABELS.optional
          const typeName = TYPE_LABELS[item.type] || item.type
          const stepNumber = index + 1
          const animeLink = /^\d+$/.test(item.id) ? `/anime/${item.id}` : `/catalog?q=${encodeURIComponent(item.searchQuery || item.title)}`
          const playerLink = /^\d+$/.test(item.id) ? `/watch/${item.id}/1` : `/catalog?q=${encodeURIComponent(item.searchQuery || item.title)}`

          return (
            <div
              key={item.id}
              style={{
                position: 'relative',
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
              }}
            >
              {/* Stepper Node Indicator */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 2,
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'var(--surface-2)',
                  border: '2px solid var(--accent)',
                  boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 35%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                  color: 'var(--text)',
                  flexShrink: 0,
                }}
              >
                {stepNumber}
              </div>

              {/* Card Body */}
              <article
                className="timeline-card"
                onMouseEnter={() => {
                  if (/^\d+$/.test(item.id)) prefetchTitle(item.id)
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  boxShadow: '0 4px 20px rgb(0 0 0 / 0.25)',
                  transition: 'transform 0.2s ease, border-color 0.2s ease',
                }}
              >
                {/* Meta badges row */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}
                >
                  <span
                    style={{
                      background: importance.bg,
                      color: importance.color,
                      fontWeight: 700,
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    {importance.label}
                  </span>

                  <span
                    style={{
                      background: 'var(--surface-2)',
                      color: 'var(--muted)',
                      fontSize: '12px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                    }}
                  >
                    {typeName} · {item.year} г.
                  </span>

                  <span
                    style={{
                      background: 'var(--surface-2)',
                      color: 'var(--muted)',
                      fontSize: '12px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                    }}
                  >
                    {typeof item.episodes === 'number' ? `${item.episodes} эп.` : item.episodes}
                  </span>

                  {item.timelineNote && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: '12px',
                        color: 'var(--accent)',
                        fontWeight: 600,
                      }}
                    >
                      ⏱ {item.timelineNote}
                    </span>
                  )}
                </div>

                {/* Title & Romaji */}
                <h3
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '18px',
                    lineHeight: 1.3,
                  }}
                >
                  <Link
                    to={animeLink}
                    style={{
                      color: 'var(--text)',
                      textDecoration: 'none',
                    }}
                  >
                    {item.title}
                  </Link>
                </h3>

                {item.originalTitle && (
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--muted)',
                      marginBottom: '10px',
                    }}
                  >
                    {item.originalTitle}
                  </div>
                )}

                {/* Synopsis */}
                <p
                  style={{
                    margin: '0 0 14px 0',
                    fontSize: '14px',
                    color: 'var(--text)',
                    opacity: 0.88,
                    lineHeight: 1.5,
                  }}
                >
                  {item.synopsis}
                </p>

                {/* Action CTA Buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  <Link
                    to={playerLink}
                    className="btn btn--accent"
                    style={{
                      fontSize: '13px',
                      padding: '7px 16px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    ▶ Смотреть 1 серию
                  </Link>
                  <Link
                    to={animeLink}
                    className="btn btn--secondary"
                    style={{
                      fontSize: '13px',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                    }}
                  >
                    Страница тайтла
                  </Link>
                </div>
              </article>
            </div>
          )
        })}
      </div>
    </div>
  )
}
