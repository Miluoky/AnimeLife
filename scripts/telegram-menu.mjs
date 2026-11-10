// Кнопка «Смотреть» слева от поля ввода у бота @AnimeLifeAuth_bot: открывает сайт как Telegram Mini App.
// Настраивается через Bot API (setChatMenuButton), BotFather для этого не нужен. Скрипт можно запускать сколько угодно раз.
// Запуск: TELEGRAM_BOT_TOKEN=... node scripts/telegram-menu.mjs

const SITE = process.env.SITE_URL || 'https://animelife.top'

async function botToken() {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim()
}

const token = await botToken()
if (!token) {
  console.log('::notice::Нет токена бота, кнопка Mini App не настроена.')
  process.exit(0)
}

async function bot(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`)
  return json.result
}

await bot('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Смотреть', web_app: { url: SITE } } })
await bot('setMyCommands', { commands: [{ command: 'start', description: 'Смотреть аниме в Telegram' }] })
await bot('setMyShortDescription', { short_description: 'Аниме с русской озвучкой прямо в Telegram: каталог, онгоинги, мой список.' })
console.log(`Кнопка «Смотреть» у бота ведёт на ${SITE}`)
