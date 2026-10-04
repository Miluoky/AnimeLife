import { createHash } from 'node:crypto'

/** Общие мелочи функции: путь к таблицам, ошибка для пользователя, запросы фильтров, капча. */
export const DB = '/tablesdb/anime/tables'

/** Ошибка, текст которой можно показать на сайте как есть. */
export class UserError extends Error {}

export const query = (q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`

export const listRows = async (api, table, queries) =>
  (await api('GET', `${DB}/${table}/rows?${queries.map(query).join('&')}`)).json.rows ?? []

export const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 32)

/** Проверка Cloudflare Turnstile: включается, когда задан TURNSTILE_SECRET. */
export async function checkCaptcha(req, token) {
  const secret = process.env.TURNSTILE_SECRET
  if (!secret) return
  if (!token) throw new UserError('Подтвердите, что вы не робот.')
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: String(token) }),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.success) throw new UserError('Проверка на робота не прошла. Попробуйте ещё раз.')
}
