// Проверка сайта и источников видео (workflow source-health.yml, раз в час).
// Каждый сервис опрашивается так же, как это делает сайт; не ответил дважды подряд — считаем упавшим.
// Состояние прошлой проверки лежит в .health/state.json (кэш GitHub Actions): в Telegram пишем только
// когда что-то упало или поднялось, а не каждый час.
// Кому писать: TELEGRAM_ADMIN_CHAT_ID, иначе администраторам сайта (метка admin в Appwrite),
// вошедшим через Telegram. Токен бота — TELEGRAM_BOT_TOKEN или переменная функции входа (APPWRITE_API_KEY).
// Ещё считает вызовы Worker за сутки UTC (лимит бесплатного плана 100 000, сброс в 00:00 UTC): на 70 и 90 тысячах
// пишет администратору один раз за сутки на каждый порог, пока сайт не начал отвечать Error 1027.
// Нужны ключи публикации CLOUDFLARE_EMAIL и CLOUDFLARE_API_KEY (секреты ANIMELIFE_CF_*); без них проверка пропускается.
// Запуск у себя: node scripts/source-health.mjs (без токенов только печатает результат).
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'

const run = promisify(execFile)

const SITE = process.env.SITE_URL || 'https://animelife.top'
const APPWRITE = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const STATE_FILE = '.health/state.json'
const TIMEOUT = 15_000

/** Что проверяем: имя для сообщения и запрос, который должен вернуть 2xx и ожидаемое содержимое. */
// Свой сайт за Cloudflare: серверам GitHub он отвечает проверкой на робота или блокировкой (403 от Cloudflare).
// Это значит, что Cloudflare и Worker живы, поэтому такой ответ считаем рабочим.
const CHECKS = [
  { name: 'Сайт animelife.top', url: `${SITE}/`, expect: (t) => t.includes('id="root"'), challengeOk: true },
  { name: 'Каталог (прокси Shikimori)', url: `${SITE}/api/shiki/api/animes/1`, expect: (t) => t.includes('"id":1'), challengeOk: true },
  { name: 'AniLibria', url: 'https://anilibria.top/api/v1/anime/releases/latest?limit=1', mirror: 'https://aniliberty.top/api/v1/anime/releases/latest?limit=1' },
  { name: 'AnimeVost', url: 'https://api.animevost.org/v1/search', init: { method: 'POST', body: new URLSearchParams({ name: 'Наруто' }) }, expect: (t) => t.includes('"data"') },
  {
    name: 'Anixart',
    url: 'https://api.anixart.tv/search/releases/0',
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'Наруто', searchBy: 0 }) },
    expect: (t) => t.includes('"content"'),
  },
  { name: 'YummyAnime', url: 'https://api.yani.tv/search?q=naruto&limit=1', expect: (t) => t.includes('"response"') },
  { name: 'Appwrite (аккаунты, списки, комментарии)', url: `${APPWRITE}/health/version`, expect: (t) => t.includes('version') },
]
if (process.env.KODIK_TOKEN) {
  CHECKS.push({ name: 'Kodik', url: `https://kodik-api.com/search?token=${process.env.KODIK_TOKEN}&shikimori_id=1`, expect: (t) => t.includes('"results"'), secret: true })
}

// Запросы через curl: AniLibria (DDoS-Guard) отвечает 403 на fetch из Node, а curl пускает.
async function probe(url, init) {
  const args = ['-sS', '-L', '--max-time', String(TIMEOUT / 1000), '-o', '-', '-w', '\n%{http_code} %{time_total}', '-A', 'Mozilla/5.0']
  if (init?.method) args.push('-X', init.method)
  for (const [k, v] of Object.entries(init?.headers ?? {})) args.push('-H', `${k}: ${v}`)
  if (init?.body) args.push('--data-raw', String(init.body))
  args.push(url)
  try {
    const { stdout } = await run('curl', args, { maxBuffer: 20 * 1024 * 1024 })
    const cut = stdout.lastIndexOf('\n')
    const [status, time] = stdout.slice(cut + 1).split(' ')
    return { ok: +status >= 200 && +status < 300, status: +status, text: stdout.slice(0, cut), ms: Math.round(+time * 1000) }
  } catch (e) {
    throw Object.assign(new Error('curl'), { name: e?.code === 28 ? 'TimeoutError' : 'NetworkError' })
  }
}

