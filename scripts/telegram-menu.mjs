// Кнопка «Смотреть» слева от поля ввода у бота @AnimeLifeAuth_bot: открывает сайт как Telegram Mini App.
// Настраивается через Bot API (setChatMenuButton), BotFather для этого не нужен. Скрипт можно запускать сколько угодно раз.
// Запуск: TELEGRAM_BOT_TOKEN=... node scripts/telegram-menu.mjs
// Без TELEGRAM_BOT_TOKEN токен берётся у функции входа social-login в Appwrite (нужен APPWRITE_API_KEY).

const SITE = process.env.SITE_URL || 'https://animelife.top'

async function botToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN
  const key = process.env.APPWRITE_API_KEY
  if (!key) return ''
  const res = await fetch('https://fra.cloud.appwrite.io/v1/functions/social-login/variables', {
    headers: { 'X-Appwrite-Project': '6abf65850016889f9b1b', 'X-Appwrite-Key': key },
  }).catch(() => undefined)
  const json = res?.ok ? await res.json().catch(() => ({})) : {}
  const token = (json.variables ?? []).find((v) => v.key === 'TELEGRAM_BOT_TOKEN')?.value ?? ''
  if (token && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${token}`)
  return token
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
