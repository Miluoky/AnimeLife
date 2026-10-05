// Автоновости в Telegram-канал Anime Life (.github/workflows/telegram-news.yml, запуск каждые 30 минут).
// Посты с карточкой тайтла в дизайне сайта (scripts/telegram-card.mjs). Публикует бот @AnimeLifeAuth_bot (он должен быть администратором канала):
//   • новые серии популярных онгоингов Shikimori: до трёх отдельными постами с постером, больше — одной сводкой;
//   • анонс сезона за три недели до его начала: самые ожидаемые тайтлы и ссылка на страницу сезона;
//   • обновления сайта из src/data/changelog.ts, один пост на день обновлений.
// Что уже опубликовано, хранится в STATE_FILE (между запусками его переносит кэш GitHub Actions). Если файла нет
// (первый запуск или кэш пропал), скрипт только запоминает текущее состояние и ничего не публикует, чтобы не завалить
// канал старыми новостями. Ночью (01:00–08:00 по Москве) посты выходят без звука.
// Запуск: TELEGRAM_BOT_TOKEN=... TELEGRAM_CHANNEL=@канал node scripts/telegram-news.mjs [--dry-run]
// Без TELEGRAM_BOT_TOKEN токен берётся у функции входа social-login в Appwrite (нужен APPWRITE_API_KEY).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CHANGELOG } from '../src/data/changelog.ts'
import { closeCards, renderCard } from './telegram-card.mjs'

const SITE = 'https://animelife.top'
const SHIKIMORI = 'https://shikimori.io'
const STATE_FILE = process.env.STATE_FILE || '.tg-news/state.json'
const CHANNEL = (process.env.TELEGRAM_CHANNEL || '').trim()
const DRY_RUN = process.argv.includes('--dry-run')
// Сколько онгоингов (по популярности) отслеживаем: дальше хвост, о котором канал не пишет.
const ONGOING_LIMIT = 30
// Больше стольких серий за запуск: одна сводка вместо отдельных постов.
const SEPARATE_POSTS = 3
// За сколько дней до начала сезона выходит анонс.
const SEASON_LEAD_DAYS = 21

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const escapeHtml = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const titleOf = (a) => a.russian || a.name

/** Описание Shikimori без BBCode ([character=1]Имя[/character] → Имя), обрезанное по предложению. */
export function shortText(text, max = 280) {
  const plain = String(text ?? '')
    .replace(/\[(\w+)(?:=[^\]]*)?\]([^[]*)\[\/\1\]/g, '$2')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const end = cut.lastIndexOf('. ')
  return (end > max / 2 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim()
}

const hashtag = (name) => '#' + String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')

// ——— Telegram ———

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

let TOKEN = ''

async function bot(method, params, image) {
  if (DRY_RUN && image && process.env.CARD_DIR) {
    const file = `${process.env.CARD_DIR}/card-${Date.now()}.png`
    writeFileSync(file, image)
    console.log(`[dry-run] карточка: ${file}`)
  }
  if (DRY_RUN && method !== 'getChat' && method !== 'getMe') {
    console.log(`[dry-run] ${method}\n${params.caption ?? params.text}\n`)
    return { ok: true }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let body = JSON.stringify(params)
    let headers = { 'Content-Type': 'application/json' }
    // Картинка-файл (карточка) уходит формой multipart, остальные параметры рядом строками.
    if (image) {
      body = new FormData()
      for (const [k, v] of Object.entries(params)) body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
      body.append('photo', new Blob([image], { type: 'image/png' }), 'card.png')
      headers = {}
    }
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(20000),
    })
    const json = await res.json().catch(() => ({}))
    if (json.ok) return json
    // Лимит Telegram на частоту постов: ждём, сколько он просит.
    const wait = json.parameters?.retry_after
    if (res.status === 429 && wait && wait < 120) {
      await pause(wait * 1000)
      continue
    }
    throw new Error(`Telegram ${method}: ${res.status} ${json.description ?? ''}`)
  }
  throw new Error(`Telegram ${method}: лимит запросов`)
}

/** Ночью по Москве посты выходят без звука. */
function silent(now = new Date()) {
  const hour = (now.getUTCHours() + 3) % 24
  return hour >= 1 && hour < 8
}

// Telegram ограничивает подпись 1024 видимыми символами: теги разметки не считаются.
const captionFits = (text) => text.replace(/<[^>]+>/g, '').replace(/&\w+;/g, '_').length <= 1024

