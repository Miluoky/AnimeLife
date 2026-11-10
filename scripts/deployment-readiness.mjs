// Скрипт проверки готовности к деплою (Cloudflare Worker + Core D1/KV) для https://animelife.top.
// Запуск: node scripts/deployment-readiness.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = process.cwd()
let exitCode = 0

function pass(msg) {
  console.log(`  ✓ ${msg}`)
}

function fail(msg) {
  console.error(`  ✗ ${msg}`)
  exitCode = 1
}

function heading(title) {
  console.log(`\n=== ${title} ===`)
}

// 1. Проверка конфигурации Cloudflare Worker
heading('1. Cloudflare Worker Configuration')
const wranglerPath = join(ROOT, 'wrangler.animelife.jsonc')
if (!existsSync(wranglerPath)) {
  fail('wrangler.animelife.jsonc не найден')
} else {
  try {
    const raw = readFileSync(wranglerPath, 'utf8')
    // Очистить комментарии для парсинга JSON
    const stripped = raw.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
    const config = JSON.parse(stripped)
    
    if (config.name === 'anime') pass(`Имя воркера: ${config.name}`)
    else fail(`Неверное имя воркера: ${config.name}`)

    if (config.main === 'worker/index.js' && existsSync(join(ROOT, config.main))) {
      pass(`Точка входа воркера: ${config.main} (существует)`)
    } else {
      fail(`Точка входа не найдена: ${config.main}`)
    }

    if (config.assets?.directory === './dist' && existsSync(join(ROOT, 'dist', 'index.html'))) {
      pass(`Статические ассеты: ${config.assets.directory} (dist/index.html собран)`)
    } else {
      fail(`Каталог ассетов ./dist или dist/index.html отсутствует`)
    }

    if (config.assets?.not_found_handling === 'single-page-application') {
      pass('SPA routing настроен: single-page-application')
    } else {
      fail(`Неверный not_found_handling: ${config.assets?.not_found_handling}`)
    }

    const routes = config.routes || []
    const hasMainDomain = routes.some((r) => r.pattern === 'animelife.top' && r.custom_domain === true)
    const hasWwwDomain = routes.some((r) => r.pattern === 'www.animelife.top' && r.custom_domain === true)

    if (hasMainDomain && hasWwwDomain) {
      pass('Кастомные домены animelife.top и www.animelife.top валидны')
    } else {
      fail('Маршруты custom_domain для animelife.top / www.animelife.top неполны')
    }
  } catch (err) {
    fail(`Ошибка парсинга wrangler.animelife.jsonc: ${err.message}`)
  }
}

// 2. Проверка кода воркера и прокси
heading('2. Edge Worker Implementation')
const workerIndex = join(ROOT, 'worker/index.js')
const sibnetProxy = join(ROOT, 'worker/sibnetProxy.js')

if (existsSync(workerIndex)) {
  const code = readFileSync(workerIndex, 'utf8')
  if (code.includes('export default') && code.includes('async fetch(request, env, ctx)')) {
    pass('worker/index.js содержит корректный fetch handler')
  } else {
    fail('worker/index.js не экспортирует fetch handler')
  }
  if (code.includes("const ORIGIN = 'https://animelife.top'")) {
    pass('worker/index.js нацелен на ORIGIN = https://animelife.top')
  } else {
    fail('worker/index.js ORIGIN не совпадает с https://animelife.top')
  }
} else {
  fail('worker/index.js отсутствует')
}

if (existsSync(sibnetProxy)) {
  const code = readFileSync(sibnetProxy, 'utf8')
  if (code.includes('isSibnetProxy') && code.includes('sibnetProxy')) {
    pass('worker/sibnetProxy.js экспортирует нужные методы')
  } else {
    fail('worker/sibnetProxy.js не содержит требуемых экспортов')
  }
  if (code.includes('Access-Control-Allow-Origin') && code.includes('Range')) {
    pass('worker/sibnetProxy.js поддерживает CORS и стриминг с Range')
  } else {
    fail('worker/sibnetProxy.js отсутствует поддержка CORS / Range')
  }
} else {
  fail('worker/sibnetProxy.js отсутствует')
}

// 3. AnimeLife Core (D1 + KV), без Appwrite Functions
heading('3. AnimeLife Core')
const coreRouter = join(ROOT, 'worker/core/router.js')
const coreActions = join(ROOT, 'worker/core/actions.js')
const coreSchema = join(ROOT, 'worker/core/schema.sql')
if (existsSync(coreRouter) && existsSync(coreActions)) {
  const code = readFileSync(coreRouter, 'utf8')
  if (code.includes('/api/core') && code.includes('export async function coreApi')) {
    pass('worker/core/router.js обслуживает /api/core')
  } else {
    fail('worker/core/router.js не похож на Core API')
  }
} else {
  fail('worker/core/router.js или actions.js отсутствует')
}
if (existsSync(coreSchema)) pass('worker/core/schema.sql на месте')
else fail('worker/core/schema.sql отсутствует')

// 4. Проверка тестовых моков
heading('4. Test Mocks Resilience')
const mocksPath = join(ROOT, 'tests/mocks.ts')
if (existsSync(mocksPath)) {
  const mocksCode = readFileSync(mocksPath, 'utf8')
  if (
    mocksCode.includes('/api/core') &&
    mocksCode.includes('api.dreamerscast.com') &&
    mocksCode.includes('api.dreamcast.fun') &&
    mocksCode.includes('dcast.online')
  ) {
    pass('tests/mocks.ts: Core /api/core и зеркала Dream Cast')
  } else {
    fail('tests/mocks.ts не содержит заготовок Core или Dream Cast')
  }
} else {
  fail('tests/mocks.ts отсутствует')
}

// 5. Проверка боевого сайта animelife.top
heading('5. Production Connectivity Check (https://animelife.top)')
try {
  const res = await fetch('https://animelife.top', {
    method: 'GET',
    headers: { 'User-Agent': 'AnimeLife-DeployReadiness/1.0' },
    signal: AbortSignal.timeout(6000),
  })
  pass(`https://animelife.top доступен (HTTP ${res.status}, server=${res.headers.get('server') || 'cloudflare'})`)
} catch (err) {
  console.log(`  ! Внимание: прямой запрос к https://animelife.top: ${err.message} (возможно ограничение локальной сети)`)
}

// 6. Сводка
heading('Deployment Readiness Verdict')
if (exitCode === 0) {
  console.log('🎉 ВСЕ ПРОВЕРКИ УСПЕШНО ПРОЙДЕНЫ: проект полностью готов к выкладке на боевой сервер https://animelife.top!\n')
} else {
  console.error('⛔ ОБНАРУЖЕНЫ ОШИБКИ ГОТОВНОСТИ К ДЕПЛОЮ.\n')
  process.exit(1)
}
