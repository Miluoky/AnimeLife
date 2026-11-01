import { Link, useLocation } from 'react-router-dom'
import { burnoutDismissStore, burnoutVisible, dismissBurnout, pausePick } from '../data/burnout'
import { useMyList } from '../data/myList'
import { watchLogStore } from '../data/watchLog'
import './burnout.css'

/** Мягкая плашка, не поверх плеера: пять плотных дней подряд. «Не сейчас» прячет её на неделю. */
export default function BurnoutNotice() {
  const { pathname } = useLocation()
  const dismissed = burnoutDismissStore.use()
  const log = watchLogStore.use()
  const list = useMyList()
  if (/^\/(watch|together)\//.test(pathname)) return null
  if (!burnoutVisible(log.entries) || dismissed > Date.now()) return null
  const pick = pausePick(list)
  return (
    <div className="container">
      <div className="burnout" role="status">
        <div className="burnout__text">
          <strong>Сделайте паузу</strong>
          <span>Пять дней подряд плотный просмотр. Можно выдохнуть и выбрать что-то полегче.</span>
        </div>
        <div className="burnout__actions">
          <Link to={pick.to} className="btn btn--small btn--accent">
            {pick.title}
          </Link>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => dismissBurnout()}>
            Не сейчас
          </button>
        </div>
      </div>
    </div>
  )
}