async function post({ text, photo, card, buttons }) {
  const base = {
    chat_id: CHANNEL,
    parse_mode: 'HTML',
    disable_notification: silent(),
    ...(buttons && { reply_markup: { inline_keyboard: buttons.map((row) => row.map(([t, url]) => ({ text: t, url }))) } }),
  }
  if (card && captionFits(text)) {
    try {
      return await bot('sendPhoto', { ...base, caption: text }, card)
    } catch (e) {
      console.warn(`Карточка не отправилась (${e.message}), пробуем постер.`)
    }
  }
  if (photo && captionFits(text)) {
    try {
      return await bot('sendPhoto', { ...base, photo, caption: text })
    } catch (e) {
      // Постер не скачался: публикуем без него, но с превью ссылки.
      console.warn(`Постер не отправился (${e.message}), пост без картинки.`)
    }
  }
  return bot('sendMessage', { ...base, text, link_preview_options: { is_disabled: !buttons } })
}

// ——— Shikimori ———

async function graphql(query) {
  const res = await fetch(`${SHIKIMORI}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'AnimeLife/1.0 (+https://animelife.top)' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.errors) throw new Error(`Shikimori: ${res.status} ${JSON.stringify(json.errors ?? '').slice(0, 200)}`)
  return json.data
}

const FIELDS = 'id name russian kind episodes episodesAired score airedOn { year } poster { originalUrl } genres { russian kind } description'

// ——— Новые серии ———

export function episodeCaption(a) {
  const n = a.episodesAired
  const total = a.episodes > 0 ? ` из ${a.episodes}` : ''
  const last = a.episodes > 0 && n >= a.episodes ? ' Это финал сезона!' : ''
  const tags = (a.genres ?? []).filter((g) => g.kind === 'genre').slice(0, 3).map((g) => hashtag(g.russian))
  return [
    `🎬 <b>${escapeHtml(titleOf(a))}</b>`,
    `Вышла ${n}-я серия${total}.${last}`,
    '',
    escapeHtml(shortText(a.description)),
    '',
    `▶️ <a href="${SITE}/watch/${a.id}/${n}">Смотреть на Anime Life</a>`,
    '',
    ['#новая_серия', ...tags].join(' '),
  ]
    .filter((line, i, all) => line || all[i - 1])
    .join('\n')
    .trim()
}

export function episodesDigest(list) {
  const lines = list
    .slice(0, 15)
    .map((a) => `▫️ <a href="${SITE}/watch/${a.id}/${a.episodesAired}">${escapeHtml(titleOf(a))}</a>: ${a.episodesAired}-я серия`)
  const more = list.length > 15 ? `\n…и ещё ${list.length - 15}` : ''
  return `🎬 <b>Новые серии</b>\n\n${lines.join('\n')}${more}\n\n#новая_серия`
}

async function episodes(state) {
  const data = await graphql(`{ animes(status: "ongoing", order: popularity, limit: ${ONGOING_LIMIT}) { ${FIELDS} } }`)
  const list = (data.animes ?? []).filter((a) => a.episodesAired > 0)
  const known = state.episodes
  const fresh = known ? list.filter((a) => known[a.id] !== undefined && a.episodesAired > known[a.id]) : []
  const next = {}
  for (const a of list) next[a.id] = known?.[a.id] ?? a.episodesAired
  state.episodes = next
  if (!fresh.length) return 0

  if (fresh.length <= SEPARATE_POSTS) {
    for (const a of fresh) {
      await post({
        text: episodeCaption(a),
        photo: a.poster?.originalUrl,
        card: await renderCard(a, { badge: `Новая серия · ${a.episodesAired}`, text: shortText(a.description, 400) }),
        buttons: [[['▶️ Смотреть', `${SITE}/watch/${a.id}/${a.episodesAired}`], ['О тайтле', `${SITE}/anime/${a.id}`]]],
      })
      next[a.id] = a.episodesAired
      await pause(1500)
    }
  } else {
    await post({ text: episodesDigest(fresh), photo: fresh[0].poster?.originalUrl, buttons: [[['📅 Расписание', `${SITE}/schedule`]]] })
    for (const a of fresh) next[a.id] = a.episodesAired
  }
  return fresh.length
}

// ——— Анонс сезона ———

const SEASON_NAMES = { winter: 'зимы', spring: 'весны', summer: 'лета', fall: 'осени' }
const SEASON_EMOJI = { winter: '❄️', spring: '🌸', summer: '☀️', fall: '🍁' }

/** Ближайший аниме-сезон, который ещё не начался: январь — зима, апрель — весна, июль — лето, октябрь — осень. */
export function upcomingSeason(now = new Date()) {
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1
  const year = now.getUTCFullYear() + (quarter === 4 ? 1 : 0)
  const month = (quarter % 4) * 3
  const name = ['winter', 'spring', 'summer', 'fall'][quarter % 4]
  const start = new Date(Date.UTC(year, month, 1))
  return { name, year, key: `${name}_${year}`, start, days: (start - now) / 86400000 }
}

export async function season(state, now = new Date()) {
  const s = upcomingSeason(now)
  state.seasons ??= []
  if (s.days > SEASON_LEAD_DAYS || state.seasons.includes(s.key)) return 0
  const data = await graphql(`{ animes(season: "${s.key}", order: popularity, limit: 10, kind: "tv,ona,movie") { ${FIELDS} } }`)
  const list = data.animes ?? []
  if (list.length < 3) return 0
  const lines = list.map((a) => `▫️ <a href="${SITE}/anime/${a.id}">${escapeHtml(titleOf(a))}</a>`)
  const text =
    `${SEASON_EMOJI[s.name]} <b>Аниме ${SEASON_NAMES[s.name]} ${s.year}: что ждём</b>\n\n` +
    `Самые ожидаемые тайтлы нового сезона:\n${lines.join('\n')}\n\n` +
    `Добавляйте в «Мой список» и включайте колокольчик: мы напомним о новых сериях.\n\n#анонс #сезон_${SEASON_NAMES[s.name]}`
  const card = await renderCard(list[0], { badge: `Анонс ${SEASON_NAMES[s.name]} ${s.year}`, text: shortText(list[0].description, 400) })
  await post({ text, card, photo: list[0].poster?.originalUrl, buttons: [[['Весь сезон', `${SITE}/year/${s.year}/${s.name}`]]] })
  state.seasons = [...state.seasons, s.key].slice(-8)
  return 1
}

// ——— Обновления сайта ———

const changelogKey = (date, item) => `${date}|${item.title}`

const KIND_EMOJI = { new: '✨', better: '⚡️', fix: '🛠' }

export function changelogPost(day) {
  const date = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day.date}T12:00:00Z`))
  const items = day.items.slice(0, 6).map((item) => {
    const title = item.to ? `<a href="${SITE}${item.to}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)
    return `${KIND_EMOJI[item.kind] ?? '▫️'} <b>${title}</b>\n${escapeHtml(shortText(item.text, 220))}`
  })
  const more = day.items.length > 6 ? `\n\n…и ещё ${day.items.length - 6} на странице «Что нового».` : ''
  return `🆕 <b>Обновление Anime Life, ${date}</b>\n\n${items.join('\n\n')}${more}\n\n#обновление`
}

