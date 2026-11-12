import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mockCoreSession, mockServices } from './mocks'
import { pressedAt } from '../worker/core/rooms.js'

const CODE = 'ABC234'
const clip = fileURLToPath(new URL('./fixtures/clip.webm', import.meta.url))

const baseRoom = {
  $id: CODE,
  hostId: 'host1',
  hostName: 'Ведущий',
  animeId: '1',
  animeTitle: 'Ковбой Бибоп',
  episode: 1,
  source: 'file',
  videoId: '',
  title: 'Смотрим первую серию',
  public: true,
  controlAll: false,
  playing: false,
  position: 0,
  at: Date.now(),
  lastActive: Date.now(),
  actor: 'Ведущий',
}

type LiveRoom = Record<string, unknown> & {
  $id?: string
  public?: boolean
  startsAt?: number | null
  hostId?: string
  hostName?: string
  playing?: boolean
  position?: number
  at?: number
  episode?: number
  source?: string
  videoId?: string
  controlAll?: boolean
  actor?: string
  title?: string
  animeTitle?: string
  animeId?: string
}

type Live = {
  room: LiveRoom | null
  messages: Record<string, unknown>[]
  members: Record<string, unknown>[]
  actions: Record<string, unknown>[]
  viewer: { $id: string; name: string }
  /** Задержка ответа room-control, мс. */
  controlDelay: number
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

function createLive(room: LiveRoom | null, members: Record<string, unknown>[] = []): Live {
  const now = Date.now()
  return {
    room: room ? { ...room, lastActive: now, at: room.at ?? now } : null,
    messages: [],
    members: members.map((m) => ({ ...m })),
    actions: [],
    viewer: { $id: 'host1', name: 'Ведущий' },
    controlDelay: 0,
  }
}

function patchRoom(live: Live, patch: LiveRoom) {
  if (!live.room) throw new Error('комната не задана')
  live.room = { ...live.room, lastActive: Date.now(), ...patch }
}

/**
 * Комната на Core: GET /api/core/rooms* и POST /api/core/action (room-*).
 * Живые обновления клиент забирает опросом, не сокетом. RoomDO не поднимаем:
 * /ws сразу закрывается, подписчики остаются на poll.
 */
async function installCoreRoom(page: Page, live: Live) {
  await page.route(/\/api\/time(?:\?|$)/, (route) => route.fulfill({ json: { now: Date.now() } }))
  await page.routeWebSocket(/\/api\/core\/rooms\/[^/]+\/ws/, (ws) => {
    ws.close()
  })
  await page.route(/\/api\/core\/rooms(\/|\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const url = new URL(route.request().url())
    const parts = url.pathname.replace(/^\/api\/core/, '').split('/').filter(Boolean)
    const now = Date.now()
    const room = live.room
    const code = room?.$id ? String(room.$id).toUpperCase() : ''
    const pub = !!room && room.public !== false
    const soon = pub && typeof room?.startsAt === 'number' && room.startsAt > now

    if (parts.length === 1) return route.fulfill({ json: { rooms: pub && room ? [room] : [] } })
    if (parts[1] === 'upcoming') return route.fulfill({ json: { rooms: soon && room ? [room] : [] } })
    if (parts[1] === 'member-counts') {
      const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean)
      const counts: Record<string, number> = {}
      for (const id of ids) {
        const key = id.toUpperCase()
        counts[key] = live.members.filter((m) => String(m.roomId).toUpperCase() === key).length
      }
      return route.fulfill({ json: { counts } })
    }

    const roomCode = String(parts[1] || '').toUpperCase()
    const mine = !!room && roomCode === code
    if (parts[2] === 'messages') {
      const messages = mine ? live.messages.filter((m) => String(m.roomId).toUpperCase() === roomCode) : []
      return route.fulfill({ json: { messages } })
    }
    if (parts[2] === 'members') {
      const since = Number(url.searchParams.get('since') || 0)
      const members = mine
        ? live.members.filter((m) => String(m.roomId).toUpperCase() === roomCode && Number(m.at) >= since)
        : []
      return route.fulfill({ json: { members } })
    }
    if (parts[2] === 'signals') return route.fulfill({ json: { signals: [] } })
    if (!mine || !room) return route.fulfill({ status: 404, json: { message: 'Комната не найдена', code: 404 } })
    return route.fulfill({ json: { room, serverNow: now } })
  })

  await page.route(/\/api\/core\/action(?:\?|$)/, async (route) => {
    let body: Record<string, unknown> = {}
    try {
      body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    } catch {
      body = {}
    }
    const action = String(body.action || '')
    if (!action.startsWith('room-')) return route.fallback()
    live.actions.push(body)
    const now = Date.now()
    if (action === 'room-time') return route.fulfill({ json: { serverNow: now } })

    if (action === 'room-create') {
      const created: LiveRoom = {
        $id: makeCode(),
        hostId: live.viewer.$id,
        hostName: live.viewer.name,
        animeId: String(body.animeId ?? ''),
        animeTitle: String(body.animeTitle ?? 'Аниме'),
        poster: String(body.poster ?? ''),
        episode: Number(body.episode) || 1,
        source: body.source === 'file' ? 'file' : 'trailer',
        videoId: String(body.videoId ?? ''),
        title: String(body.title ?? ''),
        public: body.public !== false,
        controlAll: !!body.controlAll,
        playing: false,
        position: 0,
        at: now,
        lastActive: now,
        actor: live.viewer.name,
        startsAt: body.startsAt == null ? null : Number(body.startsAt),
      }
      live.room = created
      return route.fulfill({ json: { room: created, serverNow: now } })
    }

    if (action === 'room-control') {
      if (live.controlDelay) await new Promise((done) => setTimeout(done, live.controlDelay))
      if (!live.room) return route.fulfill({ status: 404, json: { message: 'Комната не найдена', code: 404 } })
      const room = live.room
      room.playing = !!body.playing
      room.position = Math.max(0, Number(body.position) || 0)
      room.at = pressedAt(body.at, Date.now())
      room.lastActive = Date.now()
      room.actor = live.viewer.name
      if (body.episode != null) room.episode = Math.max(1, Math.floor(Number(body.episode)))
      if (body.source === 'file' || body.source === 'trailer') room.source = String(body.source)
      if (body.videoId != null) room.videoId = String(body.videoId)
      if (body.controlAll != null) room.controlAll = !!body.controlAll
      if (body.public != null) room.public = !!body.public
      if (body.title != null) room.title = String(body.title)
      if ('startsAt' in body) room.startsAt = body.startsAt == null ? null : Number(body.startsAt)
      return route.fulfill({ json: { serverNow: Date.now(), room } })
    }

    if (action === 'room-message') {
      const message = {
        $id: `m${live.messages.length + 1}`,
        roomId: String(body.roomId || live.room?.$id || '').toUpperCase(),
        userId: live.viewer.$id,
        name: live.viewer.name,
        text: String(body.text ?? ''),
        kind: body.kind === 'reaction' ? 'reaction' : 'chat',
        t: Number(body.t) || 0,
        at: now,
      }
      live.messages.push(message)
      return route.fulfill({ json: { message, serverNow: now } })
    }

    if (action === 'room-presence') {
      const userId = live.viewer.$id
      const roomId = String(body.roomId || live.room?.$id || '').toUpperCase()
      live.members = live.members.filter((m) => m.userId !== userId)
      if (!body.leave) {
        live.members.push({
          $id: `${roomId}:${userId}`,
          roomId,
          userId,
          name: live.viewer.name,
          voice: !!body.voice,
          muted: !!body.muted,
          at: now,
        })
      }
      return route.fulfill({ json: { ok: true, serverNow: now } })
    }

    if (action === 'room-close') live.room = null
    if (action === 'room-message-delete') live.messages = live.messages.filter((m) => m.$id !== body.messageId)
    return route.fulfill({ json: { ok: true, serverNow: now } })
  })
}

