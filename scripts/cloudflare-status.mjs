// Только читает: вызовы Worker за последние дни (лимит бесплатного плана 100 000 в сутки) и ответы WAF за сутки
// по правилам и действиям для зоны animelife.top. Ничего не меняет, ключ не печатается.
// Запуск: CLOUDFLARE_EMAIL=... CLOUDFLARE_API_KEY=... node scripts/cloudflare-status.mjs
const EMAIL = process.env.CLOUDFLARE_EMAIL
const KEY = process.env.CLOUDFLARE_API_KEY
if (!EMAIL || !KEY) {
  console.error('Запуск: CLOUDFLARE_EMAIL=... CLOUDFLARE_API_KEY=... node scripts/cloudflare-status.mjs')
  process.exit(1)
}
const ZONE = 'animelife.top'
const SCRIPT = 'anime'
const LIMIT = 100_000
const headers = { 'X-Auth-Email': EMAIL, 'X-Auth-Key': KEY, 'Content-Type': 'application/json' }

const api = async (path) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers })
  const json = await res.json().catch(() => ({}))
  if (!json.success) throw new Error(`${path}: ${res.status} ${JSON.stringify(json.errors ?? '')}`)
  return json.result
}
const graphql = async (query, variables) => {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) })
  const json = await res.json().catch(() => ({}))
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  return json.data
}

const [zone] = await api(`/zones?name=${ZONE}`)
if (!zone) throw new Error(`Зона ${ZONE} не найдена у этого ключа`)
const accountTag = zone.account.id
console.log(`Зона ${ZONE}: план ${zone.plan?.name ?? '?'}, статус ${zone.status}`)

const day = (d) => d.toISOString().slice(0, 10)
const now = new Date()
const since = new Date(now.getTime() - 3 * 86400_000)

// Вызовы Worker по суткам UTC (лимит сбрасывается в 00:00 UTC).
let bad = 0
try {
  const data = await graphql(
    `query ($account: String!, $script: String!, $from: Time!, $to: Time!) {
      viewer { accounts(filter: { accountTag: $account }) {
        workersInvocationsAdaptive(limit: 100, filter: { scriptName: $script, datetime_geq: $from, datetime_leq: $to }) {
          sum { requests errors subrequests }
          dimensions { date status }
        }
      } }
    }`,
    { account: accountTag, script: SCRIPT, from: new Date(`${day(since)}T00:00:00Z`).toISOString(), to: now.toISOString() },
  )
  const rows = data.viewer.accounts[0]?.workersInvocationsAdaptive ?? []
  const byDay = {}
  for (const r of rows) {
    const d = (byDay[r.dimensions.date] ??= { requests: 0, errors: 0, subrequests: 0, status: {} })
    d.requests += r.sum.requests
    d.errors += r.sum.errors
    d.subrequests += r.sum.subrequests
    d.status[r.dimensions.status] = (d.status[r.dimensions.status] ?? 0) + r.sum.requests
  }
  console.log(`\nВызовы Worker «${SCRIPT}» по суткам UTC (лимит ${LIMIT}):`)
  for (const d of Object.keys(byDay).sort()) {
    const x = byDay[d]
    const share = Math.round((x.requests / LIMIT) * 100)
    console.log(`  ${d}: ${x.requests} (${share}% лимита), ошибок ${x.errors}, подзапросов ${x.subrequests}, ${JSON.stringify(x.status)}`)
    if (d === day(now) && x.requests > LIMIT * 0.8) bad++
  }
  if (!rows.length) console.log('  нет данных')
} catch (e) {
  console.log(`!! вызовы Worker: ${e.message}`)
  bad++
}

// Что сделали правила безопасности за сутки: какое правило, какое действие, сколько раз.
try {
  const data = await graphql(
    `query ($zone: String!, $from: Time!, $to: Time!) {
      viewer { zones(filter: { zoneTag: $zone }) {
        firewallEventsAdaptive(limit: 10000, orderBy: [datetime_DESC], filter: { datetime_geq: $from, datetime_leq: $to }) {
          source action ruleId clientCountryName
        }
      } }
    }`,
    { zone: zone.id, from: new Date(now.getTime() - 86400_000).toISOString(), to: now.toISOString() },
  )
  // На бесплатном плане группировка недоступна, поэтому считаем сами по сырым событиям (до 10 000 последних).
  const rows = data.viewer.zones[0]?.firewallEventsAdaptive ?? []
  const count = (key) => {
    const m = {}
    for (const r of rows) m[key(r)] = (m[key(r)] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15)
  }
  console.log(`\nСобытия WAF и защиты от ботов за 24 часа: ${rows.length}${rows.length === 10000 ? '+' : ''}`)
  for (const [k, n] of count((r) => `${r.source}/${r.action} ${r.ruleId}`)) console.log(`  ${String(n).padStart(7)}  ${k}`)
  console.log('  по странам:', count((r) => r.clientCountryName).map(([k, n]) => `${k} ${n}`).join(', '))
  if (!rows.length) console.log('  нет событий: правила WAF, похоже, не включены')
} catch (e) {
  console.log(`!! события WAF: ${e.message}`)
}

// Свои правила WAF: какие есть и включены ли.
try {
  const rulesets = await api(`/zones/${zone.id}/rulesets`)
  const custom = rulesets.find((r) => r.phase === 'http_request_firewall_custom' && r.kind === 'zone')
  if (!custom) console.log('\nСвоих правил WAF нет')
  else {
    const { rules = [] } = await api(`/zones/${zone.id}/rulesets/${custom.id}`)
    console.log(`\nСвои правила WAF (${rules.length}):`)
    for (const r of rules) {
      console.log(`  ${r.enabled ? 'вкл ' : 'выкл'}  ${r.action.padEnd(16)} ${r.description || ''} (${r.id})`)
      console.log(`        ${r.expression}`)
      // Правило по стране или сети без исключения проверенных роботов задевает Google и Яндекс: страницы выпадают
      // из поиска. Списки имён сборщиков (по User-Agent) поисковиков не трогают.
      if (r.enabled && r.action !== 'skip' && r.expression.includes('ip.') && !r.expression.includes('cf.client.bot') && !r.expression.includes('cf.verified_bot_category'))
        console.log('        ! нет исключения для поисковиков (not cf.client.bot)')
    }
  }
} catch (e) {
  console.log(`!! правила WAF: ${e.message}`)
}

console.log(`\nПроблем: ${bad}`)
if (bad) process.exitCode = 1
