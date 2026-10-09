import type { CSSProperties } from 'react'
import type { Member } from '../../data/voice'

const ROWS = 3
const SEATS = 10

/** Порядок мест от центра первого ряда к краям: 5, 4, 6, 3, 7… */
function seatOrder() {
  const order: [number, number][] = []
  for (let row = 0; row < ROWS; row++) {
    for (let k = 0; k < SEATS; k++) {
      const offset = Math.ceil(k / 2) * (k % 2 ? -1 : 1)
      order.push([row, Math.floor((SEATS - 1) / 2) + offset])
    }
  }
  return order.filter(([, seat]) => seat >= 0 && seat < SEATS)
}
const ORDER = seatOrder()

/**
 * Кинозал под экраном комнаты (вариант B редизайна): объёмные ряды кресел,
 * каждый зритель занимает своё место и оно загорается, ведущий — в центре первого ряда.
 * Только CSS-трансформации; при «меньше движения» кресла просто горят без анимации.
 */
export default function Hall({ members, hostId, myId }: { members: Member[]; hostId: string; myId?: string }) {
  // Ведущий первым, остальные по времени прихода: место за человеком не скачет при каждом обновлении.
  const seated = [...members].sort((a, b) => Number(b.userId === hostId) - Number(a.userId === hostId) || a.at - b.at)
  const taken = new Map<string, Member>()
  seated.slice(0, ORDER.length).forEach((m, i) => taken.set(ORDER[i].join(':'), m))

  return (
    <div className="hall" aria-label={`В зале ${members.length}`} role="img">
      <div className="hall__floor">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="hall__row" style={{ '--row': row } as CSSProperties}>
            {Array.from({ length: SEATS }, (_, seat) => {
              const m = taken.get(`${row}:${seat}`)
              const cls = m ? ` hall__seat--on${m.userId === hostId ? ' hall__seat--host' : ''}${m.userId === myId ? ' hall__seat--me' : ''}` : ''
              return (
                <span key={`${seat}:${m?.userId ?? ''}`} className={`hall__seat${cls}`} title={m?.name}>
                  {m && <b>{m.name.trim().charAt(0).toUpperCase() || '?'}</b>}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
