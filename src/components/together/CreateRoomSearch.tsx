import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadCatalog } from '../../api'
import type { Anime } from '../../data/catalog'
import { useAuth } from '../../data/auth'
import { markFlag } from '../../data/flags'
import { toast } from '../../data/toast'
import { PeopleIcon } from '../Icons'

/** Создание комнаты прямо с /together: поиск тайтла → «Создать». */
export default function CreateRoomSearch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Anime[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    let alive = true
    setLoading(true)
    const t = window.setTimeout(() => {
      void loadCatalog({ search: term, limit: 6, order: 'popularity' })
        .then((r) => alive && setHits(r.data.slice(0, 6)))
        .catch(() => alive && setHits([]))
        .finally(() => alive && setLoading(false))
    }, 280)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const create = async (anime: Anime) => {
    if (!user) {
      toast('Войдите, чтобы создать комнату', { label: 'Войти', onClick: () => navigate('/account') })
      return
    }
    setBusy(true)
    try {
      const { createRoom, youtubeId } = await import('../../data/rooms')
      const videoId = youtubeId(anime.trailerUrl)
      const room = await createRoom({
        animeId: anime.id,
        animeTitle: anime.title,
        poster: anime.posterSmall ?? anime.posterUrl,
        episode: 1,
        source: videoId ? 'trailer' : 'file',
        videoId,
      })
      markFlag('hostedRoom')
      navigate(`/together/${room.$id}`, { state: { fresh: true } })
    } catch (e) {
      toast(e instanceof Error && e.name === 'CommunityError' ? e.message : 'Не удалось создать комнату')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="together-create">
      <label htmlFor="together-create-q" className="together-create__label">
        Создать комнату
      </label>
      <input
        id="together-create-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Название аниме"
        autoComplete="off"
        aria-controls="together-create-hits"
      />
      {loading && <p className="muted together-create__hint">Ищем…</p>}
      {!loading && q.trim().length >= 2 && hits.length === 0 && (
        <p className="muted together-create__hint">Ничего не нашли — уточните название.</p>
      )}
      {hits.length > 0 && (
        <ul id="together-create-hits" className="together-create__hits" role="listbox" aria-label="Результаты поиска">
          {hits.map((a) => (
            <li key={a.id}>
              <button type="button" className="together-create__hit" disabled={busy} onClick={() => void create(a)}>
                <span className="together-create__hit-title">{a.title}</span>
                <span className="together-create__hit-meta muted">
                  {[a.year, a.kind].filter(Boolean).join(' · ')}
                </span>
                <span className="together-create__hit-cta">
                  <PeopleIcon size={16} />
                  {busy ? '…' : 'Создать'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
