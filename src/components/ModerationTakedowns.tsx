import './reviews.css'
import { useEffect, useState } from 'react'
import { loadTakedowns, setTakedownStatus, type Takedown, type TakedownStatus } from '../data/takedowns'

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const FILTERS: [TakedownStatus | 'all', string][] = [
  ['new', 'Новые'],
  ['done', 'Выполнено'],
  ['rejected', 'Отклонено'],
  ['all', 'Все'],
]

const STATUS_NAMES: Record<TakedownStatus, string> = { new: 'новое', done: 'выполнено', rejected: 'отклонено' }

/** Ссылки из жалобы: адреса http(s) кликабельны, остальное — просто текст. */
function Links({ text }: { text: string }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, overflowWrap: 'anywhere' }}>
      {text
        .split(/\s+/)
        .filter(Boolean)
        .map((s, i) => (
          <li key={i}>
            {/^https?:\/\//.test(s) ? (
              <a href={s} target="_blank" rel="noopener noreferrer nofollow">
                {s}
              </a>
            ) : (
              s
            )}
          </li>
        ))}
    </ul>
  )
}

/** Обращения с форм «Правообладателям» и «Контакты». Права проверяет функция, здесь только список и кнопки. */
export default function ModerationTakedowns() {
  const [filter, setFilter] = useState<TakedownStatus | 'all'>('new')
  const [items, setItems] = useState<Takedown[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string>()

  useEffect(() => {
    setItems(undefined)
    setError('')
    loadTakedowns(filter)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Не получилось загрузить обращения.'))
  }, [filter])

  async function mark(t: Takedown, status: TakedownStatus) {
    setBusy(t.$id)
    setError('')
    try {
      const updated = await setTakedownStatus(t.$id, status)
      // В отфильтрованном списке обращение с другим статусом больше не нужно.
      setItems((list = []) =>
        filter === 'all' ? list.map((x) => (x.$id === t.$id ? { ...x, ...updated } : x)) : list.filter((x) => x.$id !== t.$id),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось.')
    }
    setBusy(undefined)
  }

  return (
    <div className="stack">
      <p className="muted">
        Жалобы правообладателей разбираем в течение 3 рабочих дней: убрать плеер или страницу, ответить на почту и
        отметить «Выполнено». Обращения из «Контактов» отмечаются так же.
      </p>
      <div className="chips" role="group" aria-label="Статус">
        {FILTERS.map(([id, name]) => (
          <button
            key={id}
            type="button"
            className={`pill${filter === id ? ' active' : ''}`}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {name}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {!items ? (
        !error && <div className="skeleton skeleton--line" aria-busy="true" />
      ) : !items.length ? (
        <p className="muted">Обращений нет.</p>
      ) : (
        <div className="stack reviews">
          {items.map((t) => (
            <article key={t.$id} className="review">
              <header className="review__head">
                <span className="review__who">
                  <strong>
                    {t.kind === 'takedown' ? 'Жалоба правообладателя' : 'Сообщение'}: {t.name}
                  </strong>
                  <span className="muted">
                    <a href={`mailto:${t.email}`}>{t.email}</a> · {dateFormat.format(new Date(t.createdAt))} ·{' '}
                    {STATUS_NAMES[t.status] ?? t.status}
                  </span>
                </span>
              </header>
              {t.links && <Links text={t.links} />}
              <p className="review__text">{t.message}</p>
              <div className="review-form__row">
                {t.status !== 'done' && (
                  <button
                    type="button"
                    className="btn btn--accent btn--small"
                    disabled={busy === t.$id}
                    onClick={() => mark(t, 'done')}
                  >
                    Выполнено
                  </button>
                )}
                {t.status !== 'rejected' && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={busy === t.$id}
                    onClick={() => mark(t, 'rejected')}
                  >
                    Отклонить
                  </button>
                )}
                {t.status !== 'new' && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    disabled={busy === t.$id}
                    onClick={() => mark(t, 'new')}
                  >
                    Вернуть в новые
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
