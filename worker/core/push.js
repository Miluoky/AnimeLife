/**
 * Web Push и Telegram о новых сериях (бывший push в Appwrite Function community).
 */

import webpush from 'web-push'
import { err, json } from './auth.js'
import { sha256Hex } from './crypto.js'

const SHIKIMORI = 'https://shikimori.io'
const FRESH_WINDOW = 3 * 60 * 60 * 1000
const BOT_USERNAME = 'AnimeLifeAuth_bot'
const DEFAULT_SITE = 'https://animelife.top/'
export const TG_PREFIX = 'tg:'

const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/]
const SITES = [
  /^https:\/\/([a-z0-9-]+\.)?anime-night\.pages\.dev\/$/,
  /^https?:\/\/maintech67\.me\/Anime\/$/,
  /^https:\/\/(www\.)?animelife\.top\/$/,
  /^https:\/\/anime\.artemdrr61f9\.workers\.dev\/$/,
  /^http:\/\/localhost:\d+\/$/,
]

const PUSH_ACTIONS = new Set([
  'push-subscribe',
  'push-unsubscribe',
  'tg-status',
  'tg-subscribe',
  'tg-unsubscribe',
])

export const telegramReady = (env) => Boolean(env?.TELEGRAM_BOT_TOKEN)
const vapidReady = (env) => Boolean(env?.VAPID_PUBLIC_KEY && env?.VAPID_PRIVATE_KEY)

