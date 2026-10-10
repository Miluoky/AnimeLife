import './together.css'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadPublicRooms, loadUpcomingRooms, roomPosition, serverNow, syncClock, type Room } from '../data/rooms'
import { MEMBER_TTL, countMembers } from '../data/voice'
import { untilText } from '../components/together/ScheduleSession'
import { formatTime } from '../components/together/time'
import { PeopleIcon } from '../components/Icons'
import Mascot from '../components/Mascot'
import '../components/empty-card.css'
import { usePageMeta } from '../data/pageMeta'

/** Вкладка «Вместе»: войти по коду и открытые комнаты, где смотрят прямо сейчас. */
export default function TogetherHome() {
  usePageMeta('Смотреть аниме вместе с друзьями онлайн')
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [upcoming, setUpcoming] = useState<Room[]>([])
  const [viewers, setViewers] = useState(new Map<string, number>())

  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const [live, soon] = await Promise.all([
        loadPublicRooms().catch(() => [] as Room[]),
        loadUpcomingRooms().catch(() => [] as Room[]),
      ])
      if (!alive) return
      // Комната с будущим сеансом живёт в «Скоро», а не среди тех, где смотрят прямо сейчас.
      const now = serverNow()
      setRooms(live.filter((r) => !(r.startsAt && r.startsAt > now)))
      setUpcoming(soon.filter((r) => r.startsAt && r.startsAt > now))
      const counts = await countMembers(
        live.map((r) => r.$id),
        serverNow() - MEMBER_TTL,
      ).catch(() => new Map<string, number>())
      if (alive) setViewers(counts)
    }
    void syncClock(1).then(refresh)
    // Список комнат обновляем, только пока вкладка открыта: фоновая вкладка не тратит запросы к Appwrite.
    const timer = setInterval(() => !document.hidden && refresh(), 20_000)
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
      <section className="together-hero frame-corners">
        <div className="stack" style={{ gap: 12 }}>
          <span className="eyebrow together-rec">
            <i aria-hidden="true" />
            <b aria-hidden="true">LIVE</b> Вместе
            <span aria-hidden="true">Синхронно · чат · голос</span>
          </span>
          <h1>Смотрите аниме вместе с друзьями</h1>
          <p className="muted">
            Серия идёт у всех одновременно: пауза, перемотка и смена серии синхронизируются на всех устройствах. Рядом чат с
            реакциями. Откройте тайтл и нажмите «Смотреть вместе» или войдите по коду друга.
          </p>
        </div>
        <form className="join-form" onSubmit={join}>
          <label htmlFor="room-code" className="join-form__label">
            Код комнаты <span aria-hidden="true">6 знаков</span>
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

      {upcoming.length > 0 && (
        <section className="stack">
          <div className="section-head">
            <h2>Скоро</h2>
          </div>
          <div className="rooms-grid">
            {upcoming.map((r) => (
              <Link key={r.$id} to={`/together/${r.$id}`} className="room-card room-card--soon">
                <div className="room-card__img" style={r.poster ? { backgroundImage: `url(${r.poster})` } : undefined} />
                <div className="stack" style={{ gap: 4 }}>
                  <strong>{r.title || r.animeTitle}</strong>
                  <span className="muted">
                    {r.title ? `${r.animeTitle} · ` : ''}серия {r.episode}
                  </span>
                  <span className="muted room-card__meta">
                    <span className="live-badge">{untilText(r.startsAt! - serverNow())}</span>
                    {r.hostName}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <div className="section-head">
          <h2>Открытые комнаты</h2>
          {rooms && <span className="together-count">{rooms.length}</span>}
        </div>
        {rooms === null ? (
          <div className="rooms-grid" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="room-card skeleton" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-card together-empty frame-corners">
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
                    {viewers.get(r.$id) ? (
                      <span className="room-card__viewers">
                        <PeopleIcon size={14} /> {viewers.get(r.$id)}
                      </span>
                    ) : null}
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
