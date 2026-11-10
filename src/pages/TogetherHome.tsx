import './together-rec.css'
import './together.css'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadPublicRooms, loadUpcomingRooms, roomPosition, serverNow, syncClock, type Room } from '../data/rooms'
import { MEMBER_TTL, countMembers } from '../data/voice'
import { untilText } from '../components/together/ScheduleSession'
import { formatTime } from '../components/together/time'
import { PeopleIcon } from '../components/Icons'
import Mascot from '../components/Mascot'
import CreateRoomSearch from '../components/together/CreateRoomSearch'
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
    // Даже если часы сервера не ответили — список комнат всё равно грузим.
    void syncClock(1).then(refresh, refresh)
    // Список комнат обновляем, только пока вкладка открыта: фоновая вкладка не тратит запросы к Appwrite.
    const timer = setInterval(() => !document.hidden && refresh(), 20_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  /** Шесть знаков или вся ссылка вида …/together/ABC123 — из мессенджера. */
  const parseRoomCode = (raw: string) => {
    const fromUrl = raw.match(/together\/([A-Za-z0-9]{6})\b/i)?.[1]
    const c = (fromUrl ?? raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    return c.length === 6 ? c : ''
  }

  const join = (e: FormEvent) => {
    e.preventDefault()
    const c = parseRoomCode(code)
    if (c) navigate(`/together/${c}`)
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
              <span>Найдите тайтл справа и нажмите «Создать» — или откройте «Смотреть вместе» на странице аниме.</span>
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
              onChange={(e) => {
                const v = e.target.value
                // Ссылка или длинная вставка — вытаскиваем код; иначе обычный набор 6 знаков.
                if (/together\//i.test(v) || /https?:\/\//i.test(v) || v.length > 8) {
                  setCode(parseRoomCode(v))
                  return
                }
                setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                const parsed = parseRoomCode(text)
                if (!parsed) return
                e.preventDefault()
                setCode(parsed)
              }}
              placeholder="ABC123 или ссылка"
              autoComplete="off"
              inputMode="text"
              aria-describedby="room-code-hint"
            />
            <button type="submit" className="btn btn--accent join-form__submit" disabled={!parseRoomCode(code)}>
              Войти в комнату
            </button>
          </form>
          <p id="room-code-hint" className="join-form__foot muted">
            Можно вставить ссылку из чата.
          </p>
          <div className="together-hero__divider" aria-hidden="true" />
          <CreateRoomSearch />
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
              <div key={r.$id} role="listitem">
                <Link to={`/together/${r.$id}`} className="together-room-row together-room-row--soon room-card room-card--soon">
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
              </div>
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
              <div key={r.$id} role="listitem">
                <Link to={`/together/${r.$id}`} className="together-room-row">
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
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
