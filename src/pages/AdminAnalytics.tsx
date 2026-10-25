import './admin-analytics.css'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../data/auth'
import { usePageMeta } from '../data/pageMeta'
import { loadAnalyticsStats, type AnalyticsPoint, type AnalyticsStats } from '../data/analytics'
import { callCommunity } from '../data/community'

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

/**
 * Воронка новичков за 30 дней: зашёл → открыл тайтл → запустил серию → вернулся. Первые три шага — доля от всех новичков,
 * возвраты — от тех, у кого нужный день уже наступил. Цель плана развития: через неделю возвращаются больше 20%.
 */
function Funnel({ funnel }: { funnel: NonNullable<AnalyticsStats['funnel']> }) {
  const pct = (part: number, of: number) => (of ? Math.round((part / of) * 100) : 0)
  const steps: [string, number, number][] = [
    ['Пришли впервые', funnel.visitors, funnel.visitors],
    ['Открыли тайтл', funnel.titles, funnel.visitors],
    ['Запустили серию', funnel.episodes, funnel.visitors],
    ['Вернулись на следующий день', funnel.day1.back, funnel.day1.of],
    ['Вернулись через неделю (7–13 день)', funnel.day7.back, funnel.day7.of],
  ]
  return (
    <section className="an-card an-funnel">
      <h2>Воронка новичков (30 дней)</h2>
      {funnel.visitors ? (
        <ul className="an-share">
          {steps.map(([name, count, of]) => (
            <li key={name}>
              <span className="an-share__name">{name}</span>
              <strong>
                {number(count)}
                {of !== funnel.visitors || name !== 'Пришли впервые' ? ` · ${pct(count, of)}%` : ''}
              </strong>
              <span className="an-share__bar" style={{ width: `${pct(count, of)}%` }} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Считаем новичков с момента запуска воронки: данные появятся с первыми посетителями.</p>
      )}
      <p className="muted">Возврат считаем от тех, у кого этот день уже наступил: пришедшие сегодня ещё не могли вернуться завтра. Цель — через неделю больше 20%.</p>
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

interface ClientError {
  $id: string
  message: string
  source?: string
  stack?: string
  path?: string
  browser?: string
  release?: string
  count: number
  first: number
  last: number
}

/** Ошибки JavaScript у посетителей (functions/community/src/errors.js): свежие сверху. */
function ClientErrors() {
  const [errors, setErrors] = useState<ClientError[]>()
  const [failed, setFailed] = useState('')
  useEffect(() => {
    callCommunity<{ errors: ClientError[] }>({ action: 'error-list' })
      .then((r) => setErrors(r.errors))
      .catch((cause) => setFailed(cause instanceof Error ? cause.message : 'Не удалось загрузить ошибки.'))
  }, [])
  const clear = (id: string) => {
    setErrors((list) => list?.filter((e) => e.$id !== id))
    void callCommunity({ action: 'error-clear', id }).catch(() => undefined)
  }
  return (
    <section className="an-card an-errors" aria-labelledby="an-errors-title">
      <h2 id="an-errors-title">Ошибки у посетителей{errors?.length ? ` (${errors.length})` : ''}</h2>
      {failed ? (
        <p className="muted">{failed}</p>
      ) : !errors ? (
        <p className="muted" aria-busy="true">Загружаю…</p>
      ) : !errors.length ? (
        <p className="muted">Ошибок нет. Если у кого-то сломается страница, она появится здесь.</p>
      ) : (
        <ul className="an-errors__list">
          {errors.map((e) => (
            <li key={e.$id}>
              <details>
                <summary>
                  <strong>{e.message}</strong>
                  <span className="muted">
                    {e.count} раз · последний {new Date(e.last).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {e.path ? ` · ${e.path}` : ''}
                    {e.browser ? ` · ${e.browser}` : ''}
                  </span>
                </summary>
                {e.source && <p className="muted">Где: {e.source}</p>}
                {e.stack && <pre>{e.stack}</pre>}
                <p className="muted">Версия сайта: {e.release || 'неизвестно'} · впервые {new Date(e.first).toLocaleString('ru-RU')}</p>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => clear(e.$id)}>
                  Исправлено, убрать
                </button>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
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
            {stats.funnel && <Funnel funnel={stats.funnel} />}
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
      <ClientErrors />
    </main>
  )
}
