/** Общие мелочи функции: путь к таблицам, ошибка для пользователя, запросы фильтров. */
export const DB = '/tablesdb/anime/tables'

/** Ошибка, текст которой можно показать на сайте как есть. */
export class UserError extends Error {}

export const query = (q) => `queries[]=${encodeURIComponent(JSON.stringify(q))}`

export const listRows = async (api, table, queries) =>
  (await api('GET', `${DB}/${table}/rows?${queries.map(query).join('&')}`)).json.rows ?? []