async function check(c) {
  let last = ''
  for (const url of [c.url, c.url, c.mirror].filter(Boolean)) {
    try {
      const r = await probe(url, c.init)
      if (r.ok && (!c.expect || c.expect(r.text))) return { up: true, ms: r.ms }
      if (c.challengeOk && r.status === 403 && /challenge-platform|cf-chl|Just a moment|cloudflare/i.test(r.text)) return { up: true, ms: r.ms, challenged: true }
      last = r.ok ? 'неожиданный ответ' : `HTTP ${r.status}`
    } catch (e) {
      last = e?.name === 'TimeoutError' ? `нет ответа за ${TIMEOUT / 1000} с` : 'не подключается'
    }
  }
  return { up: false, reason: last }
}

async function botToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN
  const key = process.env.APPWRITE_API_KEY
  if (!key) return ''
  const res = await fetch(`${APPWRITE}/functions/social-login/variables`, { headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': key } }).catch(() => undefined)
  const json = res?.ok ? await res.json().catch(() => ({})) : {}
  const token = (json.variables ?? []).find((v) => v.key === 'TELEGRAM_BOT_TOKEN')?.value ?? ''
  if (token && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${token}`)
  return token
}

/** Администраторы сайта, вошедшие через Telegram: id аккаунта tg_<chat id>. */
async function adminChats() {
  if (process.env.TELEGRAM_ADMIN_CHAT_ID) return process.env.TELEGRAM_ADMIN_CHAT_ID.split(',').map((s) => s.trim()).filter(Boolean)
  const key = process.env.APPWRITE_API_KEY
  if (!key) return []
  const chats = []
  for (let offset = 0; offset < 5000; offset += 100) {
    const q = [{ method: 'limit', values: [100] }, { method: 'offset', values: [offset] }].map((x) => `queries[]=${encodeURIComponent(JSON.stringify(x))}`).join('&')
    const res = await fetch(`${APPWRITE}/users?${q}`, { headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': key } }).catch(() => undefined)
    const json = res?.ok ? await res.json().catch(() => ({})) : {}
    const users = json.users ?? []
    for (const u of users) {
      const m = /^tg_(\d{1,20})$/.exec(u.$id)
      if (m && (u.labels ?? []).includes('admin')) chats.push(m[1])
    }
    if (users.length < 100) break
  }
  return chats
}

async function notify(text) {
  const token = await botToken()
  const chats = token ? await adminChats() : []
  if (!token || !chats.length) {
    console.log('::notice::Сообщение в Telegram не отправлено: нет токена бота или чата администратора.')
    return
  }
  for (const chat_id of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
    }).catch(() => undefined)
    if (!res?.ok) console.log(`::warning::Telegram не принял сообщение (${res?.status ?? 'сеть'}).`)
  }
}

const WORKER_LIMIT = 100_000
/** Пороги предупреждения о лимите Worker: на каждом пишем один раз за сутки. */
const WORKER_ALERTS = [70_000, 90_000]

/** Вызовы Worker «anime» с 00:00 UTC сегодня. undefined — ключей нет или Cloudflare не ответил. */
async function workerRequestsToday(now) {
  const email = process.env.CLOUDFLARE_EMAIL
  const key = process.env.CLOUDFLARE_API_KEY
  if (!email || !key) return undefined
  const headers = { 'X-Auth-Email': email, 'X-Auth-Key': key, 'Content-Type': 'application/json' }
  try {
    const zones = await fetch('https://api.cloudflare.com/client/v4/zones?name=animelife.top', { headers }).then((r) => r.json())
    const account = zones.result?.[0]?.account?.id
    if (!account) throw new Error('зона animelife.top не найдена')
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `query ($account: String!, $from: Time!, $to: Time!) {
          viewer { accounts(filter: { accountTag: $account }) {
            workersInvocationsAdaptive(limit: 100, filter: { scriptName: "anime", datetime_geq: $from, datetime_leq: $to }) { sum { requests } }
          } }
        }`,
        variables: { account, from: `${now.toISOString().slice(0, 10)}T00:00:00Z`, to: now.toISOString() },
      }),
    }).then((r) => r.json())
    if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '))
    return (res.data.viewer.accounts[0]?.workersInvocationsAdaptive ?? []).reduce((n, r) => n + r.sum.requests, 0)
  } catch (e) {
    console.log(`::warning::Не удалось узнать вызовы Worker: ${e.message}`)
    return undefined
  }
}

/**
 * Текст предупреждения, если за сутки пройден новый порог. sent — порог, о котором уже писали сегодня.
 * Прогноз до конца суток — по среднему темпу с полуночи UTC.
 */
function workerAlert(requests, now, sent = 0) {
  const level = WORKER_ALERTS.filter((n) => requests >= n).pop()
  if (!level || level <= sent) return undefined
  const hours = (now.getTime() - Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)) / 3_600_000
  const forecast = hours >= 1 ? Math.round((requests / hours) * 24) : undefined
  const left = Math.max(0, 24 - Math.ceil(hours))
  const fmt = (n) => n.toLocaleString('ru-RU')
  return {
    level,
    text:
      `⚠️ Anime Life: Worker уже ${fmt(requests)} запросов за сутки из ${fmt(WORKER_LIMIT)}.\n` +
      (forecast ? `При таком темпе к 03:00 мск будет около ${fmt(forecast)}${forecast >= WORKER_LIMIT ? ', сайт может начать отвечать Error 1027' : ''}.\n` : '') +
      `До сброса лимита около ${left} ч.\n\n` +
      `Что сделать: в Cloudflare → Security → Events посмотреть, кто шлёт запросы, и закрыть их правилом WAF (docs/worker-limit.md). ` +
      `Если это живые зрители — включить Workers Paid ($5 в месяц).`,
  }
}

const results = await Promise.all(CHECKS.map(async (c) => ({ name: c.name, ...(await check(c)) })))
for (const r of results) console.log(`${r.up ? '✅' : '❌'} ${r.name}${r.up ? ` — ${r.ms} мс${r.challenged ? ' (Cloudflare не пустил сервер GitHub, но отвечает)' : ''}` : ` — ${r.reason}`}`)

const before = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
const down = results.filter((r) => !r.up && before[r.name] !== false)
const back = results.filter((r) => r.up && before[r.name] === false)
const lines = [
  ...down.map((r) => `❌ ${r.name}: ${r.reason}`),
  ...back.map((r) => `✅ ${r.name} снова работает`),
]
if (lines.length) {
  const still = results.filter((r) => !r.up).length
  await notify(`Anime Life, проверка источников\n\n${lines.join('\n')}${still ? `\n\nСейчас не работает: ${still} из ${results.length}. Плеер сам переключается на рабочие источники.` : ''}\n${SITE}`)
}

const now = new Date()
const today = now.toISOString().slice(0, 10)
const requests = await workerRequestsToday(now)
let worker = before._worker?.date === today ? before._worker : { date: today, sent: 0 }
if (requests !== undefined) {
  console.log(`Worker: ${requests} вызовов с 00:00 UTC (${Math.round((requests / WORKER_LIMIT) * 100)}% лимита)`)
  const alert = workerAlert(requests, now, worker.sent)
  if (alert) {
    await notify(alert.text)
    worker = { date: today, sent: alert.level }
  }
}

mkdirSync('.health', { recursive: true })
writeFileSync(STATE_FILE, JSON.stringify({ ...Object.fromEntries(results.map((r) => [r.name, r.up])), _worker: worker }))

// Сам сайт или каталог лёг — job красный, GitHub тоже пришлёт письмо.
if (!results[0].up || !results[1].up) process.exit(1)
