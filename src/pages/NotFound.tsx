import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Mascot from '../components/Mascot'
import { SparkIcon } from '../components/Icons'
import { usePageMeta } from '../data/pageMeta'
import './not-found.css'

/**
 * «Кадр потерян»: экран видоискателя без сигнала (настроечные полосы, развёртка, таймкод 404)
 * и маскот посередине. Тот же экран для «Тайтл не найден» и «Серия ещё не вышла».
 * text и action — пояснение и первая кнопка там, где известно, куда вернуть зрителя (например, к последней серии).
 */
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
    <main className="container empty-page lost">
      <div className="lost__screen frame-corners" aria-hidden="true">
        <span className="lost__hud lost__hud--tl">
          <i /> REC
        </span>
        <span className="lost__hud lost__hud--tr">EP 404</span>
        <span className="lost__center">
          <Mascot mood="lost" size={112} />
          <span className="lost__signal">Нет сигнала</span>
        </span>
        <span className="lost__hud lost__hud--bl">00:04:04</span>
        <span className="lost__hud lost__hud--br">★ —.—</span>
      </div>
      <p className="lost__code">ERR 404 · кадр потерян</p>
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
          <SparkIcon size={16} />
          Что посмотреть?
        </Link>
      </div>
    </main>
  )
}