async function changelog(state) {
  const all = CHANGELOG.flatMap((day) => day.items.map((item) => changelogKey(day.date, item)))
  if (!state.changelog) {
    state.changelog = all
    return 0
  }
  const seen = new Set(state.changelog)
  // Старые дни сначала, не больше двух постов за запуск.
  const days = CHANGELOG.map((day) => ({ ...day, items: day.items.filter((item) => !seen.has(changelogKey(day.date, item))) }))
    .filter((day) => day.items.length)
    .reverse()
    .slice(0, 2)
  for (const day of days) {
    await post({ text: changelogPost(day), buttons: [[['Что нового', `${SITE}/changelog`]]] })
    for (const item of day.items) seen.add(changelogKey(day.date, item))
    await pause(1500)
  }
  // Храним только ключи, которые ещё есть в списке обновлений.
  state.changelog = all.filter((key) => seen.has(key))
  return days.length
}

// ——— Запуск ———

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }))
}

async function main() {
  if (!CHANNEL) {
    console.log('::notice::Канал не задан (TELEGRAM_CHANNEL), автоновости выключены.')
    return
  }
  TOKEN = await botToken()
  if (!TOKEN && !DRY_RUN) {
    console.log('::notice::Нет токена бота: добавьте секрет TELEGRAM_BOT_TOKEN.')
    return
  }
  const state = readState()
  const first = !state.updatedAt
  if (first) console.log('Первый запуск: запоминаем текущие серии и обновления, ничего не публикуем.')
  else if (!DRY_RUN) await bot('getChat', { chat_id: CHANNEL })

  // Каждая часть сохраняет состояние сразу: ошибка в одной не повторит посты другой.
  const parts = { episodes, season, changelog }
  let failed = false
  for (const [name, run] of Object.entries(parts)) {
    try {
      if (first && name === 'season') {
        const s = upcomingSeason()
        state.seasons = s.days <= SEASON_LEAD_DAYS ? [s.key] : []
        continue
      }
      const count = await run(state)
      console.log(`${name}: ${count ? `опубликовано ${count}` : 'нового нет'}`)
    } catch (e) {
      failed = true
      console.error(`${name}: ${e.message}`)
    }
    saveState(state)
  }
  await closeCards()
  if (failed) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
