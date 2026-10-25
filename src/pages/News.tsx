import './top.css'
import './social.css'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../api'
import { SHIKIMORI_URL, get } from '../api/shikimori'
import { usePageMeta } from '../data/pageMeta'
import { TELEGRAM_CHANNEL_URL } from '../data/seo'
import { CalendarIcon } from '../components/Icons'

/** Новости аниме из форума новостей Shikimori: анонсы, даты премьер, новые сезоны. Тайтлы ведут на наши страницы. */
interface Topic {
  id: number
  topic_title: string
  html_body: string
  /** Картинки и видео новости Shikimori теперь кладёт сюда, а не в html_body. */
  html_footer?: string
  created_at: string
  comments_count: number
  linked_id?: number
  linked_type?: string
  linked?: { id: number; russian?: string; name: string; kind?: string }
}

const absolute = (src: string) => (src.startsWith('//') ? `https:${src}` : src.startsWith('/') ? `${SHIKIMORI_URL}${src}` : src)

function parse(html: string, footer = '') {
  const media = html + footer
  const image = media.match(/<img[^>]+src="([^"]+)"/)?.[1]
  const youtube = media.match(/youtube\.com\/(?:embed\/|watch\?v=)([\w-]{11})|youtu\.be\/([\w-]{11})/)
  const doc = new DOMParser().parseFromString(html.replace(/<br[^>]*>/g, '\n'), 'text/html')
  doc.querySelectorAll('.b-replies, .b-spoiler_marker, script, style').forEach((n) => n.remove())
  const text = (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
  return {
    image: image && absolute(image),
    youtube: youtube?.[1] ?? youtube?.[2],
    text,
  }
}

const PAGE = 16

export default function News() {
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const topics = useAsync(() => get<Topic[]>('/topics', { forum: 'news', limit: PAGE, page }).catch(() => null), [page])
  usePageMeta('Новости аниме', 'Свежие новости аниме: анонсы, даты премьер, новые сезоны и трейлеры. Из каждой новости можно перейти к тайтлу.')

  return (
    <main className="container top-page social-page">
      <header className="top-head">
        <span className="top-head__icon" aria-hidden="true">
          <CalendarIcon />
        </span>
        <div>
          <h1 className="page-title">Новости аниме</h1>
          <p className="muted top-head__lead">Анонсы, даты премьер и новые сезоны. Пишут авторы Shikimori, тайтлы открываются прямо у нас.</p>
          <a className="btn btn--ghost btn--small news-channel" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener">
            Наш Telegram-канал
          </a>
        </div>
      </header>
      {topics.loading && <p className="muted" aria-busy="true">Загружаем новости…</p>}
      {!topics.loading && topics.value === null && <div className="s-empty">Новости не загрузились. Попробуйте обновить страницу.</div>}
      <div className="news-list">
        {(topics.value ?? []).map((t) => {
          const n = parse(t.html_body, t.html_footer)
          const full = open.has(t.id)
          const anime = t.linked_type === 'Anime' && t.linked ? t.linked : undefined
          return (
            <article key={t.id} className={`news-item${n.image || n.youtube ? '' : ' news-item--text'}`}>
              {n.image ? (
                <img className="news-item__img" src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : n.youtube ? (
                <img className="news-item__img" src={`https://i.ytimg.com/vi/${n.youtube}/hqdefault.jpg`} alt="" loading="lazy" />
              ) : null}
              <div className="stack" style={{ gap: 8 }}>
                <span className="muted s-feed__when">{new Date(t.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                <h2 className="news-item__title">{t.topic_title}</h2>
                <p className={`news-item__text${full ? '' : ' news-item__text--short'}`}>{n.text}</p>
                <div className="s-row">
                  {n.text.length > 280 && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => setOpen((s) => new Set(full ? [...s].filter((x) => x !== t.id) : [...s, t.id]))}
                    >
                      {full ? 'Свернуть' : 'Читать полностью'}
                    </button>
                  )}
                  {anime && (
                    <Link to={`/anime/${anime.id}`} className="btn btn--accent btn--small news-item__anime" title={anime.russian || anime.name}>
                      <span>{anime.russian || anime.name}</span>
                    </Link>
                  )}
                  {n.youtube && (
                    <a href={`https://www.youtube.com/watch?v=${n.youtube}`} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--small">
                      Видео
                    </a>
                  )}
                  <a href={`${SHIKIMORI_URL}/forum/news/${t.id}`} target="_blank" rel="noopener noreferrer" className="muted s-feed__when">
                    Обсуждение · {t.comments_count}
                  </a>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      <div className="s-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn--ghost" disabled={page <= 1 || topics.loading} onClick={() => setPage(page - 1)}>
          Новее
        </button>
        <span className="muted">Страница {page}</span>
        <button type="button" className="btn btn--ghost" disabled={topics.loading || (topics.value?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>
          Раньше
        </button>
      </div>
    </main>
  )
}
