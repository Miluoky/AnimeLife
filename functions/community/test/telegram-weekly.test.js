import assert from 'node:assert/strict'
import test from 'node:test'
import { weeklyDigestText } from '../src/telegram.js'

test('воскресная сводка: новые серии, недосмотренное и досмотренное', () => {
  const text = weeklyDigestText(
    { animeIds: ['1', '2'], site: 'https://animelife.top/' },
    {
      arrivals: [{ id: '1', title: 'Дандадан', ep: 9 }],
      behind: [{ id: '2', title: 'Фрирен', left: 3, nextEp: 4 }],
      doneTitles: ['Ковбой Бибоп'],
    },
  )
  assert.match(text, /Сводка «Смотрю» за неделю/)
  assert.match(text, /В подписке 2 тайтла/)
  assert.match(text, /Дандадан/)
  assert.match(text, /watch\/1\/9/)
  assert.match(text, /Фрирен/)
  assert.match(text, /3 серии/)
  assert.match(text, /Ковбой Бибоп/)
  assert.match(text, /Если понравилось/)
})

test('пустая сводка без подписки', () => {
  const text = weeklyDigestText({ animeIds: [], site: 'https://animelife.top/' }, {})
  assert.match(text, /Список «Смотрю» пока пуст/)
  assert.match(text, /новых серий в подписке не выходило/)
})
