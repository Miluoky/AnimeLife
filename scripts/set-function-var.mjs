// Записывает секретную переменную функции Appwrite (создаёт или обновляет). Значение берётся из окружения
// VAR_VALUE; если оно пустое, а указан --from <функция>, пробуем взять ту же переменную у другой функции
// (получится, только если там она не помечена секретом). Нет значения: ничего не меняем и выходим без ошибки.
// Запуск: APPWRITE_API_KEY=... VAR_VALUE=... node scripts/set-function-var.mjs community TELEGRAM_BOT_TOKEN [--from social-login]
// Переменная начинает действовать со следующей сборки функции, поэтому скрипт запускают перед deploy-function.mjs.
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const KEY = process.env.APPWRITE_API_KEY
const [id, name, flag, from] = process.argv.slice(2)

if (!KEY || !/^[a-z-]+$/.test(id ?? '') || !/^[A-Z0-9_]+$/.test(name ?? '')) {
  console.error('Запуск: APPWRITE_API_KEY=... VAR_VALUE=... node scripts/set-function-var.mjs <функция> <ПЕРЕМЕННАЯ> [--from <функция>]')
  process.exit(1)
}

async function api(method, path, body) {
  const res = await fetch(ENDPOINT + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY },
    body: body && JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status >= 300) throw new Error(`${method} ${path}: ${res.status} ${json.message ?? ''}`)
  return json
}

const findVar = async (fn) => ((await api('GET', `/functions/${fn}/variables`)).variables ?? []).find((v) => v.key === name)

let value = process.env.VAR_VALUE ?? ''
if (!value && flag === '--from' && /^[a-z-]+$/.test(from ?? '')) {
  const other = await findVar(from).catch(() => undefined)
  value = other?.value ?? ''
  if (value) console.log(`${name}: взяли значение у функции ${from}.`)
}
if (!value) {
  console.log(`::notice::${name} не задан, переменная функции ${id} не изменена.`)
  process.exit(0)
}

const existing = await findVar(id)
const body = { key: name, value, secret: true }
if (existing) await api('PUT', `/functions/${id}/variables/${existing.$id}`, body)
// Новый API Appwrite требует свой ID переменной: берём имя в нижнем регистре.
else await api('POST', `/functions/${id}/variables`, { variableId: name.toLowerCase(), ...body })
console.log(`${name}: записана в функцию ${id}.`)
