#!/usr/bin/env node
/**
 * Idempotent upsert of WAF rules 1–4 from docs/worker-limit.md for zone animelife.top.
 * Uses Global API Key (same as scripts/cloudflare-status.mjs / ANIMELIFE_CF_* in CI).
 *
 * Rule #1 adds an exception for the Telegram webhook path so Go-http-client is not blocked there
 * (Telegram still uses polling via deleteWebhook in animelife.yml if webhook is off).
 *
 * Does NOT enable Bot Fight Mode or AI Crawl Control (manual / separate; see risk notes in header).
 *
 *   CLOUDFLARE_EMAIL=... CLOUDFLARE_API_KEY=... node scripts/ensure-waf-rules.mjs
 *   node scripts/ensure-waf-rules.mjs --dry-run
 *   node scripts/ensure-waf-rules.mjs --check-bots   # read-only: bot_management flags
 */
const EMAIL = process.env.CLOUDFLARE_EMAIL
const KEY = process.env.CLOUDFLARE_API_KEY
const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || 'animelife.top'
const TAG = '[animelife-waf]'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const CHECK_BOTS = args.has('--check-bots')

if (!EMAIL || !KEY) {
  console.error('Нужны CLOUDFLARE_EMAIL и CLOUDFLARE_API_KEY (в CI: secrets.ANIMELIFE_CF_EMAIL / ANIMELIFE_CF_API_KEY).')
  console.error('Пример: node scripts/ensure-waf-rules.mjs --dry-run')
  process.exit(args.has('--dry-run') ? 0 : 1)
}

const headers = { 'X-Auth-Email': EMAIL, 'X-Auth-Key': KEY, 'Content-Type': 'application/json' }

const norm = (s) => s.replace(/\s+/g, ' ').trim()

const api = async (method, path, body) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!json.success) {
    const detail = json.errors?.map((e) => e.message).join('; ') || res.status
    throw new Error(`${method} ${path}: ${detail}`)
  }
  return json.result
}

/** @typedef {{ description: string, action: string, expression: string, ratelimit?: object }} DesiredRule */

/** @type {DesiredRule[]} */
const CUSTOM_RULES = [
  {
    description: `${TAG} #1 Блок сборщиков и сканеров`,
    action: 'block',
    expression: norm(`(
      (lower(http.user_agent) contains "amazonbot") or (lower(http.user_agent) contains "meta-externalagent") or
      (lower(http.user_agent) contains "meta-externalfetcher") or (lower(http.user_agent) contains "semrush") or
      (lower(http.user_agent) contains "ahrefs") or (lower(http.user_agent) contains "mj12bot") or
      (lower(http.user_agent) contains "dotbot") or (lower(http.user_agent) contains "petalbot") or
      (lower(http.user_agent) contains "bytespider") or (lower(http.user_agent) contains "gptbot") or
      (lower(http.user_agent) contains "ccbot") or (lower(http.user_agent) contains "claudebot") or
      (lower(http.user_agent) contains "perplexity") or (lower(http.user_agent) contains "dataforseo") or
      (lower(http.user_agent) contains "blexbot") or (lower(http.user_agent) contains "python-requests") or
      (lower(http.user_agent) contains "go-http-client") or (lower(http.user_agent) contains "headlesschrome") or
      (http.user_agent eq "") or (http.request.uri.path contains ".php") or (http.request.uri.path contains "/.env") or
      (http.request.uri.path contains "/.git") or starts_with(http.request.uri.path, "/wp-")
    ) and not starts_with(http.request.uri.path, "/api/core/auth/oauth/telegram/webhook")`),
  },
  {
    description: `${TAG} #2 Поддельные браузеры`,
    action: 'block',
    expression: norm(`(
      (http.user_agent contains "Chrome/") or (http.user_agent contains "Firefox/")
    ) and not any(http.request.headers.names[*] == "sec-fetch-mode") and not cf.client.bot`),
  },
  {
    description: `${TAG} #3 Дата-центры без проверенного робота`,
    action: 'managed_challenge',
    expression: norm(`(
      ip.src.asnum in {16509 14618 8075 396982 14061 24940 16276 63949 20473 45102 132203 37963}
    ) and not cf.client.bot and not starts_with(http.request.uri.path, "/assets/") and
    not (lower(http.user_agent) contains "telegrambot") and not (lower(http.user_agent) contains "vkshare") and
    not (lower(http.user_agent) contains "facebookexternalhit") and not (lower(http.user_agent) contains "twitterbot") and
    not (lower(http.user_agent) contains "discordbot")`),
  },
]

/** @type {DesiredRule} */
const RATE_RULE = {
  description: `${TAG} #4 Ограничение частоты /api/`,
  action: 'block',
  expression: norm('starts_with(http.request.uri.path, "/api/")'),
  ratelimit: {
    // Free/API: counting at colo — cf.colo.id обязателен вместе с ip.src.
    characteristics: ['cf.colo.id', 'ip.src'],
    period: 10,
    requests_per_period: 30,
    mitigation_timeout: 10,
  },
}

const sameRule = (want, have) =>
  want.action === have.action &&
  norm(want.expression) === norm(have.expression) &&
  (have.enabled ?? true) === true &&
  JSON.stringify(want.ratelimit ?? null) === JSON.stringify(have.ratelimit ?? null)

