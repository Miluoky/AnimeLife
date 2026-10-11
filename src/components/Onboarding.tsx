import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadCatalog, useAsync } from '../api'
import type { Anime } from '../data/catalog'
import { GENRES } from '../data/seo'
import { tasteStore } from '../data/taste'
import { useMyList } from '../data/myList'
import { useHistory } from '../data/history'
import { toast } from '../data/toast'
import './onboarding.css'

/** Жанры для первого шага: самые частые, чтобы список помещался на экране телефона. */
const PICK_GENRES = GENRES.slice(0, 16)
const GRID = 24

/** Популярное в выбранных жанрах: по 12 на жанр (не больше трёх), без повторов; без жанров — просто популярное. */
async function candidates(genres: number[]): Promise<Anime[]> {
  if (!genres.length) return (await loadCatalog({ order: 'popularity', limit: GRID })).data
  const lists = await Promise.all(genres.slice(0, 3).map((g) => loadCatalog({ order: 'popularity', limit: 12, genre: g }).then((r) => r.data).catch(() => [])))
  const seen = new Set<string>()
  const out: Anime[] = []
  for (let i = 0; out.length < GRID && lists.some((l) => l[i]); i++) {
    for (const l of lists) {
      const a = l[i]
      if (a && !seen.has(a.id)) {
        seen.add(a.id)
        out.push(a)
      }
    }
  }
  return out
}

/**
 * Карточка «Подберём аниме под вас» на главной для новичков (пустой список и история).
 * Внутри — жанры и сетка популярных тайтлов: отмеченные становятся основой «Вам понравится».
 */
export default function Onboarding() {
  const taste = tasteStore.use()
  const list = useMyList()
  const history = useHistory()
  const [open, setOpen] = useState(false)
  if (taste.done || list.length || history.length) return null

  return (
    <section className="onboard-card" aria-labelledby="onboard-title">
      <div>
        <h2 id="onboard-title">Впервые у нас?</h2>
        <p className="muted">Отметьте любимые жанры и пару аниме, которые понравились, и мы подберём, что посмотреть дальше.</p>
      </div>
      <div className="onboard-card__actions">
        <button type="button" className="btn btn--accent" onClick={() => setOpen(true)}>
          Подобрать аниме
        </button>
        <button type="button" className="link-btn" onClick={() => tasteStore.set({ ...taste, done: true })}>
          Не сейчас
        </button>
      </div>
      {open && <OnboardingDialog onClose={() => setOpen(false)} />}
    </section>
  )
}

function OnboardingDialog({ onClose }: { onClose: () => void }) {
  const [genres, setGenres] = useState<number[]>([])
  const [liked, setLiked] = useState<Map<string, string>>(new Map())
  const grid = useAsync(() => candidates(genres), [genres.join(',')])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.documentElement.classList.add('onboard-open')
    box.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.classList.remove('onboard-open')
    }
  }, [])

  const toggleGenre = (id: number) => setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))
  const toggleTitle = (a: Anime) =>
    setLiked((m) => {
      const next = new Map(m)
      if (next.has(a.id)) next.delete(a.id)
      else next.set(a.id, a.title)
      return next
    })

  const finish = () => {
    tasteStore.set({ genres, liked: [...liked].map(([id, title]) => ({ id, title })), done: true })
    onClose()
    toast('Готово! Подборка «Вам понравится» уже на главной')
    requestAnimationFrame(() => document.getElementById('recs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // В body: у карточки на главной есть эффекты, внутри которых position: fixed не держится за экран.
  return createPortal(
    <div className="onboard" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="onboard__box" role="dialog" aria-modal="true" aria-labelledby="onboard-dialog-title" tabIndex={-1} ref={box}>
        <div className="onboard__head">
          <h2 id="onboard-dialog-title">Что вам нравится?</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="muted">Жанры</p>
        <div className="onboard__genres" role="group" aria-label="Любимые жанры">
          {PICK_GENRES.map((g) => (
            <button key={g.id} type="button" className={`pill${genres.includes(g.id) ? ' active' : ''}`} aria-pressed={genres.includes(g.id)} onClick={() => toggleGenre(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
        <p className="muted">Отметьте аниме, которые уже смотрели и понравились</p>
        {grid.loading && !grid.value ? (
          <div className="skeleton skeleton--line" style={{ height: 220 }} aria-busy="true" />
        ) : (
          <ul className="onboard__grid" aria-label="Популярные аниме">
            {(grid.value ?? []).map((a) => {
              const on = liked.has(a.id)
              return (
                <li key={a.id}>
                  <button type="button" className={`onboard__title${on ? ' onboard__title--on' : ''}`} aria-pressed={on} onClick={() => toggleTitle(a)}>
                    <img src={a.posterSmall ?? a.posterUrl} alt="" loading="lazy" style={{ background: a.posterFill }} />
                    <span>{a.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="onboard__foot">
          <span className="muted">{liked.size ? `Отмечено: ${liked.size}` : 'Можно отметить несколько'}</span>
          <button type="button" className="btn btn--accent" disabled={!liked.size} onClick={finish}>
            Готово
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
