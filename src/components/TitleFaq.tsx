import { useState } from 'react'
import { useJsonLd } from '../data/pageMeta'

export interface TitleFaqProps {
  title: string
  originalTitle?: string
  episodesTotal?: number | null
  episodesAired?: number | null
  year?: number | null
  genres?: string[]
  studio?: string | null
  status?: string
  ageRating?: string
  mangaTitle?: string
}

export default function TitleFaq({
  title,
  originalTitle,
  episodesTotal,
  episodesAired,
  year,
  genres,
  studio,
  status,
  ageRating,
  mangaTitle,
}: TitleFaqProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const isOngoing = status === 'ongoing'
  const epCount = episodesTotal || episodesAired || 'не указано'
  const genreList = genres && genres.length > 0 ? genres.join(', ') : 'аниме'

  const items = [
    {
      q: `Сколько серий в аниме «${title}»?`,
      a: isOngoing
        ? `На данный момент вышло ${episodesAired || 0} серий (всего запланировано ${episodesTotal || 'уточняется'}). Статус тайтла — онгоинг.`
        : `В аниме «${title}» ${epCount} серий. Релиз полностью завершен.`
    },
    {
      q: `В какой озвучке лучше смотреть «${title}»?`,
      a: `На AnimeLife доступны популярные варианты профессионального и любительского дубляжа: AniLibria, Studio Band, Dream Cast, SHIZA Project, а также оригинальная японская дорожка с русскими субтитрами.`
    },
    {
      q: `Какой жанр и возрастной рейтинг у «${title}»?`,
      a: `Основные жанры: ${genreList}. Возрастной рейтинг: ${ageRating || '16+'}.` + (studio ? ` Производство студии ${studio}.` : '')
    },
    ...(mangaTitle ? [{
      q: `Где продолжить читать мангу после просмотра «${title}»?`,
      a: `Первоисточником является «${mangaTitle}». Вы можете продолжить чтение манги прямо в нашей встроенной читалке манги AnimeLife.`
    }] : []),
    ...(year ? [{
      q: `В каком году вышло аниме «${title}»?`,
      a: `Премьера состоялась в ${year} году.` + (originalTitle ? ` Оригинальное название: ${originalTitle}.` : '')
    }] : [])
  ]

  // Schema.org FAQPage for Google Rich Snippets
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': items.map((item) => ({
      '@type': 'Question',
      'name': item.q,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': item.a,
      },
    })),
  }

  useJsonLd(faqSchema)

  return (
    <section className="title-faq-section" style={{ marginTop: '2.5rem', marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>
        Часто задаваемые вопросы о «{title}»
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item, idx) => {
          const isOpen = openIndex === idx
          return (
            <div
              key={idx}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'background-color 0.2s',
              }}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.85rem 1.1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  color: isOpen ? '#ff4070' : '#e2e8f0',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                }}
              >
                <span>{item.q}</span>
                <span style={{ fontSize: '1.2rem', transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>
                  +
                </span>
              </button>
              {isOpen && (
                <div
                  style={{
                    padding: '0 1.1rem 0.85rem 1.1rem',
                    fontSize: '0.9rem',
                    color: '#94a3b8',
                    lineHeight: 1.6,
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
