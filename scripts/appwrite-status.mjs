// Только читает: показывает все функции Appwrite, их состояние, активную сборку, расписание и последние ошибки.
// Значения переменных и ключ не печатаются, только имена переменных.
// Запуск: APPWRITE_API_KEY=... node scripts/appwrite-status.mjs
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const KEY = process.env.APPWRITE_API_KEY
if (!KEY) {
  console.error('Запуск: APPWRITE_API_KEY=... node scripts/appwrite-status.mjs')
  process.exit(1)
}
const headers = { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY }
const get = async (path) => {
  const res = await fetch(ENDPOINT + path, { headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json.type ?? ''} ${json.message ?? ''}`)
  return json
}
const q = (...qs) => qs.map((x) => `queries[]=${encodeURIComponent(JSON.stringify(x))}`).join('&')

const { functions } = await get('/functions?' + q({ method: 'limit', values: [100] }))
console.log(`Функций: ${functions.length}`)
let bad = 0
for (const f of functions) {
  console.log(`\n=== ${f.$id} (${f.name}) runtime=${f.runtime} enabled=${f.enabled} live=${f.live}`)
  console.log(`schedule="${f.schedule}" timeout=${f.timeout} execute=${JSON.stringify(f.execute)} scopes=${(f.scopes ?? []).length}`)
  console.log(`vars: ${(f.vars ?? []).map((v) => v.key).join(', ') || '—'}`)
  if (!f.enabled) bad++
  if (!f.deploymentId) {
    console.log('!! нет активной сборки')
    bad++
  } else {
    try {
      const d = await get(`/functions/${f.$id}/deployments/${f.deploymentId}`)
      console.log(`активная сборка ${d.$id} status=${d.status} создана ${d.$createdAt}`)
      if (d.status !== 'ready') bad++
    } catch (e) {
      console.log(`!! сборка: ${e.message}`)
      bad++
    }
  }
  try {
    const { executions, total } = await get(
      `/functions/${f.$id}/executions?` + q({ method: 'orderDesc', attribute: '$createdAt' }, { method: 'limit', values: [50] }),
    )
    const fails = executions.filter((e) => e.status === 'failed' || e.responseStatusCode >= 500)
    console.log(`запусков всего ${total}; из последних ${executions.length} упало ${fails.length}; последний ${executions[0]?.$createdAt ?? '—'}`)
    const byTrigger = {}
    for (const e of executions) byTrigger[e.trigger] = (byTrigger[e.trigger] ?? 0) + 1
    console.log(`по триггерам: ${JSON.stringify(byTrigger)}`)
    for (const e of fails.slice(0, 5)) {
      console.log(`  ✗ ${e.$createdAt} ${e.trigger} ${e.status} ${e.responseStatusCode} ${(e.errors || e.logs || '').replace(/\s+/g, ' ').slice(0, 300)}`)
    }
  } catch (e) {
    console.log(`!! запуски: ${e.message}`)
  }
  // Запуски по расписанию теряются среди сотен запусков из сайта, поэтому их смотрим отдельно:
  // у community по расписанию уходят уведомления о новых сериях и чистятся комнаты.
  try {
    const { executions } = await get(
      `/functions/${f.$id}/executions?` +
        q({ method: 'equal', attribute: 'trigger', values: ['schedule'] }, { method: 'orderDesc', attribute: '$createdAt' }, { method: 'limit', values: [3] }),
    )
    if (!executions.length) console.log('по расписанию: запусков нет')
    for (const e of executions) {
      console.log(`по расписанию: ${e.$createdAt} ${e.status} ${e.responseStatusCode} ${(e.responseBody || e.errors || '').replace(/\s+/g, ' ').slice(0, 200)}`)
    }
    const last = executions[0] && Date.parse(executions[0].$createdAt)
    if (f.$id === 'community' && (!last || Date.now() - last > 2 * 3600_000)) {
      console.log('!! community давно не запускалась по расписанию: уведомления о сериях не уходят')
      bad++
    }
  } catch (e) {
    console.log(`!! запуски по расписанию: ${e.message}`)
  }
}
console.log(`\nПроблем: ${bad}`)
