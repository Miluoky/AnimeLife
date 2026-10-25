import { expect, test } from '@playwright/test'
import { digestTime, episodeButtons, episodesWord, monthKey, monthTopPost, monthTopTime, weekKey, weeklyPollOptions, weeklyPost, weekReleases } from '../scripts/telegram-news.mjs'

// Итоги недели в Telegram-канале: что вышло с понедельника и опрос «Серия недели».

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона'))

test('неделя с понедельника, итоги в воскресенье с 17:00 мск', () => {
  expect(weekKey(new Date('2026-10-25T20:00:00Z'))).toBe('2026-10-19')
  expect(weekKey(new Date('2026-10-26T00:10:00Z'))).toBe('2026-10-26')
  expect(digestTime(new Date('2026-10-25T13:59:00Z'))).toBe(false)
  expect(digestTime(new Date('2026-10-25T14:07:00Z'))).toBe(true)
  expect(digestTime(new Date('2026-10-24T18:00:00Z'))).toBe(false)
})

test('что вышло: рост серий от снимка, завершившиеся тоже, без снимка — пропускаем', () => {
  const list = [
    { id: '10', russian: 'Дандадан', episodesAired: 9, episodes: 12 },
    { id: '11', russian: 'Без новых серий', episodesAired: 5, episodes: 12 },
    { id: '12', russian: 'Финал недели', episodesAired: 0, episodes: 12 },
    { id: '13', russian: 'Новичок в топе', episodesAired: 3, episodes: 12 },
  ]
  const fresh = weekReleases(list, { 10: 7, 11: 5, 12: 11 })
  expect(fresh.map((a) => [a.id, a.from, a.episodesAired])).toEqual([
    ['10', 8, 9],
    ['12', 12, 12],
  ])
  const text = weeklyPost(fresh)
  expect(text).toContain('<b>Что вышло за неделю</b>')
  expect(text).toContain('<a href="https://animelife.top/watch/10/9">Дандадан</a>: 8–9 серии')
  expect(text).toContain('Финал недели</a>: 12-я серия')
  expect(text).toContain('#итоги_недели')
  expect(weeklyPollOptions(fresh)).toEqual([{ text: 'Дандадан, 9' }, { text: 'Финал недели, 12' }])
  const long = weeklyPollOptions([{ id: '1', russian: 'Я'.repeat(120), episodesAired: 3 }])[0].text
  expect(long.length).toBeLessThanOrEqual(100)
})

test('пост о серии: кнопки «Смотреть» и «Обсудить» ведут на серию и к её обсуждению', () => {
  expect(episodeButtons({ id: 52991, episodesAired: 7 })).toEqual([
    [['▶️ Смотреть', 'https://animelife.top/watch/52991/7'], ['💬 Обсудить', 'https://animelife.top/watch/52991/7#comments']],
    [['О тайтле', 'https://animelife.top/anime/52991']],
  ])
})

test('топ зрителей месяца: в последний день после 18:00 мск, имена с матом пропускаем, меньше трёх — не публикуем', () => {
  expect(monthKey(new Date('2026-10-31T16:00:00Z'))).toBe(202610)
  expect(monthTopTime(new Date('2026-10-31T15:00:00Z'))).toBe(true)
  expect(monthTopTime(new Date('2026-10-31T14:59:00Z'))).toBe(false)
  expect(monthTopTime(new Date('2026-10-30T20:00:00Z'))).toBe(false)
  const rows = [
    { $id: 'u1', name: 'Мика', monthXp: 1200 },
    { $id: 'u2', name: 'бля<script>', monthXp: 900 },
    { $id: 'u3', name: 'Рэй & Ко', monthXp: 600 },
    { $id: 'u4', name: 'Аска', monthXp: 50 },
  ]
  const text = monthTopPost(rows, new Date('2026-10-31T16:00:00Z'))!
  expect(text).toContain('🏆 <b>Топ зрителей октября</b>')
  expect(text).toContain('🥇 <a href="https://animelife.top/u/u1">Мика</a>: 120 серий')
  expect(text).toContain('🥈 <a href="https://animelife.top/u/u3">Рэй &amp; Ко</a>: 60 серий')
  expect(text).toContain('🥉 <a href="https://animelife.top/u/u4">Аска</a>: 5 серий')
  expect(text).not.toContain('бля')
  expect(monthTopPost(rows.slice(0, 2))).toBeNull()
  expect([1, 2, 5, 11, 21, 22, 112].map(episodesWord)).toEqual(['1 серия', '2 серии', '5 серий', '11 серий', '21 серия', '22 серии', '112 серий'])
})
