import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadPublicRooms, roomPosition, syncClock, type Room } from '../data/rooms'
import { formatTime } from '../components/together/time'
import { PeopleIcon } from '../components/Icons'
import Mascot from '../components/Mascot'

/** Вкладка «Вместе»: войти по коду и открытые комнаты, где смотрят прямо сейчас. */
export default function TogetherHome() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [rooms, setRooms] = useState<Room[] | null>(null)

  useEffect(() => {
    let alive = true
    const refresh = () =>
      loadPublicRooms()
        .then((list) => alive && setRooms(list))
        .catch(() => alive && setRooms([]))
    void syncClock(1).then(refresh)
    const timer = setInterval(refresh, 20_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const join = (e: FormEvent) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (/^[A-Z0-9]{6}$/.test(c)) navigate(`/together/${c}`)
  }

  return (
    <main className="container stack together-home">
      <section className="together-hero">
        <div className="stack" style={{ gap: 12 }}>
          <span className="eyebrow">
            <PeopleIcon size={16} /> Вместе
          </span>
          <h1>Смотрите аниме вместе с друзьями</h1>
          <p className="muted">
            Серия идёт у всех одновременно: пауза, перемотка и смена серии синхронизируются на всех устройствах. Рядом чат с
            реакциями. Откройте тайтл и нажмите «Смотреть вместе» или войдите по коду друга.
          </p>
        </div>
        <form className="join-form" onSubmit={join}>
          <label htmlFor="room-code" className="muted">
            Код комнаты
          </label>
          <input
            id="room-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="ABC123"
            autoComplete="off"
            inputMode="text"
          />
          <button type="submit" className="btn btn--accent" disabled={code.length !== 6}>
            Войти в комнату
          </button>
        </form>
      </section>

      <section className="stack">
        <div className="section-head">
          <h2>Открытые комнаты</h2>
          {rooms && <span className="muted">{rooms.length}</span>}
        </div>
        {rooms === null ? (
          <div className="rooms-grid" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="room-card skeleton" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-page" style={{ minHeight: 0, padding: '24px 0' }}>
            <Mascot />
            <p className="muted">Сейчас открытых комнат нет. Создайте свою на странице любого тайтла.</p>
            <Link to="/catalog" className="btn btn--ghost">
              Выбрать аниме
            </Link>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map((r) => (
              <Link key={r.$id} to={`/together/${r.$id}`} className="room-card">
                <div className="room-card__img" style={r.poster ? { backgroundImage: `url(${r.poster})` } : undefined} />
                <div className="stack" style={{ gap: 4 }}>
                  <strong>{r.title || r.animeTitle}</strong>
                  <span className="muted">
                    {r.title ? `${r.animeTitle} · ` : ''}серия {r.episode}
                  </span>
                  <span className="muted room-card__meta">
                    <span className={`live-badge${r.playing ? ' live-badge--on' : ''}`}>
                      {r.playing ? formatTime(roomPosition(r)) : 'Пауза'}
                    </span>
                    {r.hostName}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
