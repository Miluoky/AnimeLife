import './profile-extras.css'
import type { AnimeCard } from '../data/catalog'
import type { CollectionItem } from '../data/social'
import { levelOf } from '../data/xp'

/** Мелочи для страниц сообщества: аватар с рамкой, значок уровня, «5 минут назад». */

const when = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })
export function ago(t: number) {
  const min = Math.round((t - Date.now()) / 60_000)
  if (min > -60) return when.format(min, 'minute')
  const h = Math.round(min / 60)
  if (h > -24) return when.format(h, 'hour')
  const d = Math.round(h / 24)
  if (d > -30) return when.format(d, 'day')
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function Avatar({ name, frame, size = 40 }: { name: string; frame?: string; size?: number }) {
  return (
    <span className={`s-avatar s-avatar--${frame || 'none'}`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

export function LevelBadge({ xp }: { xp?: number }) {
  const l = levelOf(xp ?? 0)
  return (
    <span className="s-level" title={`${xp ?? 0} опыта`}>
      ур. {l.level} · {l.rank}
    </span>
  )
}

/** Тайтл из подборки или ленты — в карточку для PosterCard. */
export const itemCard = (it: Pick<CollectionItem, 'id' | 'title' | 'poster' | 'year' | 'kind'>): AnimeCard => ({
  id: it.id,
  title: it.title,
  year: it.year,
  kind: it.kind ?? 'tv',
  ongoing: false,
  posterUrl: it.poster || undefined,
  posterSmall: it.poster || undefined,
  posterFill: '#1f2029',
})

export const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return one
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}
