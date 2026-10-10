import './admin-analytics.css'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { usePageMeta } from '../data/pageMeta'
import { loadAnalyticsStats, type AnalyticsPoint, type AnalyticsStats } from '../data/analytics'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const MSK = 3 * HOUR

const DEVICE_NAMES: Record<string, string> = { mobile: 'Телефоны', tablet: 'Планшеты', desktop: 'Компьютеры' }
const SOURCE_NAMES: Record<string, string> = {
  direct: 'Напрямую и закладки',
  yandex: 'Яндекс',
  google: 'Google',
  telegram: 'Telegram',
  vk: 'ВКонтакте',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  bing: 'Bing',
  mail: 'Mail.ru',
  duckduckgo: 'DuckDuckGo',
}

const number = (value: number) => value.toLocaleString('ru-RU')

/** Загрузка статистики по кнопке, без автообновления: экран открывают редко, лишние запросы не нужны. */
export function useAnalyticsStats(enabled: boolean) {
  const [stats, setStats] = useState<AnalyticsStats>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    loadAnalyticsStats()
      .then(setStats)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить статистику.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])
  return { stats, error, loading, reload }
}

/** Ровная шкала: пустые часы и дни тоже показываем, нулём. */
function fill(points: AnalyticsPoint[], count: number, step: number, last: number) {
  const byTime = new Map(points.map((point) => [Date.parse(point.at), point]))
  return Array.from({ length: count }, (_, i) => {
    const at = last - (count - 1 - i) * step
    return byTime.get(at) ?? { at: new Date(at).toISOString(), views: 0, episodes: 0, visitors: 0, newVisitors: 0 }
  })
}

function Bars({ points, label, title }: { points: AnalyticsPoint[]; label: (at: number) => string; title: string }) {
  const max = Math.max(1, ...points.map((point) => point.views))
  return (
    <figure className="an-chart">
      <figcaption>{title}</figcaption>
      <div className="an-chart__bars" role="img" aria-label={title}>
        {points.map((point, i) => {
          const at = Date.parse(point.at)
          return (
            <div
              key={point.at}
              className="an-chart__col"
              title={`${label(at)}: ${number(point.visitors)} чел., ${number(point.views)} просмотров, ${number(point.episodes)} серий`}
            >
              <span className="an-chart__views" style={{ height: `${(point.views / max) * 100}%` }} />
              <span className="an-chart__visitors" style={{ height: `${(point.visitors / max) * 100}%` }} />
              {i % Math.ceil(points.length / 8) === 0 && <small>{label(at)}</small>}
            </div>
          )
        })}
      </div>
      <div className="an-legend">
        <span className="an-legend__visitors">Посетители</span>
        <span className="an-legend__views">Просмотры страниц</span>
      </div>
    </figure>
  )
}

function Share({ title, items, names }: { title: string; items: { name: string; count: number }[]; names?: Record<string, string> }) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  return (
    <section className="an-card">
      <h2>{title}</h2>
      {items.length ? (
        <ul className="an-share">
          {items.map((item) => (
            <li key={item.name}>
              <span className="an-share__name">{names?.[item.name] ?? item.name}</span>
              <strong>{number(item.count)}</strong>
              <span className="an-share__bar" style={{ width: `${(item.count / Math.max(1, total)) * 100}%` }} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Пока нет данных.</p>
      )}
    </section>
  )
}

/** Короткая сводка для профиля администратора. */
export function AnalyticsSummary({ stats }: { stats: AnalyticsStats }) {
  return (
    <div className="an-tiles">
      <div className="an-tile an-tile--live"><strong>{number(stats.online)}</strong><span>Онлайн сейчас</span></div>
      <div className="an-tile"><strong>{number(stats.visitors.today)}</strong><span>За сутки</span></div>
      <div className="an-tile"><strong>{number(stats.visitors.week)}</strong><span>За 7 дней</span></div>
      <div className="an-tile"><strong>{number(stats.visitors.month)}</strong><span>За 30 дней</span></div>
    </div>
  )
}

export default function AdminAnalytics() {
  const { checking, user } = useAuth()
  const admin = !!user?.labels?.includes('admin')
  const { stats, error, loading, reload } = useAnalyticsStats(admin)
  usePageMeta('Статистика сайта')

  if (checking) return <main className="container page-fallback" aria-busy="true" />
  if (!admin) {
    return (
      <main className="container empty-state">
        <h1>Доступ закрыт</h1>
        <p>Эта страница доступна только администраторам.</p>
        <Link className="btn" to="/">На главную</Link>
      </main>
    )
  }

  const now = stats ? Date.parse(stats.generatedAt) : Date.now()
  const hourLabel = (at: number) => `${new Date(at + MSK).getUTCHours()}:00`
  const dayLabel = (at: number) => new Date(at + MSK).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })

  return (
    <main className="container page-section an-page">
      <div className="an-head">
        <h1 className="page-title">Статистика сайта</h1>
        <button type="button" className="btn btn--ghost" onClick={reload} disabled={loading}>
          {loading ? 'Обновляю…' : 'Обновить'}
        </button>
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      {!stats && !error && <p className="muted" aria-busy="true">Загружаю…</p>}
      {stats && (
        <>
          <AnalyticsSummary stats={stats} />
          <div className="an-tiles an-tiles--small">
            <div className="an-tile"><strong>{number(stats.views.today)}</strong><span>Просмотров страниц за сутки · {number(stats.views.month)} за месяц</span></div>
            <div className="an-tile"><strong>{number(stats.episodes.today)}</strong><span>Открыто серий за сутки · {number(stats.episodes.month)} за месяц</span></div>
            <div className="an-tile"><strong>{number(stats.newVisitors.today)}</strong><span>Новых посетителей за сутки · {number(stats.newVisitors.month)} за 30 дней</span></div>
            <div className="an-tile"><strong>{number(stats.users.all)}</strong><span>Аккаунтов · +{number(stats.users.week)} за неделю</span></div>
          </div>

          <Bars title="Поток за последние 24 часа (по Москве)" points={fill(stats.hours, 24, HOUR, Math.floor(now / HOUR) * HOUR)} label={hourLabel} />
          <Bars
            title="По дням за 30 дней"
            points={fill(stats.days, 30, DAY, Math.floor((now + MSK) / DAY) * DAY - MSK)}
            label={dayLabel}
          />

          <div className="an-grid">
            <section className="an-card">
              <h2>Где сейчас ({number(stats.online)})</h2>
              {stats.onlinePages.length ? (
                <ul className="an-list">
                  {stats.onlinePages.map((item) => (
                    <li key={item.name}><Link to={item.name}>{item.name}</Link><strong>{item.count}</strong></li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Сейчас на сайте никого.</p>
              )}
            </section>
            <Share title="Откуда приходят (30 дней)" items={stats.sources} names={SOURCE_NAMES} />
            <Share title="Устройства (30 дней)" items={stats.devices} names={DEVICE_NAMES} />
            <section className="an-card">
              <h2>Популярные страницы месяца</h2>
              {stats.popular.length ? (
                <ul className="an-list">
                  {stats.popular.map((item) => (
                    <li key={item.path}><Link to={item.path}>{item.path}</Link><strong>{number(item.views)}</strong></li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Пока нет данных.</p>
              )}
            </section>
          </div>
          <p className="muted an-note">
            Считаются только посещения animelife.top. Онлайн: кто был на сайте последние 5 минут с открытой вкладкой. Посетитель:
            один браузер, без имён и IP-адресов. Обновлено в {new Date(stats.generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        </>
      )}
    </main>
  )
}