async function asUser(page: Page, live: Live, user: { $id: string; name: string; email?: string }) {
  live.viewer = { $id: user.$id, name: user.name }
  await mockCoreSession(page, { ...user, email: user.email ?? `${user.$id}@example.test` })
}

function watchControls(page: Page) {
  const controls: { action?: string; playing?: boolean; position?: number; episode?: number; videoId?: string }[] = []
  page.on('request', (r) => {
    if (r.method() !== 'POST' || !/\/api\/core\/action(?:\?|$)/.test(r.url())) return
    try {
      const body = r.postDataJSON() as { action?: string; position?: number }
      if (body?.action === 'room-control') controls.push(body)
    } catch {
      /* не json */
    }
  })
  return controls
}

/** Серии AnimeVost с роликом из tests/fixtures. delay — задержка ответа, как у медленного видеосервера. */
async function mockAnimeVost(page: Page, delay = 0) {
  await page.route(/api\.animevost\.org\/v1\/search/, (route) =>
    route.fulfill({ json: { state: { status: 'ok' }, data: [{ id: 8, title: 'Ковбой Бибоп / Cowboy Bebop [1-26 из 26]', year: '1998' }] } }),
  )
  await page.route(/api\.animevost\.org\/v1\/playlist/, (route) =>
    route.fulfill({ json: [1, 2].map((n) => ({ name: `${n} серия`, hd: `http://video.animetop.info/720/${n}.mp4` })) }),
  )
  const body = readFileSync(clip)
  await page.route(/video\.animetop\.info\/.*/, async (route) => {
    if (delay) await new Promise((done) => setTimeout(done, delay))
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '')
    if (!range) return route.fulfill({ contentType: 'video/webm', body })
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : body.length - 1
    return route.fulfill({
      status: 206,
      contentType: 'video/webm',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${body.length}` },
      body: body.subarray(start, end + 1),
    })
  })
}

const video = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector('video')
    return v ? { t: v.currentTime, paused: v.paused } : null
  })

/**
 * Поддельный плеер Kodik с тем же postMessage API, повадки сняты с настоящего: само время шлёт раз в секунду
 * целыми секундами, точное отдаёт на get_time, после перемотки секунду догружается (время стоит),
 * на плей и паузу отвечает событиями с задержкой, скорость меняет командой speed.
 */
const FAKE_KODIK = `<!doctype html><script>
let t = 0, playing = false, loadingUntil = 0, last = Date.now(), rate = 1
const send = (key, value) => parent.postMessage({ key, value }, '*')
setInterval(() => {
  const now = Date.now()
  if (playing && now > loadingUntil) t += ((now - last) / 1000) * rate
  last = now
}, 20)
setInterval(() => send('kodik_player_time_update', Math.ceil(t)), 1000)
window.state = () => ({ t, playing, rate })
addEventListener('message', (e) => {
  const v = e.data && e.data.key === 'kodik_player_api' && e.data.value
  if (!v) return
  if (v.method === 'get_time') return send('kodik_player_time', t)
  if (v.method === 'speed') { rate = v.speed; return send('kodik_player_speed_change', { speed: v.speed }) }
  window.commands = (window.commands || 0) + 1
  if (v.method === 'play' && !playing) { playing = true; setTimeout(() => send('kodik_player_play'), 900) }
  if (v.method === 'pause' && playing) { playing = false; setTimeout(() => send('kodik_player_pause'), 900) }
  if (v.method === 'seek') { t = v.seconds; loadingUntil = Date.now() + 1000; setTimeout(() => send('kodik_player_seek', { time: v.seconds }), 100) }
})
</script>`

async function mockKodikVoice(page: Page) {
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31\/29$/, (route) => route.fulfill({ json: { code: 0, sources: [{ id: 30, name: 'Kodik', episodes_count: 26 }] } }))
  await page.route(/api\.anixart\.tv\/episode\/31\/29\/30$/, (route) =>
    route.fulfill({ json: { code: 0, episodes: [{ position: 1, url: 'https://kodikplayer.com/seria/1/hash/720p', iframe: true }] } }),
  )
  await page.route(/kodikplayer\.com\/.*/, (route) => route.fulfill({ contentType: 'text/html', body: FAKE_KODIK }))
}

const kodikState = (page: Page) =>
  page
    .frameLocator('iframe.player-iframe')
    .locator('body')
    .evaluate(() => (window as unknown as { state: () => { t: number; playing: boolean; rate: number } }).state())

test.describe.configure({ timeout: 60_000 })

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('вкладка «Вместе»: открытые комнаты и вход по коду', async ({ page }) => {
  await installCoreRoom(page, createLive(baseRoom))
  await page.goto('/together')
  await expect(page.getByRole('link', { name: /Смотрим первую серию/ })).toBeVisible()
  await page.getByLabel('Код комнаты').fill(CODE.toLowerCase())
  await page.getByRole('button', { name: 'Войти в комнату' }).click()
  await expect(page).toHaveURL(new RegExp(`/together/${CODE}$`))
  await expect(page.getByRole('heading', { name: /Смотрим первую серию/ })).toBeVisible()
})

test('создание комнаты с вкладки «Вместе» уходит в room-create', async ({ page }) => {
  const live = createLive(null)
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'u1', name: 'Аня', email: 'a@example.com' })
  await page.goto('/together')
  await page.getByLabel('Создать комнату').fill('ван')
  await page.getByRole('button', { name: /Ван-Пис/ }).click()
  await expect(page).toHaveURL(/\/together\/[A-Z0-9]{6}$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Серия 1')
  const created = live.actions.find((a) => a.action === 'room-create')
  expect(created).toMatchObject({ action: 'room-create', animeId: '21', public: true })
  expect(live.room?.$id).toMatch(/^[A-Z0-9]{6}$/)
})

test('вкладка «Вместе» на телефоне 390px: страница не шире экрана, нижнее меню видно', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installCoreRoom(page, createLive(baseRoom))
  await page.goto('/together')
  await expect(page.getByRole('link', { name: /Смотрим первую серию/ })).toBeVisible()
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(client)
  if (isMobile) await expect(page.locator('.dock')).toBeInViewport()
})

test('комната: плей и пауза ведущего приходят гостю следующим опросом, чат и реакция тоже', async ({ page }) => {
  const live = createLive(baseRoom)
  await installCoreRoom(page, live)
  await page.goto(`/together/${CODE}`)
  await page.locator('.together__gate input[type=file]').setInputFiles(clip)
  await page.getByRole('button', { name: /Присоединиться/ }).click()
  await expect.poll(async () => (await video(page))?.paused).toBe(true)

  patchRoom(live, { playing: true, position: 2, at: Date.now(), actor: 'Ведущий' })
  await expect.poll(async () => (await video(page))?.paused, { timeout: 12_000 }).toBe(false)
  expect((await video(page))!.t).toBeGreaterThanOrEqual(1.5)

  patchRoom(live, { playing: false, position: 4, at: Date.now(), actor: 'Ведущий' })
  await expect(page.getByRole('status').filter({ hasText: 'Ведущий: пауза' })).toBeVisible({ timeout: 12_000 })
  await expect.poll(async () => (await video(page))?.paused).toBe(true)
  await expect.poll(async () => Math.abs((await video(page))!.t - 4)).toBeLessThan(0.3)

  await expect(page.getByText('Пока тихо')).toBeVisible()
  live.messages.push({
    $id: 'm1',
    roomId: CODE,
    userId: 'u2',
    name: 'Аня',
    text: 'Какой опенинг!',
    kind: 'chat',
    t: 4,
    at: Date.now(),
  })
  await expect(page.locator('.chat__msg').filter({ hasText: 'Какой опенинг!' })).toContainText('0:04', { timeout: 12_000 })
  live.messages.push({
    $id: 'm2',
    roomId: CODE,
    userId: 'u2',
    name: 'Аня',
    text: '🔥',
    kind: 'reaction',
    t: 4,
    at: Date.now(),
  })
  await expect(page.locator('.burst')).toHaveCount(1, { timeout: 12_000 })
})

test('чат комнаты уходит через room-message и появляется на следующем опросе', async ({ page }) => {
  const live = createLive(baseRoom)
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'u2', name: 'Аня', email: 'a@example.com' })
  await page.goto(`/together/${CODE}`)
  await expect(page.getByLabel('Сообщение в чат')).toBeVisible()
  await page.getByLabel('Сообщение в чат').fill('Привет из комнаты')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.locator('.chat__msg').filter({ hasText: 'Привет из комнаты' })).toBeVisible({ timeout: 12_000 })
  expect(live.actions.some((a) => a.action === 'room-message' && a.kind === 'chat' && a.text === 'Привет из комнаты')).toBe(true)

  await page.getByRole('button', { name: 'Реакция 🔥' }).click()
  await expect(page.locator('.burst')).toHaveCount(1, { timeout: 12_000 })
  expect(live.actions.some((a) => a.action === 'room-message' && a.kind === 'reaction' && a.text === '🔥')).toBe(true)
})

test('гость без входа не может управлять: видео возвращается к комнате', async ({ page }) => {
  await installCoreRoom(page, createLive({ ...baseRoom, position: 3 }))
  await page.goto(`/together/${CODE}`)
  await page.locator('.together__gate input[type=file]').setInputFiles(clip)
  await page.getByRole('button', { name: /Присоединиться/ }).click()
  await expect.poll(async () => Math.abs((await video(page))!.t - 3)).toBeLessThan(0.3)
  await page.waitForTimeout(2000)
  await page.evaluate(() => document.querySelector('video')!.play())
  await expect(page.getByRole('status').filter({ hasText: 'Войдите, чтобы управлять' })).toBeVisible()
  await expect.poll(async () => (await video(page))?.paused).toBe(true)
})

test('ведущий в идущей комнате: плеер не шлёт комнате своё же эхо, видео идёт без перемоток по кругу', async ({ page }) => {
  const live = createLive({ ...baseRoom, source: 'trailer', videoId: 'pl-av-0', playing: true, position: 1, at: Date.now() })
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'host1', name: 'Ведущий', email: 'h@example.com' })
  await mockAnimeVost(page, 700)
  const controls = watchControls(page)
  await page.goto(`/together/${CODE}`)
  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  await expect.poll(async () => (await video(page))?.paused, { timeout: 8000 }).toBe(false)
  const seeks = await page.evaluate(() => {
    const v = document.querySelector('video')!
    let n = 0
    v.addEventListener('seeking', () => n++)
    return new Promise<number>((done) => setTimeout(() => done(n), 4500))
  })
  expect(seeks).toBeLessThanOrEqual(1)
  expect(controls).toEqual([])
})

test('комната с плеером Kodik: медленная перемотка не зацикливает синхронизацию', async ({ page }) => {
  const live = createLive({ ...baseRoom, source: 'trailer', videoId: 'pl-ax-29', playing: true, position: 30, at: Date.now() })
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'host1', name: 'Ведущий', email: 'h@example.com' })
  await mockKodikVoice(page)
  const controls = watchControls(page)
  await page.goto(`/together/${CODE}`)
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /kodikplayer\.com/)
  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  await page.waitForTimeout(9000)
  const commands = await page.frameLocator('iframe.player-iframe').locator('body').evaluate(() => (window as unknown as { commands?: number }).commands ?? 0)
  expect(commands).toBeLessThanOrEqual(4)
  const state = await kodikState(page)
  expect(state.playing).toBe(true)
  expect(state.t).toBeGreaterThan(34)
  expect(controls).toEqual([])
})

test('перемотка ведущего сразу после подстройки к комнате не теряется как «эхо»', async ({ page }) => {
  const live = createLive({ ...baseRoom, source: 'trailer', videoId: 'pl-ax-29', playing: true, position: 30, at: Date.now() })
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'host1', name: 'Ведущий', email: 'h@example.com' })
  await mockKodikVoice(page)
  const controls = watchControls(page)
  await page.goto(`/together/${CODE}`)
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /kodikplayer\.com/)
  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  await expect.poll(async () => (await kodikState(page)).t, { timeout: 8000 }).toBeGreaterThan(31)
  patchRoom(live, { position: 100, at: Date.now(), playing: true })
  await expect.poll(async () => (await kodikState(page)).t, { timeout: 12_000 }).toBeGreaterThan(99)
  await page.frameLocator('iframe.player-iframe').locator('body').evaluate(() => postMessage({ key: 'kodik_player_api', value: { method: 'seek', seconds: 300 } }, '*'))
  await expect.poll(() => controls.map((c) => Math.round(c.position ?? 0)), { timeout: 8000 }).toContain(300)
  expect(controls.some((c) => Math.abs((c.position ?? 0) - 100) < 2)).toBe(false)
})

test('две вкладки одной комнаты идут вровень: плей, перемотка и пауза через общий опрос', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'синхронизация одна и та же, хватает прогона на компьютере')
  test.setTimeout(120_000)
  const live = createLive({ ...baseRoom, source: 'trailer', videoId: 'pl-ax-29', playing: false, position: 0, at: Date.now() })
  live.controlDelay = 400
  const open = async (host: boolean, skew: number) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' })
    if (skew) await context.addInitScript((ms) => { const now = Date.now.bind(Date); Date.now = () => now() + ms }, skew)
    const page = await context.newPage()
    await mockServices(page)
    await mockKodikVoice(page)
    await installCoreRoom(page, live)
    if (host) await asUser(page, live, { $id: 'host1', name: 'Ведущий', email: 'h@example.com' })
    await page.goto(`/together/${CODE}`)
    await page.getByRole('button', { name: host ? /Начать просмотр/ : /Присоединиться/ }).click()
    await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /kodikplayer\.com/)
    return { page, context }
  }
  const a = await open(true, 0)
  const b = await open(false, 1700)
  try {
    await a.page.waitForTimeout(2000)
    const hostPresses = (method: string, extra = {}) =>
      a.page.frameLocator('iframe.player-iframe').locator('body').evaluate((_, [m, e]) => {
        const w = window as unknown as { commands?: number; state: () => { t: number } }
        postMessage({ key: 'kodik_player_api', value: { method: m, ...(e as object) } }, '*')
        return w.state().t
      }, [method, extra] as const)
    const gap = async () => {
      const [x, y] = await Promise.all([kodikState(a.page), kodikState(b.page)])
      return Math.abs(x.t - y.t)
    }
    await hostPresses('play')
    await expect.poll(async () => (await kodikState(b.page)).t, { timeout: 15_000 }).toBeGreaterThan(2)
    await expect.poll(gap, { timeout: 25_000, intervals: [500] }).toBeLessThan(0.3)
    await hostPresses('seek', { seconds: 300 })
    await expect.poll(async () => (await kodikState(b.page)).t, { timeout: 15_000 }).toBeGreaterThan(299)
    await expect.poll(gap, { timeout: 25_000, intervals: [500] }).toBeLessThan(0.3)
    await hostPresses('pause')
    await expect.poll(async () => (await kodikState(b.page)).playing, { timeout: 15_000 }).toBe(false)
    // Гость на часах +1.7 с. После паузы опрос фиксирует позицию с этим сдвигом, не до десятых как realtime.
    await expect.poll(gap, { timeout: 15_000, intervals: [500] }).toBeLessThan(1.5)
  } finally {
    await a.context.close()
    await b.context.close()
  }
})

test('закрытая комната показывает понятный экран', async ({ page }) => {
  await installCoreRoom(page, createLive(null))
  await page.goto('/together/ZZZ999')
  await expect(page.getByRole('heading', { name: 'Комната закрыта' })).toBeVisible()
})

test('кто в комнате обновляется следующим опросом списка', async ({ page }) => {
  const now = Date.now()
  const live = createLive(baseRoom, [
    { $id: 'a', roomId: CODE, userId: 'host1', name: 'Ведущий', voice: true, muted: false, at: now },
  ])
  await installCoreRoom(page, live)
  await page.goto(`/together/${CODE}`)
  const people = page.getByRole('region', { name: 'Кто в комнате' })
  await expect(people.getByText('Ведущий · ведущий')).toBeVisible()
  await expect(people.getByLabel('В голосовом чате')).toHaveCount(1)
  const hall = page.getByRole('img', { name: /В зале/ })
  await expect(hall.locator('.hall__seat--on')).toHaveCount(1)
  await expect(hall.locator('.hall__seat--host')).toHaveAttribute('title', 'Ведущий')

  live.members = [
    ...live.members,
    { $id: 'b', roomId: CODE, userId: 'u2', name: 'Аня', voice: true, muted: true, at: now },
  ]
  await expect(people.getByText('Аня')).toBeVisible({ timeout: 12_000 })
  await expect(people.getByLabel('Микрофон выключен')).toHaveCount(1)
  await expect(hall.locator('.hall__seat--on')).toHaveCount(2)
  await expect(hall.locator('.hall__seat[title="Аня"]')).toHaveText('А')

  live.members = live.members.filter((m) => m.userId !== 'u2')
  await expect(people.getByText('Аня')).toHaveCount(0, { timeout: 12_000 })
  await expect(hall.locator('.hall__seat--on')).toHaveCount(1)
})

test('сеанс по расписанию: обратный отсчёт и файл для календаря', async ({ page }) => {
  const startsAt = Date.now() + 90 * 60 * 1000
  await installCoreRoom(page, createLive({ ...baseRoom, startsAt }))
  await page.goto(`/together/${CODE}`)
  await expect(page.getByText(/через 1 ч (29|30) мин/)).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'В календарь' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe(`anime-life-${CODE}.ics`)
})

test('вкладка «Вместе»: сеансы по расписанию в разделе «Скоро»', async ({ page }) => {
  await installCoreRoom(page, createLive({ ...baseRoom, startsAt: Date.now() + 3 * 3600 * 1000 }))
  await page.goto('/together')
  await expect(page.getByRole('heading', { name: 'Скоро' })).toBeVisible()
  await expect(page.locator('.room-card--soon')).toContainText('через 3 ч')
})

test('плеер сайта в комнате: серия AnimeVost синхронизируется, ведущий выбирает озвучку', async ({ page }) => {
  const live = createLive({ ...baseRoom, source: 'trailer', videoId: 'pl-av-0' })
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'host1', name: 'Ведущий', email: 'h@example.com' })
  await mockAnimeVost(page)
  const stream = page.waitForRequest('https://video.animetop.info/720/1.mp4')
  await page.goto(`/together/${CODE}`)
  await stream
  await expect(page.getByText(/Ведущий: Ведущий · AnimeVost/)).toBeVisible()
  const picker = page.getByRole('region', { name: 'Плеер и озвучка' })
  await expect(picker.getByRole('button', { name: /AnimeVost/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.getByRole('button', { name: /AnimeVost/ })).toContainText('Играет')

  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  patchRoom(live, { source: 'trailer', videoId: 'pl-av-0', playing: true, position: 2, at: Date.now() })
  await expect.poll(async () => (await video(page))?.paused, { timeout: 12_000 }).toBe(false)
  expect((await video(page))!.t).toBeGreaterThanOrEqual(1.5)

  const control = page.waitForRequest((r) => r.url().includes('/api/core/action') && (r.postData() ?? '').includes('room-control'))
  await page.getByLabel('Выбрать серию').selectOption('2')
  const sent = (await control).postDataJSON() as { action?: string; episode?: number }
  expect(sent).toMatchObject({ action: 'room-control', episode: 2, playing: false, position: 0 })
})

test('ведущий выбирает озвучку карточкой: вкладки, выбор уходит всей комнате', async ({ page }) => {
  const live = createLive({ ...baseRoom, source: 'trailer', videoId: 'pl-av-0' })
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'host1', name: 'Ведущий', email: 'h@example.com' })
  await mockAnimeVost(page)
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({
      json: {
        code: 0,
        types: [
          { id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 },
          { id: 46, name: 'Субтитры | CR', is_sub: true, episodes_count: 20 },
        ],
      },
    }),
  )
  await page.goto(`/together/${CODE}`)
  const picker = page.getByRole('region', { name: 'Плеер и озвучка' })
  await expect(picker.getByRole('button', { name: /AnimeVost/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.getByRole('button', { name: /Studio Band/ })).toContainText('Anixart · 26 эп.')
  await expect(picker.getByRole('button', { name: /^CR/ })).toHaveCount(0)
  await picker.getByRole('button', { name: /Субтитры/ }).click()
  await expect(picker.getByRole('button', { name: /^CR/ })).toBeVisible()
  await picker.getByRole('button', { name: /Озвучка/ }).click()

  const control = page.waitForRequest((r) => r.url().includes('/api/core/action') && (r.postData() ?? '').includes('room-control'))
  await picker.getByRole('button', { name: /Studio Band/ }).click()
  const sent = (await control).postDataJSON()
  expect(sent).toMatchObject({ action: 'room-control', videoId: 'pl-ax-29', playing: false, position: 0 })
})

test('гость в комнате «управляют все» меняет озвучку посреди серии: время и плей сохраняются', async ({ page }) => {
  const live = createLive({ ...baseRoom, controlAll: true, source: 'trailer', videoId: 'pl-av-0', playing: true, position: 3, at: Date.now() })
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'u2', name: 'Аня', email: 'a@example.com' })
  await mockAnimeVost(page)
  await page.route(/api\.anixart\.tv\/search/, (route) =>
    route.fulfill({ json: { code: 0, content: [{ id: 31, title_ru: 'Ковбой Бибоп', title_original: 'Cowboy Bebop', year: '1998' }] } }),
  )
  await page.route(/api\.anixart\.tv\/episode\/31$/, (route) =>
    route.fulfill({ json: { code: 0, types: [{ id: 29, name: 'Studio Band', is_sub: false, episodes_count: 26 }] } }),
  )
  await page.goto(`/together/${CODE}`)
  const picker = page.getByRole('region', { name: 'Плеер и озвучка' })
  await expect(picker.getByRole('button', { name: /AnimeVost/ })).toHaveAttribute('aria-pressed', 'true')

  const control = page.waitForRequest((r) => r.url().includes('/api/core/action') && (r.postData() ?? '').includes('room-control'))
  await picker.getByRole('button', { name: /Studio Band/ }).click()
  const sent = (await control).postDataJSON() as { position?: number }
  expect(sent).toMatchObject({ action: 'room-control', videoId: 'pl-ax-29', playing: true })
  expect(sent.position).toBeGreaterThan(2.5)
})

test('гость без права управлять не видит выбор озвучки', async ({ page }) => {
  const live = createLive({ ...baseRoom, source: 'trailer', videoId: 'pl-av-0' })
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'u2', name: 'Аня', email: 'a@example.com' })
  await mockAnimeVost(page)
  await page.goto(`/together/${CODE}`)
  await expect(page.getByText(/Ведущий: Ведущий · AnimeVost/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Плеер и озвучка' })).toHaveCount(0)
})

test('шумоподавление выбирается до входа, сильное собирает RNNoise и шумовые ворота', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const out = ctx.createMediaStreamDestination()
      osc.connect(out)
      osc.start()
      return out.stream
    }
    const w = window as unknown as { worklets: string[] }
    w.worklets = []
    const add = AudioWorklet.prototype.addModule
    AudioWorklet.prototype.addModule = async function (url, options) {
      await add.call(this, url, options)
      w.worklets.push(String(url))
    }
  })
  const live = createLive(baseRoom)
  await installCoreRoom(page, live)
  await asUser(page, live, { $id: 'host1', name: 'Ведущий', email: 'h@example.com' })
  await page.goto(`/together/${CODE}`)
  const people = page.getByRole('region', { name: 'Кто в комнате' })
  const noise = people.getByLabel('Шумоподавление микрофона')
  await expect(noise).toHaveValue('strong')
  await noise.selectOption('browser')
  await noise.selectOption('strong')
  await people.getByRole('button', { name: 'Голосовой чат' }).click()
  await expect(people.getByRole('button', { name: 'Выйти из голоса' })).toBeVisible()
  const worklets = () => page.evaluate(() => new Set((window as unknown as { worklets: string[] }).worklets).size)
  await expect.poll(worklets).toBe(2)
  await expect(noise).toHaveValue('strong')
  await expect(page.getByText('Сильное шумоподавление не запустилось')).toHaveCount(0)
})
