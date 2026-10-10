import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Mascot from '../components/Mascot'
import { usePageMeta } from '../data/pageMeta'

/** text и action — пояснение и первая кнопка там, где известно, куда вернуть зрителя (например, к последней серии). */
export default function NotFound({
  title = 'Страница не найдена',
  text = 'Этот раздел пока в разработке или такой страницы нет.',
  action,
}: {
  title?: string
  text?: string
  action?: ReactNode
}) {
  usePageMeta(title)
  return (
    <main className="container empty-page">
      <Mascot mood="lost" />
      <h1>{title}</h1>
      <p className="muted">{text}</p>
      <div className="actions">
        {action}
        <Link to="/" className={`btn ${action ? 'btn--ghost' : 'btn--accent'}`}>
          На главную
        </Link>
        <Link to="/catalog" className="btn btn--ghost">
          Каталог
        </Link>
        <Link to="/random" className="btn btn--ghost">
          🎲 Что посмотреть?
        </Link>
      </div>
    </main>
  )
}
