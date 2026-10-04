import { achievements } from '../data/achievements'

/** Сетка достижений: открытые цветные, закрытые приглушены и подсказывают, что сделать. */
export default function Achievements({ unlocked }: { unlocked: Set<string> | string[] }) {
  const has = (id: string) => (Array.isArray(unlocked) ? unlocked.includes(id) : unlocked.has(id))
  const count = achievements.filter((a) => has(a.id)).length
  return (
    <section className="stack achievements">
      <div className="section-head">
        <h2>Достижения</h2>
        <span className="muted">
          {count} из {achievements.length}
        </span>
      </div>
      <ul className="achievements__grid">
        {achievements.map((a) => (
          <li key={a.id} className={`badge${has(a.id) ? ' badge--on' : ''}`} title={a.hint}>
            <span className="badge__icon" aria-hidden="true">
              {a.icon}
            </span>
            <span className="badge__title">{a.title}</span>
            <span className="badge__hint">{a.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
