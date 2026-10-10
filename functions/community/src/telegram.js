import { DB, UserError, hash } from './util.js'

/**
 * Уведомления о новых сериях в Telegram, через того же бота, которым входят на сайт (@AnimeLifeAuth_bot).
 *   tg-status                      включены ли уведомления у вошедшего через Telegram пользователя;
 *   tg-subscribe {animeIds, site}  включить или обновить список тайтлов (бот пишет «Уведомления включены» в первый раз);
 *   tg-unsubscribe                 выключить.
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
  return { configured: telegramReady(), on: row.status !== 404 }
}

export async function tgSubscribe(api, req, body, sites) {
  if (!telegramReady()) throw new UserError('Уведомления в Telegram ещё не настроены.')
  const { userId, chatId } = await telegramUser(api, req)
  const site = String(body.site ?? '')
  if (!sites.some((re) => re.test(site))) throw new UserError('Неизвестный адрес сайта.')
  const animeIds = [...new Set((body.animeIds ?? []).map(String).filter((id) => /^\d{1,10}$/.test(id)))].slice(0, 200)
  const id = rowId(userId)
  const existing = await api('GET', `${DB}/push/rows/${id}`)
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
    data: { endpoint: `${TG_PREFIX}${chatId}`, p256dh: '-', auth: '-', userId, animeIds, site },
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
