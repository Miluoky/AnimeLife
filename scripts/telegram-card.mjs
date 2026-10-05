// Карточка тайтла для постов Telegram-канала в дизайне сайта («Ночной кинотеатр»): тёмный фон с размытым постером,
// постер слева, справа метка (например «Новая серия · 5»), название шрифтом Unbounded, год, тип, оценка, жанры,
// краткое описание и адрес animelife.top. Рисуется в Chromium (Playwright) и возвращается как PNG 1280×720.
// Браузер ставится сам при первом запуске, если его нет (в GitHub Actions — только когда есть что публиковать).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const LOGO = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const KINDS = { tv: 'ТВ-сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'ТВ-спешл' }

const esc = (text) =>
  String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** HTML карточки. a — тайтл из GraphQL Shikimori, badge — надпись на метке, text — описание без BBCode. */
export function cardHtml(a, { badge, text, poster = a.poster?.originalUrl ?? '', fonts = '' }) {
  const title = a.russian || a.name
  const meta = [a.airedOn?.year, KINDS[a.kind], a.episodes > 0 ? `${a.episodes} эп.` : ''].filter(Boolean)
  const genres = (a.genres ?? []).filter((g) => g.kind === 'genre').slice(0, 4)
  const size = title.length > 60 ? 40 : title.length > 34 ? 50 : 62
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${fonts}
*{box-sizing:border-box;margin:0}
body{width:1280px;height:720px;overflow:hidden;background:#0d0e13;color:#f2f1ee;font-family:Manrope,sans-serif}
.bg{position:absolute;inset:-60px;background:url("${esc(poster)}") center/cover;filter:blur(48px) saturate(1.2);opacity:.45}
.shade{position:absolute;inset:0;background:radial-gradient(ellipse at 20% 20%,rgba(255,84,112,.22),transparent 55%),linear-gradient(90deg,rgba(13,14,19,.55),rgba(13,14,19,.92) 45%,#0d0e13)}
.wrap{position:relative;display:flex;gap:56px;padding:64px 72px;height:100%}
.poster{flex:none;width:400px;height:592px;border-radius:24px;background:#16171f url("${esc(poster)}") center/cover;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}
.info{display:flex;flex-direction:column;min-width:0;flex:1}
.brand{display:flex;align-items:center;gap:14px;font:700 24px Unbounded,sans-serif;letter-spacing:.01em}
.brand svg{width:44px;height:44px}
.brand b{color:#ff5470}
.badge{align-self:flex-start;margin-top:40px;padding:10px 22px;border-radius:999px;background:linear-gradient(135deg,#ff8aa0,#ff3d63);font:700 22px Manrope,sans-serif;box-shadow:0 10px 30px rgba(255,61,99,.35)}
h1{margin-top:22px;font:700 ${size}px/1.12 Unbounded,sans-serif;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.meta{margin-top:20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:21px;color:#c9c8d2}
.score{color:#ffd166;font-weight:700}
.chip{padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid #2a2b36;font-size:18px;color:#c9c8d2}
.text{margin-top:22px;font-size:21px;line-height:1.5;color:#a3a3b2;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.site{margin-top:auto;padding-top:18px;font:600 22px Unbounded,sans-serif;color:#ff8098}
</style></head><body>
<div class="bg"></div><div class="shade"></div>
<div class="wrap">
  <div class="poster"></div>
  <div class="info">
    <div class="brand">${LOGO}<span>Anime <b>Life</b></span></div>
    ${badge ? `<div class="badge">${esc(badge)}</div>` : ''}
    <h1>${esc(title)}</h1>
    <div class="meta">
      ${a.score > 0 ? `<span class="score">★ ${Number(a.score).toFixed(1)}</span>` : ''}
      ${meta.map((m) => `<span>${esc(m)}</span>`).join('<span>·</span>')}
    </div>
    <div class="meta">${genres.map((g) => `<span class="chip">${esc(g.russian)}</span>`).join('')}</div>
    <p class="text">${esc(text)}</p>
    <div class="site">animelife.top</div>
  </div>
</div></body></html>`
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;700&family=Unbounded:wght@600;700&display=block'

/** Файл по адресу как data: URL — постер и шрифты встраиваются в страницу, чтобы браузеру не нужна была сеть. */
async function dataUrl(url, type) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${type ?? res.headers.get('content-type') ?? 'application/octet-stream'};base64,${buf.toString('base64')}`
}

let fontsCss
/** Шрифты сайта (Unbounded, Manrope) с кириллицей и латиницей, встроенные в CSS. */
async function fonts() {
  if (fontsCss !== undefined) return fontsCss
  try {
    let css = await (await fetch(FONTS_CSS, { headers: { 'User-Agent': UA } })).text()
    // Только кириллица и латиница: остальные наборы символов карточке не нужны.
    css = css.replace(/\/\* (?!cyrillic \*|latin \*)[\w-]+ \*\/\s*@font-face\s*\{[^}]*\}/g, '')
    for (const url of new Set(css.match(/https:[^)]+\.woff2/g) ?? [])) css = css.replaceAll(url, await dataUrl(url, 'font/woff2'))
    fontsCss = css
  } catch (e) {
    console.warn(`Шрифты не загрузились: ${e.message}`)
    fontsCss = ''
  }
  return fontsCss
}

let browser

async function launch() {
  const { chromium } = await import('@playwright/test')
  try {
    return await chromium.launch()
  } catch {
    console.log('Ставим Chromium для карточек…')
    execSync('npx playwright install chromium', { stdio: 'inherit' })
    return chromium.launch()
  }
}

/** PNG карточки. Если не вышло (нет браузера, постер не загрузился), возвращает undefined — пост уйдёт с постером. */
export async function renderCard(a, opts) {
  try {
    browser ??= await launch()
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    try {
      const poster = a.poster?.originalUrl ? await dataUrl(a.poster.originalUrl) : ''
      await page.setContent(cardHtml(a, { ...opts, poster, fonts: await fonts() }), { waitUntil: 'load', timeout: 30000 })
      await page.evaluate(() => document.fonts.ready)
      return await page.screenshot({ type: 'png' })
    } finally {
      await page.close()
    }
  } catch (e) {
    console.warn(`Карточка не нарисовалась: ${e.message}`)
    return undefined
  }
}

export async function closeCards() {
  await browser?.close()
  browser = undefined
}
