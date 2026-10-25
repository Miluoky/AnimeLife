import { expect, test } from '@playwright/test'
import { digestTime, weekKey, weeklyPollOptions, weeklyPost, weekReleases } from '../scripts/telegram-news.mjs'

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
