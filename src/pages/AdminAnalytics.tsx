import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { loadAnalyticsStats, type AnalyticsStats } from '../data/analytics'

export default function AdminAnalytics() {
  const { checking, user } = useAuth()
  const [stats, setStats] = useState<AnalyticsStats>()
  const [error, setError] = useState('')
  const admin = user?.labels?.includes('admin')

  useEffect(() => {
    if (!admin) return
    loadAnalyticsStats().then(setStats).catch((cause) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить статистику.'))
  }, [admin])

  if (checking) return <main className="container page-fallback" aria-busy="true" />
  if (!admin) {
    return <main className="container empty-state"><h1>Доступ закрыт</h1><p>Эта страница доступна только администраторам.</p><Link className="btn" to="/">На главную</Link></main>
  }
  return (
    <main className="container page-section">
      <h1>Статистика сайта</h1>
      {error && <p className="notice notice--error">{error}</p>}
      {stats && <>
        <div className="stats-grid">
          <div><strong>{stats.online}</strong><span>Онлайн сейчас</span></div>
          <div><strong>{stats.visitors.today}</strong><span>Посетители за сутки</span></div>
          <div><strong>{stats.visitors.week}</strong><span>За 7 дней</span></div>
          <div><strong>{stats.visitors.month}</strong><span>За 30 дней</span></div>
        </div>
        <section><h2>Популярные страницы</h2><ul>{stats.popular.map((item) => <li key={item.path}><span>{item.path}</span><strong>{item.views}</strong></li>)}</ul></section>
      </>}
    </main>
  )
}