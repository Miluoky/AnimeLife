import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const artifactDir = 'C:/Users/slava/.gemini/antigravity/brain/29e3c89d-e2b8-4a74-b9f9-22855847f658/audit-screenshots'
const localDir = path.resolve('audit-screenshots')
if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true })

const fixture = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}.json`, import.meta.url), 'utf8'))
const animes = fixture('animes')
const anime = fixture('anime')
const genres = fixture('genres')
const posters = fixture('posters')

const screenshotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141E30" />
      <stop offset="100%" stop-color="#243B55" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <circle cx="640" cy="360" r="180" fill="#E94560" opacity="0.85" />
  <text x="640" y="375" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="44" font-weight="bold" text-anchor="middle">ANIME 16:9 BACKDROP</text>
  <rect x="100" y="80" width="1080" height="560" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-dasharray="16,8" opacity="0.6"/>
</svg>`

const posterSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
  <defs>
    <linearGradient id="pbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f2027" />
      <stop offset="50%" stop-color="#203a43" />
      <stop offset="100%" stop-color="#2c5364" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#pbg)" />
  <rect x="20" y="20" width="260" height="410" fill="none" stroke="#E94560" stroke-width="3" opacity="0.5"/>
  <text x="150" y="230" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" text-anchor="middle">POSTER</text>
</svg>`

async function mockApp(page) {
  await page.addInitScript(() => {
    localStorage.setItem('cookieFallback', '{"a_session_test":"x"}')
  })
  await page.route(/shikimori\.(io|one)\/api\/.*/, async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api', '')
    if (path === '/graphql') return route.fulfill({ json: posters })
    if (path === '/genres') return route.fulfill({ json: genres })
    if (path === '/calendar') return route.fulfill({ json: [] })
    if (path === '/animes') return route.fulfill({ json: animes.slice(0, Number(url.searchParams.get('limit')) || animes.length) })
    if (/^\/animes\/\d+$/.test(path)) return route.fulfill({ json: anime })
    return route.fulfill({ json: [] })
  })
  await page.route(/shikimori\.(io|one)\/(system|uploads)\/.*/, (route) => {
    const url = route.request().url()
    if (url.includes('screenshot')) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: screenshotSvg })
    }
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: posterSvg })
  })
  await page.route(/cloud\.appwrite\.io\/.*/, (route) =>
    route.fulfill({ status: 401, json: { message: 'guest', type: 'general_unauthorized_scope' } })
  )
  await page.route(/challenges\.cloudflare\.com\/.*/, (route) => route.fulfill({ status: 204, body: '' }))
  await page.route(/anilibria\.top\/api\/.*/, (route) => route.fulfill({ json: [] }))
  await page.route(/api\.animevost\.org\/.*/, (route) => route.fulfill({ json: { state: { status: 'ok' } } }))
  await page.route(/(api\.dreamerscast\.com|api\.dreamcast\.fun|dcast\.online)\/.*/, (route) =>
    route.fulfill({ status: 200, json: { response: [] } })
  )
  await page.route(/s3\.anixmirai\.com\/.*/, (route) =>
    route.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAIBAAA=', 'base64') })
  )
  await page.route(/api\.anixart\.tv\/.*/, (route) => route.fulfill({ json: { code: 0, content: [], types: [], sources: [], episodes: [] } }))
  await page.route(/api\.yani\.tv\/.*/, (route) => route.fulfill({ json: { response: [] } }))
  await page.route(/api\.animethemes\.moe\/.*/, (route) => route.fulfill({ json: { anime: [] } }))
  await page.route(/api\.trace\.moe\/.*/, (route) => route.fulfill({ json: { result: [] } }))
  await page.route(/youtube\.com\/embed\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: '<title>T</title>' }))
}

const VIEWPORTS = [
  { name: 'desktop-pc-1920x1080', width: 1920, height: 1080, isMobile: false, hasTouch: false },
  { name: 'android-phone-412x915', width: 412, height: 915, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
  { name: 'iphone-390x844', width: 390, height: 844, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
]

async function main() {
  const browser = await chromium.launch()
  const port = process.env.PW_PORT || 4173
  const baseURL = `http://localhost:${port}`

  console.log(`Auditing target: ${baseURL}`)

  for (const vp of VIEWPORTS) {
    console.log(`Capturing ${vp.name}...`)
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      userAgent: vp.userAgent,
    })
    const page = await context.newPage()
    await mockApp(page)

    await page.goto(baseURL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    // Capture above-the-fold / Hero viewport screenshot
    const heroPathLocal = path.join(localDir, `${vp.name}-hero.png`)
    const heroPathArtifact = path.join(artifactDir, `${vp.name}-hero.png`)
    await page.screenshot({ path: heroPathLocal, fullPage: false })
    await page.screenshot({ path: heroPathArtifact, fullPage: false })

    // Capture Full Page screenshot
    const fullPathLocal = path.join(localDir, `${vp.name}-full.png`)
    const fullPathArtifact = path.join(artifactDir, `${vp.name}-full.png`)
    await page.screenshot({ path: fullPathLocal, fullPage: true })
    await page.screenshot({ path: fullPathArtifact, fullPage: true })

    // Extract Hero and Bento geometry details
    const auditInfo = await page.evaluate(() => {
      const hero = document.querySelector('.hero')
      const heroBackdrop = document.querySelector('.hero__backdrop, .hero__art')
      const heroImg = document.querySelector('.hero__backdrop img, .hero__art')
      const bentoToday = document.querySelector('.bento__tile--today')
      const dock = document.querySelector('.dock')

      return {
        heroRect: hero ? hero.getBoundingClientRect() : null,
        heroBackdropRect: heroBackdrop ? heroBackdrop.getBoundingClientRect() : null,
        heroImgNatural: heroImg ? { naturalWidth: heroImg.naturalWidth, naturalHeight: heroImg.naturalHeight } : null,
        bentoTodayRect: bentoToday ? bentoToday.getBoundingClientRect() : null,
        bentoChildren: bentoToday ? bentoToday.innerHTML : null,
        dockRect: dock ? dock.getBoundingClientRect() : null,
        dockVisible: dock ? window.getComputedStyle(dock).display !== 'none' : false,
      }
    })

    console.log(`${vp.name} audit data:`, JSON.stringify(auditInfo, null, 2))
    await context.close()
  }

  await browser.close()
  console.log('Capture completed successfully.')
}

main().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})
