import { DB, UserError, hash } from './util.js'

/**
 * Уведомления о новых сериях в Telegram, через того же бота, которым входят на сайт (@AnimeLifeAuth_bot).
 *   tg-status                      включены ли уведомления у вошедшего через Telegram пользователя;
 *   tg-subscribe {animeIds, site, weekly?}  включить или обновить список тайтлов (бот пишет «Уведомления включены» в первый раз);
 *   tg-unsubscribe                 выключить.
 * У строк Telegram поле auth не ключ пуша, а флаг сводки: «weekly» или «-». Браузерные подписки это поле не трогают.
 * Воскресное напоминание читает auth === 'weekly' и не входит в рассылку отдельных серий.
 * Подписка лежит в той же таблице push, что и браузерные: ID строки t<хеш ID пользователя>,
 * endpoint = tg:<ID чата>. Писать боту можно только тем, кто сам открыл его, а вошедшие через Telegram
 * уже нажимали в нём Start, поэтому уведомления доступны аккаунтам tg_<ID>.
 * Переменная функции: TELEGRAM_BOT_TOKEN (секрет). Без неё уведомления в Telegram выключены.
 */

const BOT_USERNAME = 'AnimeLifeAuth_bot'
const DEFAULT_SITE = 'https://animelife.top/'

export const TG_PREFIX = 'tg:'
export const telegramReady = () => Boolean(process.env.TELEGRAM_BOT_TOKEN)

export async function bot(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ok: json.ok === true, description: json.description ?? '' }
}

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Кнопки-ссылки в Telegram принимают только https, поэтому для localhost ведём на основной сайт. */
const publicSite = (site) => (String(site ?? '').startsWith('https://') ? site : DEFAULT_SITE)

async function telegramUser(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  const match = /^tg_(\d{1,20})$/.exec(user.json.$id)
  if (!match) throw new UserError('Уведомления в Telegram доступны аккаунтам, вошедшим через Telegram.')
  return { userId: user.json.$id, chatId: match[1] }
}

const rowId = (userId) => 't' + hash(userId)

export async function tgStatus(api, req) {
  const { userId } = await telegramUser(api, req)
  const row = await api('GET', `${DB}/push/rows/${rowId(userId)}`)
  const on = row.status !== 404
  return { configured: telegramReady(), on, weekly: on && row.json?.auth === 'weekly' }
}

export async function tgSubscribe(api, req, body, sites) {
  if (!telegramReady()) throw new UserError('Уведомления в Telegram ещё не настроены.')
  const { userId, chatId } = await telegramUser(api, req)
  const site = String(body.site ?? '')
  if (!sites.some((re) => re.test(site))) throw new UserError('Неизвестный адрес сайта.')
  const animeIds = [...new Set((body.animeIds ?? []).map(String).filter((id) => /^\d{1,10}$/.test(id)))].slice(0, 200)
  const id = rowId(userId)
  const existing = await api('GET', `${DB}/push/rows/${id}`)
  // Явный true/false с сайта. Старый клиент поле не шлёт — не сбрасываем уже включённую сводку.
  const auth = body.weekly === true ? 'weekly' : body.weekly === false ? '-' : existing.status !== 404 && existing.json?.auth === 'weekly' ? 'weekly' : '-'
  if (existing.status === 404) {
    // Первое включение: заодно проверяем, что бот может писать в этот чат.
    const sent = await bot('sendMessage', {
      chat_id: chatId,
      text:
        '🔔 Уведомления о новых сериях включены.\n\nНапишу сюда, когда выйдет серия тайтла из вашего списка «Смотрю» ' +
        'или из тех, где вы нажали колокольчик. Выключить можно в профиле на сайте.',
      reply_markup: { inline_keyboard: [[{ text: 'Настройки', url: `${publicSite(site)}account` }]] },
    })
    if (!sent.ok) {
      throw new UserError(`Бот не может вам написать. Откройте @${BOT_USERNAME} в Telegram, нажмите «Запустить» и попробуйте ещё раз.`)
    }
  }
  await api('PUT', `${DB}/push/rows/${id}`, {
    data: { endpoint: `${TG_PREFIX}${chatId}`, p256dh: '-', auth, userId, animeIds, site },
  })
  return { ok: true, count: animeIds.length }
}

export async function tgUnsubscribe(api, req) {
  const { userId } = await telegramUser(api, req)
  await api('DELETE', `${DB}/push/rows/${rowId(userId)}`)
  return { ok: true }
}

/**
 * Отправляет уведомление о серии. Возвращает 'sent', 'gone' (пользователь заблокировал бота или удалил чат,
 * подписку надо удалить) или 'failed'.
 */
export async function tgSendEpisode(sub, e) {
  const chatId = sub.endpoint.slice(TG_PREFIX.length)
  const title = e.anime.russian || e.anime.name
  const res = await bot('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: `🎬 <b>Новая серия: ${escapeHtml(title)}</b>\nВышла ${Number(e.next_episode)}-я серия.`,
    reply_markup: { inline_keyboard: [[{ text: '▶️ Смотреть', url: `${publicSite(sub.site)}watch/${e.anime.id}/${e.next_episode}` }]] },
  })
  if (res.ok) return 'sent'
  if (res.status === 403 || /chat not found/i.test(res.description)) return 'gone'
  return 'failed'
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

/**
 * Текст воскресной сводки: новые серии из календаря, недосмотренное по списку аккаунта, намёк на рекомендации.
 * digest.arrivals — [{ id, title, ep }], digest.behind — [{ id, title, left }], digest.doneTitles — названия досмотренных.
 */
export function weeklyDigestText(sub, digest = {}) {
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

/** Воскресная сводка с конкретными сериями (см. weeklyDigestText). */
export async function tgSendWeekly(sub, digest) {
  const chatId = sub.endpoint.slice(TG_PREFIX.length)
  const res = await bot('sendMessage', {
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
