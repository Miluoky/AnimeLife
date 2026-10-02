import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Anime } from '../../data/catalog'
import { useAuth } from '../../data/auth'
import { toast } from '../../data/toast'
import { PeopleIcon } from '../Icons'

/** «Смотреть вместе»: создаёт комнату с этим тайтлом и серией и открывает её. */
export default function WatchTogetherButton({
  anime,
  episode = 1,
  className = 'btn btn--ghost',
}: {
  anime: Pick<Anime, 'id' | 'title' | 'posterUrl' | 'posterSmall' | 'trailerUrl'>
  episode?: number
  className?: string
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const start = async () => {
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
        episode,
        source: videoId ? 'trailer' : 'file',
        videoId,
      })
      navigate(`/together/${room.$id}`)
    } catch (e) {
      toast(e instanceof Error && e.name === 'CommunityError' ? e.message : 'Не удалось создать комнату')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={className} onClick={start} disabled={busy} aria-busy={busy}>
      <PeopleIcon size={18} />
      {busy ? 'Создаём комнату…' : 'Смотреть вместе'}
    </button>
  )
}
