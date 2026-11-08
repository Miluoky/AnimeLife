import { Link } from 'react-router-dom'
import { AnalyticsSummary, useAnalyticsStats } from '../pages/AdminAnalytics'

/** Сводка посещений в профиле администратора; данные отдаёт сервер только аккаунту с меткой admin. */
export default function AdminStatsCard() {
  const { stats, error, loading, reload } = useAnalyticsStats(true)
  return (
    <section className="auth-card stack an-profile" aria-labelledby="an-profile-title">
      <div className="an-head">
        <div>
          <h2 id="an-profile-title" style={{ margin: 0, fontSize: 18 }}>
            Статистика сайта
          </h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Живые метрики · календарь по Москве · без IP
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={reload} disabled={loading}>
          {loading ? 'Обновляю…' : 'Обновить'}
        </button>
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      {stats ? <AnalyticsSummary stats={stats} /> : !error && <p className="muted" aria-busy="true">Загружаю…</p>}
      {stats?.onlinePages?.length ? (
        <div className="an-profile__now">
          <h3 className="an-profile__now-title">Где сейчас</h3>
          <ul className="an-profile__now-list">
            {stats.onlinePages.slice(0, 5).map((item) => (
              <li key={item.name}>
                <Link to={item.name}>{item.name}</Link>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="actions">
        <Link to="/admin/analytics" className="btn btn--accent">
          Полный отчёт
        </Link>
        <Link to="/moderation" className="btn btn--ghost">
          Модерация
        </Link>
      </div>
      {stats && (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Обновлено {new Date(stats.generatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </section>
  )
}
