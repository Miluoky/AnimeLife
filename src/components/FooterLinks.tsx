import { Link } from 'react-router-dom'
import { ABOUT_LINKS, DISCLAIMER, GENRES, KINDS, LEGAL_LINKS, TELEGRAM_CHANNEL_URL } from '../data/seo'
import './footer-channel.css'
import './footer.css'

const SECTIONS: [string, string][] = [
  ['Топ-100 аниме', '/top'],
  ['Подборки', '/collections'],
  ['Хронологии франшиз', '/chronology/fate'],
  ['Тропы и темы', '/trope/op-from-start'],
  ['Студии озвучки', '/voice/anilibria'],
  ['Случайное аниме', '/random'],
  ['Угадай аниме по кадру', '/quiz'],
  ['Найти аниме по скриншоту', '/scene'],
  ['Читать мангу', '/manga'],
  ['Новости аниме', '/news'],
  ['Аниме сезона', '/season'],
  ['Сообщество и клубы', '/community'],
  ['Итоги года', '/recap'],
  ['Что нового', '/changelog'],
]

/**
 * Подвал: Telegram, документы, SEO-ссылки по секциям (разделы / жанры / типы и годы).
 */
export default function FooterLinks() {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <a className="footer-channel" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener">
          <span className="footer-channel__text">
            <strong>Telegram-канал Anime Life</strong>
            <span>Новые серии, анонсы сезона и «Серия недели» каждое воскресенье</span>
          </span>
          <span className="btn btn--accent btn--small">Подписаться</span>
        </a>

        <section className="footer-block" aria-labelledby="footer-about">
          <h2 id="footer-about" className="footer-heading">
            О сайте
          </h2>
          <nav className="footer-legal" aria-label="Документы">
            {[...ABOUT_LINKS, ...LEGAL_LINKS].map(([name, to]) => (
              <Link key={to} to={to}>
                {name}
              </Link>
            ))}
          </nav>
        </section>

        <div className="footer-grid">
          <nav className="footer-col" aria-label="Разделы">
            <h2 className="footer-heading">Разделы</h2>
            <ul className="footer-list">
              {SECTIONS.map(([name, to]) => (
                <li key={to}>
                  <Link to={to}>{name}</Link>
                </li>
              ))}
              <li>
                <Link to="/en" hrefLang="en" lang="en">
                  English
                </Link>
              </li>
            </ul>
          </nav>

          <nav className="footer-col" aria-label="Жанры">
            <h2 className="footer-heading">Жанры</h2>
            <ul className="footer-list">
              {GENRES.slice(0, 12).map((g) => (
                <li key={g.slug}>
                  <Link to={`/genre/${g.slug}`}>{g.name}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer-col" aria-label="Типы и годы">
            <h2 className="footer-heading">Типы и годы</h2>
            <ul className="footer-list">
              {Object.entries(KINDS).map(([id, h1]) => (
                <li key={id}>
                  <Link to={`/type/${id}`}>{h1}</Link>
                </li>
              ))}
              {[year, year - 1].map((y) => (
                <li key={y}>
                  <Link to={`/year/${y}`}>Аниме {y} года</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="footer-note">{DISCLAIMER}</p>
      </div>
    </footer>
  )
}
