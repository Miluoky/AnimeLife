// Тестовое уведомление о серии в Telegram: тот же код и тот же вид сообщения, что и в рассылке функции community.
// Запуск: TELEGRAM_BOT_TOKEN=... node scripts/telegram-test.mjs <ID чата>
// Писать можно только тем, кто открыл бота (например, вошёл на сайт через Telegram).
import { tgSendEpisode } from '../functions/community/src/telegram.js'

const chatId = process.argv[2]
if (!process.env.TELEGRAM_BOT_TOKEN || !/^\d{1,20}$/.test(chatId ?? '')) {
  console.error('Запуск: TELEGRAM_BOT_TOKEN=... node scripts/telegram-test.mjs <ID чата>')
  process.exit(1)
}

// Пример: «Провожающая в последний путь Фрирен», как будто вышла новая серия.
const episode = { next_episode: 1, anime: { id: 52991, russian: 'Провожающая в последний путь Фрирен (тест)' } }
const result = await tgSendEpisode({ endpoint: `tg:${chatId}`, site: 'https://animelife.top/' }, episode)
if (result !== 'sent') {
  console.error(`Не отправилось (${result}): бот не может писать в этот чат.`)
  process.exit(1)
}
console.log('Тестовое уведомление отправлено.')
