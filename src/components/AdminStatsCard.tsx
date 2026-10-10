import { Link } from 'react-router-dom'
import { AnalyticsSummary, useAnalyticsStats } from '../pages/AdminAnalytics'

/** Сводка посещений в профиле администратора; данные отдаёт сервер только аккаунту с меткой admin. */
export default function AdminStatsCard() {
  const { stats, error, loading, reload } = useAnalyticsStats(true)
  return (
    <section className="auth-card stack an-profile" aria-label="Статистика сайта">
      <div className="an-head">
        <h2 style={{ margin: 0, fontSize: 18 }}>Статистика сайта</h2>
        <button type="button" className="btn btn--ghost" onClick={reload} disabled={loading}>
          {loading ? 'Обновляю…' : 'Обновить'}
        </button>
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      {stats ? <AnalyticsSummary stats={stats} /> : !error && <p className="muted" aria-busy="true">Загружаю…</p>}
      <div className="actions">
        <Link to="/admin/analytics" className="btn btn--accent">
          Вся статистика
        </Link>
      </div>
    </section>
  )
}
