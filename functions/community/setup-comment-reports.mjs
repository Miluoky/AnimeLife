// Добавляет в таблицу comments колонки для жалоб и модерации: reports (сколько жалоб) и moderated (модератор
// уже проверил, повторные жалобы комментарий не прячут). Сами жалобы лежат в votes, как у отзывов.
// Запуск: APPWRITE_API_KEY=... node functions/community/setup-comment-reports.mjs
// Ключу нужны права tables.read, columns.read и columns.write. Повторный запуск ничего не ломает.

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const KEY = process.env.APPWRITE_API_KEY

if (!KEY) {
  console.error('Задайте APPWRITE_API_KEY.')
  process.exit(1)
}

async function api(method, path, body) {
  const res = await fetch(ENDPOINT + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
    body: body && JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status >= 300 && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${json.message ?? ''}`)
  return { status: res.status, json }
}

const tablePath = '/tablesdb/anime/tables/comments'

const COLUMNS = [
  ['integer', { key: 'reports', required: false, default: 0, min: 0 }],
  ['boolean', { key: 'moderated', required: false, default: false }],
]

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  for (const [type, body] of COLUMNS) {
    const existing = await api('GET', `${tablePath}/columns/${body.key}`)
    if (existing.status !== 404) {
      console.log(`колонка ${body.key}: уже есть`)
      continue
    }
    await api('POST', `${tablePath}/columns/${type}`, body)
    console.log(`колонка ${body.key}: создана (${type})`)
  }
  for (let i = 0; ; i++) {
    const { json } = await api('GET', `${tablePath}/columns`)
    const pending = (json.columns ?? []).filter((c) => c.status !== 'available')
    if (!pending.length) break
    if (pending.some((c) => c.status === 'failed')) throw new Error(`Колонки не создались: ${pending.map((c) => c.key).join(', ')}`)
    if (i > 60) throw new Error('Колонки создаются слишком долго, запустите ещё раз позже.')
    await pause(1000)
  }
  console.log('Готово.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
