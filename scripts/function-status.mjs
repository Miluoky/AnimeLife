// Проверяет выложенную функцию Appwrite: настройки, тестовый вызов и ошибки последних вызовов. Ключи не печатает.
// Запуск: APPWRITE_API_KEY=... node scripts/function-status.mjs community
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const KEY = process.env.APPWRITE_API_KEY
const id = process.argv[2]

if (!KEY || !/^[a-z-]+$/.test(id ?? '')) {
  console.error('Запуск: APPWRITE_API_KEY=... node scripts/function-status.mjs <id функции>')
  process.exit(1)
}

const headers = { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY, 'Content-Type': 'application/json' }
const get = async (path) => {
  const res = await fetch(`${ENDPOINT}${path}`, { headers })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}

const fn = await get(`/functions/${id}`)
if (fn.status !== 200) {
  console.error(`Функция ${id}: ${fn.status} ${fn.json.message ?? ''}`)
  process.exit(1)
}
const f = fn.json
console.log(`Функция ${id}: enabled=${f.enabled} live=${f.live} runtime=${f.runtime} specification=${f.specification} timeout=${f.timeout} entrypoint=${f.entrypoint} commands=${JSON.stringify(f.commands)} deployment=${f.deploymentId ?? f.deployment}`)
console.log(`Переменные: ${(f.vars ?? []).map((v) => v.key).join(', ') || 'нет'}`)

const dep = await get(`/functions/${id}/deployments/${f.deploymentId ?? f.deployment}`)
const d = dep.json
console.log(`Сборка: status=${d.status} size=${d.sourceSize ?? d.size} buildSize=${d.buildSize} buildDuration=${d.buildDuration ?? d.buildTime}`)
if (d.buildLogs) console.log(`Журнал сборки (конец):\n${String(d.buildLogs).slice(-1500)}`)

const ex = await fetch(`${ENDPOINT}/functions/${id}/executions`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ body: JSON.stringify({ action: 'ping' }), async: false }),
}).then((r) => r.json())
console.log(`Тестовый вызов: status=${ex.status} code=${ex.responseStatusCode} duration=${ex.duration}`)
console.log(`errors: ${String(ex.errors ?? '').slice(-1500)}`)
console.log(`logs: ${String(ex.logs ?? '').slice(-800)}`)

const list = await get(`/functions/${id}/executions?queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [5] }))}`)
for (const e of list.json.executions ?? []) {
  console.log(`${e.$createdAt} ${e.status} ${e.responseStatusCode} ${String(e.errors ?? '').slice(-300).replace(/\s+/g, ' ')}`)
}
