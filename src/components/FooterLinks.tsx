import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ABOUT_LINKS, CONTACT_EMAIL, DISCLAIMER, GENRES, KINDS, LEGAL_LINKS, TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '../data/seo'
import './footer-channel.css'

/** Значки 24×24 без заливки фона: currentColor, чтобы при наведении менялись вместе с текстом. */
const ICONS = {
  telegram:
    'M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.2c.4-.3-.1-.5-.6-.2L6.4 13 1.6 11.5c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z',
  bot: 'M12 2a1.5 1.5 0 0 1 .8 2.8V6H17a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h4.2V4.8A1.5 1.5 0 0 1 12 2zM9 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM1 11h2v5H1zm20 0h2v5h-2z',
  mail: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.4V17h16V7.4l-8 5.3-8-5.3zM5.6 7l6.4 4.3L18.4 7H5.6z',
}

const SOCIAL: [keyof typeof ICONS, string, string][] = [
  ['telegram', 'Telegram-канал Anime Life', TELEGRAM_CHANNEL_URL],
  ['bot', 'Бот Anime Life в Telegram: вход и уведомления о сериях', TELEGRAM_BOT_URL],
  ['mail', `Написать на почту ${CONTACT_EMAIL}`, `mailto:${CONTACT_EMAIL}`],
]

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d={ICONS[name]} fillRule="evenodd" />
    </svg>
  )
}

/**
 * Колонка ссылок с заголовком в духе «Кадра»: номер дорожки и служебная надпись. Заголовок — не h2 и не подпись
 * области: «Жанры» и «Год» уже есть на страницах как заголовки и поля фильтров, подвал не должен с ними путаться.
 */
function Column({ n, title, wide, children }: { n: string; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'foot-col foot-col--wide' : 'foot-col'}>
      <p className="foot-col__title">
        <span>{n}</span>
        {title}
      </p>
      <div className="foot-col__links">{children}</div>
    </div>
  )
}

/**
 * Подвал: колонки «Смотреть», «Жанры», «Форматы и годы», «Сообщество», «О проекте» — с любой страницы видно,
 * что ещё есть на сайте, а поисковик находит посадочные страницы жанров, типов и годов. Сверху — описание,
 * значки Telegram-канала, бота и почты, снизу — строка о видео и каталоге. Отдельная часть, грузится следом.
 */
export default function FooterLinks() {
  const year = new Date().getFullYear()
  return (
    <>
      <div className="foot-about">
        <p>Смотрите аниме онлайн с русской озвучкой и субтитрами, ведите свой список и собирайте друзей на совместный просмотр.</p>
        <div className="foot-social">
          {SOCIAL.map(([icon, label, href]) => (
            <a key={icon} href={href} aria-label={label} title={label} {...(icon === 'mail' ? {} : { target: '_blank', rel: 'noopener' })}>
              <Icon name={icon} />
            </a>
          ))}
        </div>
      </div>
      <a className="footer-channel frame-corners" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener">
        <span className="footer-channel__icon">
          <Icon name="telegram" />
        </span>
        <span className="footer-channel__text">
          <strong>Telegram-канал Anime Life</strong>
          <span>Новые серии, анонсы сезона и «Серия недели» каждое воскресенье</span>
        </span>
        <span className="btn btn--accent btn--small">Подписаться</span>
      </a>
      <nav className="foot-cols" aria-label="Ссылки в подвале">
        <Column n="01" title="Смотреть">
          <Link to="/top">Топ-100 аниме</Link>
          <Link to="/season">Аниме сезона</Link>
          <Link to="/collections">Подборки</Link>
          <Link to="/random">Случайное аниме</Link>
          <Link to="/news">Новости аниме</Link>
          <Link to="/changelog">Что нового</Link>
        </Column>
        <Column n="02" title="Жанры" wide>
          {GENRES.slice(0, 12).map((g) => (
            <Link key={g.slug} to={`/genre/${g.slug}`}>
              {g.name}
            </Link>
          ))}
        </Column>
        <Column n="03" title="Форматы и годы">
          {Object.entries(KINDS).map(([id, h1]) => (
            <Link key={id} to={`/type/${id}`}>
              {h1}
            </Link>
          ))}
          {[year, year - 1].map((y) => (
            <Link key={y} to={`/year/${y}`}>
              Аниме {y} года
            </Link>
          ))}
        </Column>
        <Column n="04" title="Сообщество">
          <Link to="/community">Сообщество и клубы</Link>
          <Link to="/quiz">Угадай аниме по кадру</Link>
          <Link to="/scene">Найти аниме по скриншоту</Link>
          <Link to="/recap">Итоги года</Link>
        </Column>
        <Column n="05" title="О проекте">
          {[...ABOUT_LINKS, ...LEGAL_LINKS].map(([name, to]) => (
            <Link key={to} to={to}>
              {name}
            </Link>
          ))}
          <Link to="/en" hrefLang="en" lang="en">
            English
          </Link>
        </Column>
      </nav>
      <div className="foot-bottom">
        <span className="foot-bottom__rec">© {year} Anime Life</span>
        <p className="footer-note">{DISCLAIMER}</p>
      </div>
    </>
  )
}
