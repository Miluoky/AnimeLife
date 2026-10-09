import { useState } from 'react'
import VoiceLogo from '../VoiceLogo'
import { SearchIcon } from '../Icons'
import { pickCode, samePick, type PlayerPick, type RoomVoice } from '../../data/roomPlayer'

const SOURCE: Record<RoomVoice['kind'], string> = { al: 'AniLibria', av: 'AnimeVost', ax: 'Anixart', kd: 'Kodik' }

/**
 * Выбор плеера и озвучки в комнате карточками, как на странице серии (и на Senku):
 * значок студии, источник и число серий, вкладки «Озвучка / Субтитры», поиск при длинном списке.
 * Видит только ведущий; выбор сразу уходит всей комнате.
 */
export default function RoomVoices({
  voices,
  loading,
  current,
  onChoose,
}: {
  voices?: RoomVoice[]
  loading: boolean
  current: PlayerPick | null
  onChoose: (p: PlayerPick) => void
}) {
  const subs = voices?.filter((v) => v.subtitles).length ?? 0
  // Пока ведущий сам не переключил вкладку, открыта та, где играющая озвучка.
  const [chosenTab, setTab] = useState<'voice' | 'subtitles' | null>(null)
  const tab = chosenTab ?? (voices?.find((v) => samePick(v, current))?.subtitles ? 'subtitles' : 'voice')
  const [query, setQuery] = useState('')

  if (loading && !voices) return <p className="muted room-voices__note">Ищем озвучки…</p>
  if (!voices?.length) return <p className="muted room-voices__note">Серий в плеерах сайта нет: включите трейлер или свой файл.</p>

  const q = query.trim().toLowerCase()
  const shown = voices
    .filter((v) => !subs || subs === voices.length || !!v.subtitles === (tab === 'subtitles'))
    .filter((v) => !q || v.title.toLowerCase().includes(q))

  return (
    <section className="room-voices" aria-label="Плеер и озвучка">
      <div className="room-voices__head">
        <h2>Плеер и озвучка</h2>
        {subs > 0 && subs < voices.length && (
          <div className="room-voices__tabs" role="group" aria-label="Тип перевода">
            {(
              [
                ['voice', 'Озвучка', voices.length - subs],
                ['subtitles', 'Субтитры', subs],
              ] as const
            ).map(([id, label, count]) => (
              <button key={id} type="button" className={`chip-btn${tab === id ? ' chip-btn--on' : ''}`} aria-pressed={tab === id} onClick={() => setTab(id)}>
                {label} <span className="muted">{count}</span>
              </button>
            ))}
          </div>
        )}
        {voices.length > 6 && (
          <label className="room-voices__search">
            <SearchIcon size={16} />
            <span className="sr-only">Найти озвучку</span>
            <input type="search" placeholder="Поиск студии" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        )}
      </div>
      <ul className="room-voices__list">
        {shown.map((v) => {
          const on = samePick(v, current)
          return (
            <li key={pickCode(v)}>
              <button type="button" className="room-voice" data-tilt aria-pressed={on} onClick={() => !on && onChoose(v)}>
                <VoiceLogo title={v.title} kind={v.subtitles ? 'subtitles' : 'voice'} icon={v.icon} size={40} />
                <span className="room-voice__text">
                  <span className="room-voice__title">{v.title}</span>
                  <span className="room-voice__meta">
                    {SOURCE[v.kind]}
                    {v.episodes ? ` · ${v.episodes} эп.` : ''}
                  </span>
                </span>
                {on && <span className="room-voice__now">Играет</span>}
              </button>
            </li>
          )
        })}
        {shown.length === 0 && <li className="muted room-voices__note">Ничего не нашлось</li>}
      </ul>
    </section>
  )
}
