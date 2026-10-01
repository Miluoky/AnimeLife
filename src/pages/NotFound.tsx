import { Link } from 'react-router-dom'

export default function NotFound({ title = 'Страница не найдена' }: { title?: string }) {
  return (
    <main className="container empty-page">
      <h1>{title}</h1>
      <p className="muted">Этот раздел пока в разработке или такой страницы нет.</p>
      <Link to="/" className="btn btn--accent">
        На главную
      </Link>
    </main>
  )
}
