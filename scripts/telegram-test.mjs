// Тестовое уведомление о серии в Telegram (тот же код, что в worker/core/push.js).
// Запуск: TELEGRAM_BOT_TOKEN=... node scripts/telegram-test.mjs <ID чата>
import { tgSendEpisode } from '../worker/core/push.js'

const chatId = process.argv[2]
if (!process.env.TELEGRAM_BOT_TOKEN || !/^\d{1,20}$/.test(chatId ?? '')) {
  console.error('Запуск: TELEGRAM_BOT_TOKEN=... node scripts/telegram-test.mjs <ID чата>')
  process.exit(1)
}

const episode = { next_episode: 1, anime: { id: 52991, russian: 'Провожающая в последний путь Фрирен (тест)' } }
const result = await tgSendEpisode(
  process.env,
  { endpoint: `tg:${chatId}`, site: 'https://animelife.top/' },
  episode,
)
if (result !== 'sent') {
  console.error(`Не отправилось (${result}): бот не может писать в этот чат.`)
  process.exit(1)
}
console.log('Тестовое уведомление отправлено.')
