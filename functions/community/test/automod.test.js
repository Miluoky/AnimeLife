import assert from 'node:assert/strict'
import test from 'node:test'
import { heldReason, rejectSpam } from '../src/automod.js'

test('мат ловится и в обход: латиница, точки, ё; обычные слова не задеваются', () => {
  for (const bad of ['да пошёл ты нахуй', 'это пиздец', 'Ебать, вот это серия', 'бля, опять клиффхэнгер', 'xуйня какая-то', 'п.и.з.д.е.ц', 'ну ты и мудак', 'заебись озвучка', '6ля']) {
    assert.equal(heldReason(bad), 'мат', bad)
  }
  for (const ok of ['Страхуем друг друга', 'оставлю это себе', 'небо было красивым', 'не стоит употреблять', 'хуже, чем первый сезон', 'художник постарался', 'ребята, это шедевр', 'мудрый наставник', 'бляха-муха, вот это поворот', 'Глеб, ты где', 'вебинар по аниме', 'хлеба и зрелищ']) {
    assert.equal(heldReason(ok), null, ok)
  }
})

test('ссылки на чужие сайты и каналы — модератору, на Shikimori и YouTube можно', () => {
  assert.equal(heldReason('Заработок от 5000 в день: https://casino-win.xyz/promo'), 'ссылка')
  assert.equal(heldReason('смотрите на bestanime.ru быстрее'), 'ссылка')
  assert.equal(heldReason('подпишись t.me/spamchannel'), 'ссылка')
  assert.equal(heldReason('пишите в лс @super_promo_bot'), 'ссылка')
  assert.equal(heldReason('опенинг https://www.youtube.com/watch?v=abc и инфа https://shikimori.one/animes/1'), null)
  assert.equal(heldReason('у нас на animelife.top есть вторая часть'), null)
  assert.equal(heldReason('в 12:34 лучший момент. Т.е. всё ясно'), null)
})

test('флуд и повтор своего текста отклоняются', () => {
  assert.throws(() => rejectSpam('ааааааааааааааааааа'), /флуд/)
  assert.throws(() => rejectSpam('Класс!  Серия огонь', ['класс! серия огонь']), /уже отправили/)
  assert.doesNotThrow(() => rejectSpam('Ахахах, вот это да!!!', ['другое']))
})