async function shortHash(text) {
  return (await sha256Hex(text)).slice(0, 32)
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const publicSite = (site) => (String(site ?? '').startsWith('https://') ? site : DEFAULT_SITE)

function parseAnimeIds(raw) {
  return [...new Set((raw ?? []).map(String).filter((id) => /^\d{1,10}$/.test(id)))].slice(0, 200)
}

function rowToSub(row) {
  let keys = {}
  try {
    keys = JSON.parse(row.data || '{}')
  } catch {
    keys = {}
  }
  let animeIds = []
  try {
    animeIds = JSON.parse(row.anime_ids || '[]')
  } catch {
    animeIds = []
  }
  return {
    id: row.id,
    endpoint: row.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userId: row.user_id,
    animeIds,
    site: row.site || '',
  }
}

async function upsertSub(env, row) {
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO push_subs (id, user_id, endpoint, data, anime_ids, site, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       data = excluded.data,
       anime_ids = excluded.anime_ids,
       site = excluded.site`,
  )
    .bind(row.id, row.user_id, row.endpoint, row.data, row.anime_ids, row.site, row.created_at ?? now)
    .run()
}

async function bot(env, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, ok: data.ok === true, description: data.description ?? '' }
}

function telegramUser(session) {
  if (!session?.user?.$id) return null
  const match = /^tg_(\d{1,20})$/.exec(session.user.$id)
  if (!match) return null
  return { userId: session.user.$id, chatId: match[1] }
}

export async function handlePushAction(env, session, body) {
  const action = body.action
  if (!PUSH_ACTIONS.has(action)) return null

  if (action === 'push-subscribe') {
    const sub = body.subscription ?? {}
    let host
    try {
      host = new URL(sub.endpoint).hostname
    } catch {
      return err('Браузер прислал неверную подписку.', 400)
    }
    if (!sub.endpoint?.startsWith('https://') || !PUSH_HOSTS.some((re) => re.test(host))) {
      return err('Этот браузер не поддерживается.', 400)
    }
    if (!sub.keys?.p256dh || !sub.keys?.auth) return err('Браузер прислал неверную подписку.', 400)
    const site = String(body.site ?? '')
    if (!SITES.some((re) => re.test(site))) return err('Неизвестный адрес сайта.', 400)
    const animeIds = parseAnimeIds(body.animeIds)
    const id = `p${await shortHash(sub.endpoint)}`
    const data = JSON.stringify({
      p256dh: String(sub.keys.p256dh).slice(0, 200),
      auth: String(sub.keys.auth).slice(0, 100),
    })
    await upsertSub(env, {
      id,
      user_id: session?.user?.$id ?? null,
      endpoint: String(sub.endpoint).slice(0, 1000),
      data,
      anime_ids: JSON.stringify(animeIds),
      site,
    })
    return json({ ok: true, count: animeIds.length })
  }

  if (action === 'push-unsubscribe') {
    if (typeof body.endpoint !== 'string') return err('Нет подписки.', 400)
    const id = `p${await shortHash(body.endpoint)}`
    await env.DB.prepare('DELETE FROM push_subs WHERE id = ? OR endpoint = ?').bind(id, body.endpoint).run()
    return json({ ok: true })
  }

  if (action === 'tg-status') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const tg = telegramUser(session)
    if (!tg) return err('Уведомления в Telegram доступны аккаунтам, вошедшим через Telegram.', 400)
    const id = `t${await shortHash(tg.userId)}`
    const row = await env.DB.prepare('SELECT * FROM push_subs WHERE id = ?').bind(id).first()
    const on = !!row
    let weekly = false
    if (on) {
      try {
        const keys = JSON.parse(row.data || '{}')
        weekly = keys.auth === 'weekly'
      } catch {
        weekly = false
      }
    }
    return json({ configured: telegramReady(env), on, weekly: on && weekly })
  }

  if (action === 'tg-subscribe') {
    if (!telegramReady(env)) return err('Уведомления в Telegram ещё не настроены.', 400)
    if (!session) return err('Войдите в аккаунт.', 401)
    const tg = telegramUser(session)
    if (!tg) return err('Уведомления в Telegram доступны аккаунтам, вошедшим через Telegram.', 400)
    const site = String(body.site ?? '')
    if (!SITES.some((re) => re.test(site))) return err('Неизвестный адрес сайта.', 400)
    const animeIds = parseAnimeIds(body.animeIds)
    const id = `t${await shortHash(tg.userId)}`
    const existing = await env.DB.prepare('SELECT * FROM push_subs WHERE id = ?').bind(id).first()
    let weeklyFlag = '-'
    if (body.weekly === true) weeklyFlag = 'weekly'
    else if (body.weekly === false) weeklyFlag = '-'
    else if (existing) {
      try {
        weeklyFlag = JSON.parse(existing.data || '{}').auth === 'weekly' ? 'weekly' : '-'
      } catch {
        weeklyFlag = '-'
      }
    }
    if (!existing) {
      const sent = await bot(env, 'sendMessage', {
        chat_id: tg.chatId,
        text:
          '🔔 Уведомления о новых сериях включены.\n\nНапишу сюда, когда выйдет серия тайтла из вашего списка «Смотрю» ' +
          'или из тех, где вы нажали колокольчик. Выключить можно в профиле на сайте.',
        reply_markup: { inline_keyboard: [[{ text: 'Настройки', url: `${publicSite(site)}account` }]] },
      })
      if (!sent.ok) {
        return err(
          `Бот не может вам написать. Откройте @${BOT_USERNAME} в Telegram, нажмите «Запустить» и попробуйте ещё раз.`,
          400,
        )
      }
    }
    await upsertSub(env, {
      id,
      user_id: tg.userId,
      endpoint: `${TG_PREFIX}${tg.chatId}`,
      data: JSON.stringify({ p256dh: '-', auth: weeklyFlag }),
      anime_ids: JSON.stringify(animeIds),
      site,
    })
    return json({ ok: true, count: animeIds.length })
  }

  if (action === 'tg-unsubscribe') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const tg = telegramUser(session)
    if (!tg) return err('Уведомления в Telegram доступны аккаунтам, вошедшим через Telegram.', 400)
    const id = `t${await shortHash(tg.userId)}`
    await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(id).run()
    return json({ ok: true })
  }

  return null
}

async function allSubscriptions(env) {
  const out = []
  let offset = 0
  for (;;) {
    const page = await env.DB.prepare('SELECT * FROM push_subs ORDER BY id LIMIT 100 OFFSET ?').bind(offset).all()
    const rows = page.results ?? []
    out.push(...rows.map(rowToSub))
    if (rows.length < 100) return out
    offset += 100
  }
}

async function shikimoriCalendar() {
  const res = await fetch(`${SHIKIMORI}/api/calendar`, {
    headers: { Accept: 'application/json', 'User-Agent': 'AnimeLife notifier' },
  })
  if (!res.ok) throw new Error(`Shikimori calendar ${res.status}`)
  return res.json()
}

async function freshEpisodes() {
  const now = Date.now()
  return (await shikimoriCalendar()).filter((e) => {
    const at = Date.parse(e.next_episode_at)
    return at <= now && at > now - FRESH_WINDOW
  })
}

async function sentExists(env, sentId) {
  const row = await env.DB.prepare('SELECT id FROM sent WHERE id = ?').bind(sentId).first()
  return !!row
}

async function markSent(env, sentId) {
  await env.DB.prepare('INSERT OR IGNORE INTO sent (id, created_at) VALUES (?, ?)').bind(sentId, Date.now()).run()
}

async function deleteSub(env, subId) {
  await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(subId).run()
}

export async function tgSendEpisode(env, sub, e) {
  const chatId = sub.endpoint.slice(TG_PREFIX.length)
  const title = e.anime.russian || e.anime.name
  const res = await bot(env, 'sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: `🎬 <b>Новая серия: ${escapeHtml(title)}</b>\nВышла ${Number(e.next_episode)}-я серия.`,
    reply_markup: {
      inline_keyboard: [[{ text: '▶️ Смотреть', url: `${publicSite(sub.site)}watch/${e.anime.id}/${e.next_episode}` }]],
    },
  })
  if (res.ok) return 'sent'
  if (res.status === 403 || /chat not found/i.test(res.description)) return 'gone'
  return 'failed'
}

function ensureVapid(env) {
  if (!vapidReady(env)) return false
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:noreply@animelife.top',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  )
  return true
}

/** Рассылка о новых сериях (cron). Мягко пропускает ветки без VAPID / Telegram. */
export async function notifyEpisodes(env, log = console.log) {
  let due
  try {
    due = await freshEpisodes()
  } catch (e) {
    log(`calendar ${e}`)
    return { due: 0, sent: 0, skipped: 'calendar' }
  }
  if (!due.length) return { due: 0, sent: 0 }

  const useWebPush = ensureVapid(env)
  const useTelegram = telegramReady(env)
  if (!useWebPush && !useTelegram) return { due: due.length, sent: 0, skipped: 'notify' }

  let sent = 0
  for (const sub of await allSubscriptions(env)) {
    const mine = due.filter((e) => sub.animeIds?.includes(String(e.anime.id)))
    if (!mine.length) continue

    if (sub.endpoint.startsWith(TG_PREFIX)) {
      if (!useTelegram) continue
      for (const e of mine) {
        const sentId = `s${await shortHash(`${sub.id}:${e.anime.id}:${e.next_episode}`)}`
        if (await sentExists(env, sentId)) continue
        const result = await tgSendEpisode(env, sub, e)
        if (result === 'sent') {
          await markSent(env, sentId)
          sent++
        } else if (result === 'failed') {
          log(`telegram failed for ${sub.id}`)
        } else if (result === 'gone') {
          await deleteSub(env, sub.id)
          break
        }
      }
      continue
    }

    if (!useWebPush || !sub.p256dh || !sub.auth || sub.p256dh === '-') continue
    for (const e of mine) {
      const sentId = `s${await shortHash(`${sub.id}:${e.anime.id}:${e.next_episode}`)}`
      if (await sentExists(env, sentId)) continue
      const title = e.anime.russian || e.anime.name
      const payload = JSON.stringify({
        title: `Новая серия: ${title}`,
        body: `Вышла ${e.next_episode}-я серия. Тайтл в вашем списке «Смотрю».`,
        url: `${sub.site}watch/${e.anime.id}/${e.next_episode}`,
        tag: `anime-${e.anime.id}`,
      })
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 6 * 3600 },
        )
        await markSent(env, sentId)
        sent++
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await deleteSub(env, sub.id)
          break
        }
        log(`push ${err.statusCode ?? ''} ${err.message}`)
      }
    }
  }
  return { due: due.length, sent }
}

function weekKey(t = Date.now()) {
  const d = new Date(t)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const week = Math.ceil(((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
  return date.getUTCFullYear() * 100 + week
}

function weekArrivalsFrom(calendar, animeIds, now = Date.now()) {
  const want = new Set((animeIds ?? []).map(String))
  if (!want.size) return []
  const WEEK = 7 * 24 * 60 * 60 * 1000
  return calendar
    .filter((e) => {
      const at = Date.parse(e.next_episode_at)
      return want.has(String(e.anime?.id)) && at <= now && at > now - WEEK
    })
    .map((e) => ({
      id: String(e.anime.id),
      title: e.anime.russian || e.anime.name,
      ep: Number(e.next_episode),
      aired: Number(e.anime.episodes_aired ?? e.next_episode ?? 0),
    }))
}

async function loadUserList(env, userId) {
  if (!userId) return []
  const row = await env.DB.prepare('SELECT data FROM lists WHERE user_id = ?').bind(userId).first()
  if (!row) return []
  try {
    const data = JSON.parse(String(row.data ?? '[]'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function digestFromList(list, arrivals) {
  const airedById = new Map(arrivals.map((a) => [a.id, a.aired]))
  const behind = []
  const doneTitles = []
  for (const entry of list) {
    const id = String(entry?.anime?.id ?? '')
    if (!id) continue
    const title = entry.anime.title || entry.anime.name || id
    const watched = Number(entry.watched ?? 0)
    const aired = Math.max(
      airedById.get(id) ?? 0,
      Number(entry.anime.episodesAired ?? entry.anime.episodes_aired ?? 0),
    )
    if (entry.status === 'watching' && aired > watched) {
      behind.push({ id, title, left: aired - watched, nextEp: watched + 1 })
    }
    if (entry.status === 'completed' && title) doneTitles.push(title)
  }
  behind.sort((a, b) => b.left - a.left)
  return { behind, doneTitles: doneTitles.slice(0, 2) }
}

function titlesInList(n) {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  const word = abs > 10 && abs < 20 ? 'тайтлов' : last === 1 ? 'тайтл' : last >= 2 && last <= 4 ? 'тайтла' : 'тайтлов'
  return `${n} ${word}`
}

function seriesWord(n) {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  return abs > 10 && abs < 20 ? 'серий' : last === 1 ? 'серия' : last >= 2 && last <= 4 ? 'серии' : 'серий'
}

function weeklyDigestText(sub, digest = {}) {
  const site = publicSite(sub.site)
  const count = Array.isArray(sub.animeIds) ? sub.animeIds.length : 0
  const arrivals = Array.isArray(digest.arrivals) ? digest.arrivals.slice(0, 8) : []
  const behind = Array.isArray(digest.behind) ? digest.behind.slice(0, 6) : []
  const done = Array.isArray(digest.doneTitles) ? digest.doneTitles.filter(Boolean).slice(0, 2) : []
  const lines = [`📅 <b>Сводка «Смотрю» за неделю</b>`, count ? `В подписке ${titlesInList(count)}.` : 'Список «Смотрю» пока пуст.']

  lines.push('', '<b>Новые серии</b>')
  if (arrivals.length) {
    for (const a of arrivals) {
      const title = escapeHtml(a.title)
      lines.push(`· <a href="${site}watch/${a.id}/${a.ep}">${title}</a> — ${a.ep}-я`)
    }
  } else {
    lines.push('За семь дней новых серий в подписке не выходило.')
  }

  lines.push('', '<b>Не досмотрено</b>')
  if (behind.length) {
    for (const b of behind) {
      const title = escapeHtml(b.title)
      const ep = Math.max(1, Number(b.nextEp) || 1)
      lines.push(`· <a href="${site}watch/${b.id}/${ep}">${title}</a> — ${b.left} ${seriesWord(b.left)}`)
    }
  } else {
    lines.push(count ? 'Всё вышедшее из подписки уже отмечено.' : 'Добавьте тайтлы в «Смотрю» на сайте.')
  }

  if (done.length) {
    lines.push(
      '',
      '<b>Если понравилось</b>',
      `Недавно досмотрели ${done.map((t) => `«${escapeHtml(t)}»`).join(' и ')}. На сайте в «Смотрю» — похожее.`,
    )
  }

  return lines.join('\n')
}

async function tgSendWeekly(env, sub, digest) {
  const chatId = sub.endpoint.slice(TG_PREFIX.length)
  const res = await bot(env, 'sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text: weeklyDigestText(sub, digest),
    reply_markup: { inline_keyboard: [[{ text: 'Открыть «Смотрю»', url: `${publicSite(sub.site)}library?tab=new` }]] },
  })
  if (res.ok) return 'sent'
  if (res.status === 403 || /chat not found/i.test(res.description)) return 'gone'
  return 'failed'
}

/** Воскресная сводка в Telegram (07:00–09:00 UTC). */
export async function notifyWeeklyDigests(env, log = console.log) {
  const now = new Date()
  if (now.getUTCDay() !== 0 || now.getUTCHours() < 7 || now.getUTCHours() >= 9) return { skipped: true }
  if (!telegramReady(env)) return { skipped: true, reason: 'telegram' }
  let calendar = []
  try {
    calendar = await shikimoriCalendar()
  } catch (e) {
    log(`weekly calendar ${e}`)
    return { skipped: true, error: 'calendar' }
  }
  let sent = 0
  let failed = 0
  for (const sub of await allSubscriptions(env)) {
    try {
      if (!String(sub.endpoint ?? '').startsWith(TG_PREFIX) || sub.auth !== 'weekly') continue
      const sentId = `w${await shortHash(`${sub.id}:${weekKey(now.getTime())}`)}`
      if (await sentExists(env, sentId)) continue
      const arrivals = weekArrivalsFrom(calendar, sub.animeIds, now.getTime())
      const list = await loadUserList(env, sub.userId)
      const { behind, doneTitles } = digestFromList(list, arrivals)
      const result = await tgSendWeekly(env, sub, { arrivals, behind, doneTitles })
      if (result === 'sent') {
        await markSent(env, sentId)
        sent++
      } else if (result === 'gone') {
        await deleteSub(env, sub.id)
      } else {
        failed++
        log(`weekly telegram failed for ${sub.id}`)
      }
    } catch (e) {
      failed++
      log(`weekly digest ${e}`)
    }
  }
  return { sent, failed }
}
