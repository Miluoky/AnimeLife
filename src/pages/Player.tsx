import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { getAnime } from '../data/catalog'
import {
  FullscreenIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  SkipIcon,
  SubtitlesIcon,
  VolumeIcon,
} from '../components/Icons'
import NotFound from './NotFound'

const voices = ['Русская озвучка', 'Русские субтитры', 'Оригинал']
const qualities = ['1080p', '720p', '480p']

export default function Player() {
  const { id = '', episode = '1' } = useParams()
  const navigate = useNavigate()
  const anime = getAnime(id)
  const [playing, setPlaying] = useState(false)
  const [voice, setVoice] = useState(voices[0])
  const [quality, setQuality] = useState(qualities[0])

  if (!anime) return <NotFound />

  const total = anime.episodes ?? 12
  const current = Math.min(Math.max(1, Number(episode) || 1), total)
  const goTo = (n: number) => {
    setPlaying(false)
    navigate(`/watch/${anime.id}/${n}`)
  }

  return (
    <main className="container player-page">
      <div className="stack player-main">
        <div className="player-frame">
          <span className="art-label" style={{ position: 'absolute', top: 20, left: 20 }}>
            [Видео]
          </span>
          <button
            type="button"
            className="player-big-btn"
            aria-label={playing ? 'Пауза' : 'Смотреть'}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <PauseIcon size={30} /> : <PlayIcon size={30} />}
          </button>
          <button type="button" className="skip-btn">
            Пропустить опенинг
            <SkipIcon />
          </button>
          <div className="player-controls">
            <div className="seek">
              <div className="seek__fill" style={{ width: '40%' }} />
              <div className="seek__thumb" style={{ left: '40%' }} />
            </div>
            <div className="player-controls__row">
              <button
                type="button"
                className="player-btn"
                aria-label={playing ? 'Пауза' : 'Смотреть'}
                onClick={() => setPlaying(!playing)}
              >
                {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
              </button>
              <button
                type="button"
                className="player-btn"
                aria-label="Следующая серия"
                disabled={current >= total}
                onClick={() => goTo(current + 1)}
              >
                <NextIcon />
              </button>
              <button type="button" className="player-btn" aria-label="Громкость">
                <VolumeIcon />
              </button>
              <span className="soft">9:36 / 24:00</span>
              <div style={{ flexGrow: 1 }} />
              <button type="button" className="player-btn" aria-label="Субтитры">
                <SubtitlesIcon />
              </button>
              <button type="button" className="player-btn" aria-label="Во весь экран">
                <FullscreenIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="section-head" style={{ alignItems: 'flex-start' }}>
          <div>
            <Link to={`/anime/${anime.id}`} className="muted">
              {anime.title}
            </Link>
            <h1 style={{ fontSize: 30 }}>Серия {current}</h1>
          </div>
          <div className="actions">
            <button type="button" className="btn btn--ghost" disabled={current <= 1} onClick={() => goTo(current - 1)}>
              Предыдущая
            </button>
            <button
              type="button"
              className="btn btn--accent"
              disabled={current >= total}
              onClick={() => goTo(current + 1)}
            >
              Следующая серия
            </button>
          </div>
        </div>

        <div className="player-options">
          <fieldset>
            <legend>Озвучка</legend>
            <div className="chips">
              {voices.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`option-chip${v === voice ? ' active' : ''}`}
                  aria-pressed={v === voice}
                  onClick={() => setVoice(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Качество</legend>
            <div className="chips">
              {qualities.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`option-chip${q === quality ? ' active' : ''}`}
                  aria-pressed={q === quality}
                  onClick={() => setQuality(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <aside className="episode-list">
        <div className="section-head">
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Серии</h2>
          <span className="muted">{total}</span>
        </div>
        <div className="episode-list__items">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`episode-row${n === current ? ' active' : ''}`}
              aria-current={n === current ? 'true' : undefined}
              onClick={() => goTo(n)}
            >
              <span className="episode-row__num">{n}</span>
              <span style={{ flexGrow: 1, fontWeight: 600 }}>Серия {n}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {n === current ? 'Сейчас' : `${anime.episodeMinutes ?? 24} мин`}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </main>
  )
}