const buildManagedRules = (desired, existingRules) => {
  const byDesc = new Map(existingRules.filter((r) => r.description?.startsWith(TAG)).map((r) => [r.description, r]))
  return desired.map((d) => {
    const ex = byDesc.get(d.description)
    const rule = {
      description: d.description,
      expression: d.expression,
      action: d.action,
      enabled: true,
    }
    if (d.ratelimit) rule.ratelimit = d.ratelimit
    if (ex?.id) rule.id = ex.id
    return rule
  })
}

/** Free Website: max 5 custom firewall rules. Keep our TAG rules first, then up to leftover slots. */
const FREE_CUSTOM_MAX = 5

const mergeRuleset = (desired, existingRules) => {
  const managed = buildManagedRules(desired, existingRules)
  const budget = Math.max(0, FREE_CUSTOM_MAX - managed.length)
  const others = existingRules.filter((r) => !r.description?.startsWith(TAG))
  // Сначала то, что связано с Telegram/превью — остальное на Free не влезает.
  const score = (r) => {
    const d = `${r.description || ''} ${r.expression || ''}`.toLowerCase()
    if (d.includes('telegram') || d.includes('webhook')) return 2
    if (d.includes('vkshare') || d.includes('preview') || d.includes('bot')) return 1
    return 0
  }
  const ranked = [...others].sort((a, b) => score(b) - score(a))
  const kept = ranked.slice(0, budget)
  const dropped = ranked.slice(budget)
  return { next: [...managed, ...kept], dropped }
}

const diffRuleset = (desired, existingRules) => {
  const { next, dropped } = mergeRuleset(desired, existingRules)
  const managedNext = next.filter((r) => r.description?.startsWith(TAG))
  const managedOld = existingRules.filter((r) => r.description?.startsWith(TAG))
  const changes = []
  for (const r of managedNext) {
    const old = managedOld.find((x) => x.description === r.description)
    if (!old) changes.push(`  + ${r.description}`)
    else if (!sameRule(r, old)) changes.push(`  ~ ${r.description}`)
  }
  for (const old of managedOld) {
    if (!managedNext.some((r) => r.description === old.description)) changes.push(`  - ${old.description}`)
  }
  for (const d of dropped) {
    changes.push(`  ! снято (лимит Free ${FREE_CUSTOM_MAX}): ${d.description || d.id || 'без имени'}`)
  }
  const othersOld = existingRules.filter((r) => !r.description?.startsWith(TAG)).map((r) => r.id).join()
  const othersNew = next.filter((r) => !r.description?.startsWith(TAG)).map((r) => r.id).join()
  const orderChanged =
    managedOld.map((r) => r.description).join() !== managedNext.map((r) => r.description).join() ||
    othersOld !== othersNew
  if (orderChanged && !changes.length) changes.push('  ~ порядок правил [animelife-waf]')
  return { next, changes, orderChanged: orderChanged || changes.length > 0 }
}

const getPhaseEntrypoint = async (zoneId, phase) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, { headers })
  const json = await res.json().catch(() => ({}))
  if (json.success) return json.result
  const code = json.errors?.[0]?.code
  if (code === 7003 || code === 10000 || res.status === 404) return null
  throw new Error(`GET entrypoint ${phase}: ${json.errors?.map((e) => e.message).join('; ') || res.status}`)
}

const applyPhase = async (zoneId, phase, desired, label) => {
  const entry = await getPhaseEntrypoint(zoneId, phase)
  const existingRules = entry?.rules ?? []
  const { next, changes } = diffRuleset(desired, existingRules)

  console.log(`\n${label} (phase ${phase}):`)
  if (!changes.length) {
    console.log('  без изменений')
    return
  }
  for (const c of changes) console.log(c)

  if (DRY) {
    console.log('  (--dry-run, API не вызывается)')
    return
  }

  if (entry?.id) {
    await api('PUT', `/zones/${zoneId}/rulesets/${entry.id}`, { rules: next })
    console.log('  обновлено')
    return
  }

  await api('POST', `/zones/${zoneId}/rulesets`, {
    name: `AnimeLife ${label}`,
    kind: 'zone',
    phase,
    rules: next,
  })
  console.log('  создано')
}

const [zone] = await api('GET', `/zones?name=${encodeURIComponent(ZONE_NAME)}`)
if (!zone) throw new Error(`Зона ${ZONE_NAME} не найдена`)

console.log(`Зона ${ZONE_NAME} (${zone.id}), план ${zone.plan?.name ?? '?'}`)
if (DRY) console.log('Режим --dry-run')

if (CHECK_BOTS) {
  try {
    const bot = await api('GET', `/zones/${zone.id}/bot_management`)
    console.log('\nbot_management (только чтение):', JSON.stringify(bot, null, 2))
  } catch (e) {
    console.log('\nbot_management:', e.message)
  }
}

await applyPhase(zone.id, 'http_request_firewall_custom', CUSTOM_RULES, 'Custom WAF rules 1–3')
await applyPhase(zone.id, 'http_ratelimit', [RATE_RULE], 'Rate limiting rule 4')

console.log('\nГотово. Bot Fight Mode и AI Crawl Control скрипт не меняет — см. docs/worker-limit.md §3.')
if (DRY) console.log('Запустите без --dry-run (или workflow ensure-waf-rules) чтобы применить.')
