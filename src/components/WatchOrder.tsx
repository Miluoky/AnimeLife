import { useEffect, useRef, useState } from 'react'
import { srcset2x } from '../data/saver'
import { Link } from 'react-router-dom'
import { useAsync } from '../api'
import { fetchFranchise } from '../api/franchise'
import { useMyList, type ListStatus } from '../data/myList'
import Shelf from './Shelf'
import { CheckIcon } from './Icons'

const statusLabel: Partial<Record<ListStatus, string>> = {
  completed: 'Просмотрено',
  watching: 'Смотрю',
  planned: 'В планах',
  on_hold: 'Отложено',
}

/**
 * У длинных франшиз все части начинаются с одного названия, и в карточке видно только его, а не то,
 * чем части отличаются. Общее начало сокращаем до последнего слова: «…Фрирен 2», «…Фрирен: Золотая земля».
 */
export function shortTitles(titles: string[]): string[] {
  const base = [...titles]
    .sort((a, b) => a.length - b.length)
    .find((t) => t.split(' ').length >= 3 && titles.filter((o) => o !== t && o.startsWith(t)).length >= 1)
  if (!base) return titles
  const tail = base.slice(base.lastIndexOf(' ') + 1)
  return titles.map((t) => (t !== base && t.startsWith(base) ? `…${tail}${t.slice(base.length)}` : t))
}

/**
 * «Порядок просмотра»: вся франшиза по дате выхода, с номерами, отметками из «Моего списка» и текущим тайтлом.
 * По умолчанию только сериалы, фильмы и ONA; OVA и спецвыпуски по кнопке.
 */
export default function WatchOrder({ animeId }: { animeId: string }) {
  const franchise = useAsync(() => fetchFranchise(animeId).catch(() => []), [animeId])
  const list = useMyList()
  const [all, setAll] = useState(false)
  const currentRef = useRef<HTMLDivElement>(null)
  const entries = franchise.value ?? []
  const main = entries.filter((e) => e.main || e.id === animeId)
  // Если основных частей меньше трёх, порядок понятен и так: показываем всё сразу.
  const showAll = all || main.length < 3
  const shown = showAll ? entries : main

  // У длинных франшиз текущая часть может быть далеко справа: прокручиваем ряд к ней, не трогая страницу.
  useEffect(() => {
    const el = currentRef.current
    const row = el?.parentElement
    if (el && row) row.scrollLeft = el.offsetLeft - row.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2
  }, [shown.length])

  if (shown.length < 3) return null

  const status = new Map(list.map((e) => [e.anime.id, e.status]))
  const done = shown.filter((e) => status.get(e.id) === 'completed').length
  const extra = entries.length - main.length
  const titles = shortTitles(shown.map((e) => e.title))

  return (
    <Shelf
      title="Порядок просмотра"
      subtitle={`${shown.length} ${plural(shown.length)} по дате выхода${done ? ` · просмотрено ${done}` : ''}`}
      variant="wide"
      extra={
        extra > 0 &&
        main.length >= 3 && (
          <div className="chips" role="group" aria-label="Что показать">
            <button type="button" className={`pill${!all ? ' active' : ''}`} aria-pressed={!all} onClick={() => setAll(false)}>
              Основное · {main.length}
            </button>
            <button type="button" className={`pill${all ? ' active' : ''}`} aria-pressed={all} onClick={() => setAll(true)}>
              Все части · {entries.length}
            </button>
          </div>
        )
      }
    >
      {shown.map((e, i) => {
        const current = e.id === animeId
        const st = status.get(e.id)
        const content = (
          <>
            <span className="order-card__img">
              {e.poster ? (
                <img src={e.poster} srcSet={srcset2x(e.poster, e.poster2x)} alt="" loading="lazy" />
              ) : null}
              <span className="order-card__num" aria-hidden="true">
                {st === 'completed' ? <CheckIcon size={14} /> : i + 1}
              </span>
            </span>
            <span className="order-card__body">
              <span className="order-card__title" title={e.title}>
                {titles[i]}
              </span>
              <span className="muted order-card__meta">{[e.year, e.kind].filter(Boolean).join(' · ')}</span>
              {current ? (
                <span className="order-card__tag order-card__tag--here">Вы здесь</span>
              ) : st && statusLabel[st] ? (
                <span className={`order-card__tag${st === 'completed' ? ' order-card__tag--done' : ''}`}>{statusLabel[st]}</span>
              ) : null}
            </span>
          </>
        )
        return current ? (
          <div key={e.id} ref={currentRef} className="row-scroll__item order-card order-card--current" aria-current="page">
            {content}
          </div>
        ) : (
          <Link key={e.id} to={`/anime/${e.id}`} className={`row-scroll__item order-card${st === 'completed' ? ' order-card--done' : ''}`}>
            {content}
          </Link>
        )
      })}
    </Shelf>
  )
}

function plural(n: number) {
  const w = new Intl.PluralRules('ru').select(n)
  return w === 'one' ? 'часть' : w === 'few' ? 'части' : 'частей'
}
