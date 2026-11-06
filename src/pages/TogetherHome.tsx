import './together.css'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadPublicRooms, loadUpcomingRooms, roomPosition, serverNow, syncClock, type Room } from '../data/rooms'
import { MEMBER_TTL, countMembers } from '../data/voice'
import { untilText } from '../components/together/ScheduleSession'
import { formatTime } from '../components/together/time'
import { PeopleIcon } from '../components/Icons'
import Mascot from '../components/Mascot'
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
        <div className="together-hero__copy stack" style={{ gap: 12 }}>
          <span className="eyebrow together-rec">
            <i aria-hidden="true" />
            <b aria-hidden="true">LIVE</b> Вместе
            <span aria-hidden="true">Синхронно · чат · голос</span>
          </span>
          <h1>Смотрите аниме вместе с друзьями</h1>
          <p className="muted together-hero__lead">
            Один ритм для всех: пауза, перемотка и смена серии синхронизируются. Рядом чат с реакциями и голос.
          </p>
          <ul className="together-hero__bullets muted" aria-label="Как начать">
            <li>
              <strong className="together-hero__bullet-title">Есть код</strong>
              <span>Введите шесть знаков — вы в комнате друга.</span>
            </li>
            <li>
              <strong className="together-hero__bullet-title">Нет кода</strong>
              <span>Откройте тайтл в каталоге и нажмите «Смотреть вместе» — комната создаётся за секунду.</span>
            </li>
          </ul>
        </div>
        <div className="together-hero__panel">
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
            <button type="submit" className="btn btn--accent join-form__submit" disabled={code.length !== 6}>
              Войти в комнату
            </button>
          </form>
          <p className="join-form__foot muted">
            Нет кода?{' '}
            <Link to="/catalog" className="together-hero__catalog-link">
              Создать комнату из каталога
            </Link>
          </p>
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="stack together-home__block">
          <header className="together-home__head">
            <h2>Скоро</h2>
            <p className="muted together-home__sub">Запланированные сеансы — зайдите заранее, код уже действует.</p>
          </header>
          <div className="together-room-list together-room-list--soon" role="list">
            {upcoming.map((r) => (
              <Link key={r.$id} to={`/together/${r.$id}`} className="together-room-row together-room-row--soon" role="listitem">
                <div className="together-room-row__thumb" style={r.poster ? { backgroundImage: `url(${r.poster})` } : undefined} />
                <div className="together-room-row__body">
                  <span className="together-room-row__title">{r.title || r.animeTitle}</span>
                  <span className="muted together-room-row__line">
                    {r.title ? `${r.animeTitle} · ` : ''}серия {r.episode}
                  </span>
                  <span className="together-room-row__meta muted">
                    <span className="live-badge">{untilText(r.startsAt! - serverNow())}</span>
                    <span className="together-room-row__host">{r.hostName}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="stack together-home__block">
        <header className="together-home__head">
          <div className="together-home__head-row">
            <h2>Открытые комнаты</h2>
            {rooms && rooms.length > 0 ? <span className="together-count">{rooms.length}</span> : null}
          </div>
          <p className="muted together-home__sub">Публичные комнаты, где сейчас смотрят. Выберите ряд — код не нужен.</p>
        </header>
        {rooms === null ? (
          <div className="together-room-list" aria-busy="true" role="list">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="together-room-row together-room-row--skeleton" role="listitem" aria-hidden="true" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="together-empty together-empty--home frame-corners">
            <Mascot />
            <p className="together-empty__title">Пока никто не смотрит открыто</p>
            <p className="muted together-empty__text">
              Создайте свою комнату на странице тайтла или попросите друга прислать код — список здесь оживёт сам.
            </p>
            <div className="actions together-empty__actions">
              <Link to="/catalog" className="btn btn--accent">
                Выбрать аниме
              </Link>
              <a href="#room-code" className="btn btn--ghost">
                Ввести код выше
              </a>
            </div>
          </div>
        ) : (
          <div className="together-room-list" role="list">
            {rooms.map((r) => (
              <Link key={r.$id} to={`/together/${r.$id}`} className="together-room-row" role="listitem">
                <div className="together-room-row__thumb" style={r.poster ? { backgroundImage: `url(${r.poster})` } : undefined} />
                <div className="together-room-row__body">
                  <span className="together-room-row__title">{r.title || r.animeTitle}</span>
                  <span className="muted together-room-row__line">
                    {r.title ? `${r.animeTitle} · ` : ''}серия {r.episode}
                  </span>
                  <span className="together-room-row__meta muted">
                    <span className={`live-badge${r.playing ? ' live-badge--on' : ''}`}>
                      {r.playing ? formatTime(roomPosition(r)) : 'Пауза'}
                    </span>
                    <span className="together-room-row__host">{r.hostName}</span>
                    {viewers.get(r.$id) ? (
                      <span className="together-room-row__viewers">
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
