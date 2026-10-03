// IndexNow: сразу после публикации сообщает Яндексу и Bing (и остальным участникам протокола), какие страницы
// обновились, чтобы они пришли за ними раньше обычного обхода. Запуск: node scripts/indexnow.mjs [--dry-run]
// (шаг в .github/workflows/animelife.yml). Ключ — файл public/<ключ>.txt: по протоколу он открыт всем, а сайт
// подтверждает, что ключ его, тем, что отдаёт этот файл по адресу https://animelife.top/<ключ>.txt.
import { readdirSync, readFileSync } from 'node:fs'

const ORIGIN = 'https://animelife.top'
// Откуда брать карту сайта: по умолчанию живой сайт, для проверки можно указать локальный wrangler dev.
const SOURCE = process.env.SITE_URL ?? ORIGIN
const dry = process.argv.includes('--dry-run')

const file = readdirSync(new URL('../public', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f))
if (!file) throw new Error('Нет файла ключа public/<32 hex>.txt')
// По протоколу имя файла и его содержимое — один и тот же ключ: проверяем, чтобы не отправить чужой.
const key = file.slice(0, -'.txt'.length)
if (readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8').trim() !== key) {
  throw new Error(`В public/${file} записан не тот ключ, что в имени файла`)
}

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AnimeLife/1.0 (+https://github.com/ShizukuZK/Anime)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res
}

// Поисковик проверит ключ по этому адресу: если новая версия ещё не доехала, подождём немного.
if (!dry) {
  for (let i = 0; ; i++) {
    const live = await get(`${ORIGIN}/${key}.txt`).then((r) => r.text()).catch(() => '')
    if (live.trim() === key) break
    if (i === 5) throw new Error(`Файл ключа ${ORIGIN}/${key}.txt не отдаётся`)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
}

// Разделы и посадочные страницы — из карты сайта (sitemap-pages.xml), плюс 50 популярных онгоингов:
// у них каждую неделю новые серии. Немного адресов за раз, без всех тайтлов подряд.
const pages = await get(`${SOURCE}/sitemap-pages.xml`)
  .then((r) => r.text())
  .then((xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))
  .catch((e) => {
    console.warn('Карта сайта не загрузилась, отправляю только главную:', e.message)
    return [`${ORIGIN}/`]
  })
const ongoing = await get('https://shikimori.io/api/animes?status=ongoing&order=popularity&limit=50&censored=true')
  .then((r) => r.json())
  .catch(() => [])
const urlList = [...new Set([...pages, ...ongoing.map((a) => `${ORIGIN}/anime/${a.id}`)])]

console.log(`Адресов: ${urlList.length}`)
if (dry) {
  console.log(urlList.join('\n'))
  process.exit(0)
}

// Достаточно одного участника (адреса расходятся между всеми), но Яндекс отвечает за свою часть быстрее напрямую.
const body = JSON.stringify({ host: new URL(ORIGIN).host, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList })
let ok = false
for (const endpoint of ['https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow']) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => ({ status: 0, statusText: e.message }))
  // 200 и 202 — принято; 403 — ключ не найден на сайте; 422 — адреса не с этого сайта; 429 — слишком часто.
  console.log(`${endpoint}: ${res.status} ${res.statusText ?? ''}`)
  ok ||= res.status === 200 || res.status === 202
}
if (!ok) process.exit(1)
