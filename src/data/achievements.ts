import { flagsStore, type Flag } from './flags'
import { listStore, type ListEntry } from './myList'
import { toast } from './toast'
import { createLocalStore } from './localStore'

/** Достижения как на Kitsu и AniList: за просмотренное, оценки и совместный просмотр. */
export interface Achievement {
  id: string
  icon: string
  title: string
  hint: string
}

export interface ListFacts {
  total: number
  completed: number
  planned: number
  watchingOngoing: number
  episodes: number
  rated: number
}

export function listFacts(list: ListEntry[]): ListFacts {
  return {
    total: list.length,
    completed: list.filter((e) => e.status === 'completed').length,
    planned: list.filter((e) => e.status === 'planned').length,
    watchingOngoing: list.filter((e) => e.status === 'watching' && e.anime.ongoing).length,
    episodes: list.reduce(
      (n, e) => n + (e.watched ?? (e.status === 'completed' ? (e.anime.episodes ?? 0) : 0)),
      0,
    ),
    rated: list.filter((e) => e.rating).length,
  }
}

type Rule = Achievement & { done: (f: ListFacts, flags: Partial<Record<Flag, number>>) => boolean }

const rules: Rule[] = [
  { id: 'first', icon: '🌱', title: 'Первый шаг', hint: 'Добавить тайтл в список', done: (f) => f.total >= 1 },
  { id: 'ten', icon: '🎬', title: 'Десятка', hint: '10 просмотренных тайтлов', done: (f) => f.completed >= 10 },
  { id: 'fifty', icon: '🏅', title: 'Полсотни', hint: '50 просмотренных тайтлов', done: (f) => f.completed >= 50 },
  { id: 'hundred', icon: '👑', title: 'Сотня', hint: '100 просмотренных тайтлов', done: (f) => f.completed >= 100 },
  { id: 'eps100', icon: '📺', title: 'Сто серий', hint: '100 просмотренных серий', done: (f) => f.episodes >= 100 },
  { id: 'eps1000', icon: '🚀', title: 'Тысяча серий', hint: '1000 просмотренных серий', done: (f) => f.episodes >= 1000 },
  { id: 'critic', icon: '⭐', title: 'Критик', hint: 'Оценить 10 тайтлов', done: (f) => f.rated >= 10 },
  { id: 'planner', icon: '🗂️', title: 'Планы на зиму', hint: '20 тайтлов в «Буду смотреть»', done: (f) => f.planned >= 20 },
  { id: 'onair', icon: '📡', title: 'В эфире', hint: 'Смотреть 5 онгоингов одновременно', done: (f) => f.watchingOngoing >= 5 },
  { id: 'together', icon: '🍿', title: 'Вместе веселее', hint: 'Посмотреть в комнате с друзьями', done: (_, g) => !!g.joinedRoom },
  { id: 'host', icon: '🎤', title: 'Ведущий', hint: 'Создать свою комнату', done: (_, g) => !!g.hostedRoom },
  { id: 'owl', icon: '🦉', title: 'Сова', hint: 'Смотреть серию между полуночью и пятью утра', done: (_, g) => !!g.nightOwl },
  { id: 'reviewer', icon: '✍️', title: 'Рецензент', hint: 'Написать отзыв', done: (_, g) => !!g.wroteReview },
  { id: 'talker', icon: '💬', title: 'Собеседник', hint: 'Обсудить серию', done: (_, g) => !!g.commented },
  { id: 'eye', icon: '🖼️', title: 'Глаз-алмаз', hint: 'Угадать 5 аниме по кадру подряд', done: (_, g) => !!g.quizStreak },
  { id: 'mover', icon: '📦', title: 'Переезд', hint: 'Импортировать список с другого сайта', done: (_, g) => !!g.imported },
]

export const achievements: Achievement[] = rules.map(({ id, icon, title, hint }) => ({ id, icon, title, hint }))

export function unlocked(list = listStore.get(), flags = flagsStore.get()): Set<string> {
  const f = listFacts(list)
  return new Set(rules.filter((r) => r.done(f, flags)).map((r) => r.id))
}

const seenStore = createLocalStore<string[] | null>('anime.achievements.seen.v1', null)

/** Следим за списком и событиями: новое достижение — короткое уведомление. Первый запуск молча запоминает уже открытые. */
export function watchAchievements() {
  const check = () => {
    const now = unlocked()
    const seen = seenStore.get()
    if (!seen) return seenStore.set([...now])
    const fresh = [...now].filter((id) => !seen.includes(id))
    if (!fresh.length) return
    seenStore.set([...seen, ...fresh])
    for (const id of fresh.slice(0, 2)) {
      const a = achievements.find((x) => x.id === id)!
      toast(`${a.icon} Достижение: «${a.title}»`)
    }
  }
  check()
  listStore.subscribe(check)
  flagsStore.subscribe(check)
}
