import { useEffect, useRef, useState } from 'react'
import './theme-songs.css'

/**
 * Опенинги и эндинги тайтла с прослушиванием: открытый API AnimeThemes (без ключа, CORS разрешён).
 * Тайтл ищем по id MyAnimeList — он совпадает с id Shikimori. Рядом ссылка на поиск песни в Яндекс Музыке.
 */
interface Theme {
  id: number
  type: 'OP' | 'ED'
  sequence: number | null
  slug: string
  song?: { title: string; artists: { name: string }[] }
  animethemeentries: { episodes: string | null; spoiler: boolean; videos: { link: string; audio?: { link: string } }[] }[]
}

const API = 'https://api.animethemes.moe/anime'

async function loadThemes(malId: string): Promise<Theme[]> {
  const params = new URLSearchParams({
    'filter[has]': 'resources',
    'filter[site]': 'MyAnimeList',
    'filter[external_id]': malId,
    include: 'animethemes.animethemeentries.videos.audio,animethemes.song.artists',
  })
  const res = await fetch(`${API}?${params}`)
  if (!res.ok) return []
  const json = (await res.json()) as { anime?: { animethemes: Theme[] }[] }
  return (json.anime?.[0]?.animethemes ?? []).filter((t) => t.animethemeentries[0]?.videos[0])
}

export default function ThemeSongs({ animeId }: { animeId: string }) {
  const [themes, setThemes] = useState<Theme[]>([])
  const [playing, setPlaying] = useState<number | null>(null)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let alive = true
    loadThemes(animeId)
      .then((t) => alive && setThemes(t))
      .catch(() => undefined)
    return () => {
      alive = false
      audio.current?.pause()
    }
  }, [animeId])

  if (!themes.length) return null

  const play = (t: Theme) => {
    const el = audio.current
    if (!el) return
    if (playing === t.id) {
      el.pause()
      return setPlaying(null)
    }
    const video = t.animethemeentries[0].videos[0]
    // Safari не играет ogg: ему отдаём webm-видео, звук из него тот же.
    const ogg = video.audio?.link
    el.src = ogg && el.canPlayType('audio/ogg; codecs="opus"') ? ogg : video.link
    void el.play().catch(() => setPlaying(null))
    setPlaying(t.id)
  }

  return (
    <section className="stack theme-songs">
      <div className="section-head">
        <h2>Опенинги и эндинги</h2>
      </div>
      <audio ref={audio} onEnded={() => setPlaying(null)} preload="none" />
      <ul className="theme-songs__list">
        {themes.map((t) => {
          const artists = t.song?.artists.map((a) => a.name).join(', ')
          const title = t.song?.title ?? t.slug
          const entry = t.animethemeentries[0]
          return (
            <li key={t.id} className={`theme-song${playing === t.id ? ' is-playing' : ''}`}>
              <button type="button" className="theme-song__play" onClick={() => play(t)} aria-label={playing === t.id ? `Пауза: ${title}` : `Слушать: ${title}`}>
                {playing === t.id ? '❚❚' : '▶'}
              </button>
              <span className="theme-song__kind">
                {t.type === 'OP' ? 'Опенинг' : 'Эндинг'} {t.sequence ?? ''}
              </span>
              <span className="theme-song__name">
                <b>{title}</b>
                {artists && <span className="muted"> · {artists}</span>}
                {entry.episodes && <span className="muted theme-song__eps"> · серии {entry.episodes}</span>}
              </span>
              <a
                className="theme-song__link"
                href={`https://music.yandex.ru/search?text=${encodeURIComponent(`${artists ?? ''} ${title}`.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Найти в Яндекс Музыке"
              >
                Я.Музыка
              </a>
            </li>
          )
        })}
      </ul>
      <span className="muted theme-songs__src">
        Музыка: <a href="https://animethemes.moe" target="_blank" rel="noopener noreferrer">AnimeThemes</a>
      </span>
    </section>
  )
}
