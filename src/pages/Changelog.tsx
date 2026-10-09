import { Link } from 'react-router-dom'
import { usePageMeta } from '../data/pageMeta'
import { CHANGELOG } from '../data/changelog'
import './changelog.css'

const dateFmt = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })

/** «Что нового»: обновления сайта по дням, новые сверху. Пункт со ссылкой ведёт туда, где это посмотреть. */
export default function Changelog() {
  usePageMeta('Что нового', 'Обновления Anime Life: новые разделы, функции плеера и исправления.')
  return (
    <main className="container changelog">
      <header className="changelog__head">
        <h1 className="page-title">Что нового</h1>
        <p className="muted">Что появилось на сайте за последнее время. Новые обновления сверху.</p>
      </header>
      <ol className="changelog__list">
        {CHANGELOG.map((day) => (
          <li key={day.date} className="changelog__day">
            <time dateTime={day.date} className="changelog__date">
              {dateFmt.format(new Date(`${day.date}T12:00:00`))}
            </time>
            <ul className="changelog__items">
              {day.items.map((item) => (
                <li key={item.title} className="changelog__item">
                  <span className={`changelog__tag changelog__tag--${item.kind}`}>{TAGS[item.kind]}</span>
                  <div>
                    <h2 className="changelog__title">{item.to ? <Link to={item.to}>{item.title}</Link> : item.title}</h2>
                    <p className="muted">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </main>
  )
}

const TAGS = { new: 'Новое', better: 'Лучше', fix: 'Исправлено' }
