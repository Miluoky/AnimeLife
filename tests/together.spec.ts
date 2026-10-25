import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mockServices } from './mocks'
import { pressedAt } from '../functions/community/src/rooms.js'

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

/**
 * Комната на подставном Appwrite: строка комнаты, пустой чат, часы сервера и Realtime.
 * Возвращает функцию, которая «присылает» событие так, будто его отправил сервер.
 */
async function mockRoom(page: Page, room: Record<string, unknown> | null, members: Record<string, unknown>[] = []) {
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/members\/rows\?.*/, (route) =>
    route.fulfill({ json: { total: members.length, rows: members } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/rooms\/rows\/.*/, (route) =>
    room ? route.fulfill({ json: room }) : route.fulfill({ status: 404, json: { message: 'Row not found' } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/(messages|rooms)\/rows\?.*/, (route) =>
    route.fulfill({ json: { total: room ? 1 : 0, rows: room ? [room] : [] } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) =>
    route.fulfill({
      status: 201,
      json: { responseStatusCode: 200, responseBody: JSON.stringify({ serverNow: Date.now() }) },
    }),
  )
  let socket: WebSocketRoute | undefined
  await page.routeWebSocket(/realtime/, (ws) => {
    socket = ws
    ws.send(JSON.stringify({ type: 'connected', data: { channels: [], subscriptions: [], user: null } }))
    ws.onMessage((m) => {
      const msg = JSON.parse(String(m))
      if (msg.type === 'subscribe')
        ws.send(JSON.stringify({ type: 'response', data: { to: 'subscribe', success: true, subscriptions: msg.data } }))
    })
  })
  return async (table: 'rooms' | 'messages', payload: Record<string, unknown>, action = 'update') => {
    await expect.poll(() => !!socket).toBe(true)
    const row = `databases.anime.tables.${table}.rows.${payload.$id}`
    socket!.send(
      JSON.stringify({
        type: 'event',
        data: {
          events: [`${row}.${action}`],
          channels: [`databases.anime.tables.${table}.rows`, row],
          timestamp: new Date().toISOString(),
          payload,
        },
      }),
    )
  }
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
  // Как настоящий сервер с роликами: отдаёт куски по Range, иначе браузер не даст перемотать.
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

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('вкладка «Вместе»: открытые комнаты и вход по коду', async ({ page }) => {
  await mockRoom(page, baseRoom)
  await page.goto('/together')
  await expect(page.getByRole('link', { name: /Смотрим первую серию/ })).toBeVisible()
  await page.getByLabel('Код комнаты').fill(CODE.toLowerCase())
  await page.getByRole('button', { name: 'Войти в комнату' }).click()
  await expect(page).toHaveURL(new RegExp(`/together/${CODE}$`))
  await expect(page.getByRole('heading', { name: /Смотрим первую серию/ })).toBeVisible()
})

test('вкладка «Вместе» на телефоне 390px: страница не шире экрана, нижнее меню видно', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockRoom(page, baseRoom)
  await page.goto('/together')
  await expect(page.getByRole('link', { name: /Смотрим первую серию/ })).toBeVisible()
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(client)
  if (isMobile) await expect(page.locator('.dock')).toBeInViewport()
})

test('комната: плей, пауза и перемотка ведущего доходят до гостя, чат и реакции живые', async ({ page }) => {
  const push = await mockRoom(page, baseRoom)
  await page.goto(`/together/${CODE}`)
  await page.locator('.together__gate input[type=file]').setInputFiles(clip)
  await page.getByRole('button', { name: /Присоединиться/ }).click()
  await expect.poll(async () => (await video(page))?.paused).toBe(true)

  // Ведущий нажал плей с 2-й секунды.
  await push('rooms', { ...baseRoom, playing: true, position: 2, at: Date.now() })
  await expect.poll(async () => (await video(page))?.paused, { timeout: 5000 }).toBe(false)
  expect((await video(page))!.t).toBeGreaterThanOrEqual(1.5)

  // Пауза на 4-й секунде: видео встаёт ровно туда.
  await push('rooms', { ...baseRoom, playing: false, position: 4, at: Date.now(), actor: 'Ведущий' })
  await expect.poll(async () => (await video(page))?.paused).toBe(true)
  await expect.poll(async () => Math.abs((await video(page))!.t - 4)).toBeLessThan(0.3)
  await expect(page.getByRole('status').filter({ hasText: 'Ведущий: пауза' })).toBeVisible()

  await push('messages', { $id: 'm1', roomId: CODE, userId: 'u2', name: 'Аня', text: 'Какой опенинг!', kind: 'chat', t: 4, at: Date.now() }, 'create')
  await expect(page.locator('.chat__msg').filter({ hasText: 'Какой опенинг!' })).toContainText('0:04')
  await push('messages', { $id: 'm2', roomId: CODE, userId: 'u2', name: 'Аня', text: '🔥', kind: 'reaction', t: 4, at: Date.now() }, 'create')
  await expect(page.locator('.burst')).toHaveCount(1)
})

test('гость без входа не может управлять: видео возвращается к комнате', async ({ page }) => {
  await mockRoom(page, { ...baseRoom, position: 3 })
  await page.goto(`/together/${CODE}`)
  await page.locator('.together__gate input[type=file]').setInputFiles(clip)
  await page.getByRole('button', { name: /Присоединиться/ }).click()
  await expect.poll(async () => Math.abs((await video(page))!.t - 3)).toBeLessThan(0.3)
  // Через две секунды после подстройки: действия плеера в первые мгновения считаются эхом команды комнаты.
  await page.waitForTimeout(2000)
  await page.evaluate(() => document.querySelector('video')!.play())
  await expect(page.getByRole('status').filter({ hasText: 'Войдите, чтобы управлять' })).toBeVisible()
  await expect.poll(async () => (await video(page))?.paused).toBe(true)
})

test('ведущий в идущей комнате: плеер не шлёт комнате своё же эхо, видео идёт без перемоток по кругу', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'host1', name: 'Ведущий', email: 'h@example.com', labels: [], prefs: {}, status: true } }),
  )
  // Медленный видеосервер: после перемотки поток догружается почти секунду.
  await mockRoom(page, { ...baseRoom, source: 'trailer', videoId: 'pl-av-0', playing: true, position: 1, at: Date.now() })
  await mockAnimeVost(page, 700)
  const controls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/functions/community/executions') && (r.postData() ?? '').includes('room-control')) controls.push(r.postData()!)
  })
  await page.goto(`/together/${CODE}`)
  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  await expect.poll(async () => (await video(page))?.paused, { timeout: 5000 }).toBe(false)
  const seeks = await page.evaluate(() => {
    const v = document.querySelector('video')!
    let n = 0
    v.addEventListener('seeking', () => n++)
    return new Promise<number>((done) => setTimeout(() => done(n), 4500))
  })
  expect(seeks).toBeLessThanOrEqual(1)
  expect(controls).toEqual([])
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

/** Тайтл с озвучкой Anixart, серия которой открывается в (поддельном) плеере Kodik. */
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

test('комната с плеером Kodik: медленная перемотка не зацикливает синхронизацию', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'host1', name: 'Ведущий', email: 'h@example.com', labels: [], prefs: {}, status: true } }),
  )
  await mockRoom(page, { ...baseRoom, source: 'trailer', videoId: 'pl-ax-29', playing: true, position: 30, at: Date.now() })
  await mockKodikVoice(page)
  const controls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/functions/community/executions') && (r.postData() ?? '').includes('room-control')) controls.push(r.postData()!)
  })
  await page.goto(`/together/${CODE}`)
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /kodikplayer\.com/)
  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  await page.waitForTimeout(9000)
  const commands = await page.frameLocator('iframe.player-iframe').locator('body').evaluate(() => (window as unknown as { commands?: number }).commands ?? 0)
  // Включили и перемотали к комнате, может быть один повтор — но не десятки команд по кругу.
  expect(commands).toBeLessThanOrEqual(4)
  // И при этом видео идёт вместе с комнатой: с 30-й секунды прошло около девяти.
  const state = await kodikState(page)
  expect(state.playing).toBe(true)
  expect(state.t).toBeGreaterThan(34)
  expect(controls).toEqual([])
})

test('перемотка ведущего сразу после подстройки к комнате не теряется как «эхо»', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'host1', name: 'Ведущий', email: 'h@example.com', labels: [], prefs: {}, status: true } }),
  )
  const start = { ...baseRoom, source: 'trailer', videoId: 'pl-ax-29', playing: true, position: 30, at: Date.now() }
  const push = await mockRoom(page, start)
  await mockKodikVoice(page)
  const controls: { playing: boolean; position: number }[] = []
  page.on('request', (r) => {
    const body = r.url().includes('/functions/community/executions') && JSON.parse(JSON.parse(r.postData() ?? '{}').body ?? '{}')
    if (body?.action === 'room-control') controls.push(body)
  })
  await page.goto(`/together/${CODE}`)
  await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /kodikplayer\.com/)
  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  await expect.poll(async () => (await kodikState(page)).t, { timeout: 8000 }).toBeGreaterThan(31)
  // Комната ушла на 100-ю секунду: плеер сам перематывается туда (это эхо, в комнату не уходит)…
  await push('rooms', { ...start, position: 100, at: Date.now() })
  await expect.poll(async () => (await kodikState(page)).t, { timeout: 3000 }).toBeGreaterThan(99)
  // …и тут же ведущий сам перематывает в плеере на 300-ю: это его действие, комната должна перейти туда.
  await page.frameLocator('iframe.player-iframe').locator('body').evaluate(() => postMessage({ key: 'kodik_player_api', value: { method: 'seek', seconds: 300 } }, '*'))
  await expect.poll(() => controls.map((c) => Math.round(c.position)), { timeout: 3000 }).toContain(300)
  expect(controls.some((c) => Math.abs(c.position - 100) < 2)).toBe(false)
})

test('две вкладки одной комнаты идут вровень: плей, перемотка и пауза с задержками сервера и сбитыми часами', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'синхронизация одна и та же, хватает прогона на компьютере')
  test.setTimeout(90_000)
  // Общий «сервер» на две вкладки: функция отвечает почти секунду, Realtime доходит до вкладок по-разному,
  // часы у второго устройства спешат на 1,7 секунды. Момент нажатия сервер берёт так же, как настоящий.
  let room: Record<string, unknown> = { ...baseRoom, source: 'trailer', videoId: 'pl-ax-29', playing: false, position: 0, at: Date.now() }
  const pushes: Array<(payload: Record<string, unknown>) => Promise<void>> = []
  const open = async (host: boolean, skew: number, delay: number) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' })
    if (skew) await context.addInitScript((ms) => { const now = Date.now.bind(Date); Date.now = () => now() + ms }, skew)
    const page = await context.newPage()
    await mockServices(page)
    await mockKodikVoice(page)
    const push = await mockRoom(page, room)
    await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/rooms\/rows\/.*/, (route) => route.fulfill({ json: room }))
    await page.route(/\/api\/time$/, (route) => route.fulfill({ json: { now: Date.now() } }))
    if (host)
      await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
        route.fulfill({ json: { $id: 'host1', name: 'Ведущий', email: 'h@example.com', labels: [], prefs: {}, status: true } }),
      )
    await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, async (route) => {
      const body = JSON.parse(JSON.parse(route.request().postData()!).body)
      await new Promise((done) => setTimeout(done, 600))
      if (body.action === 'room-control') {
        room = { ...room, playing: body.playing, position: body.position, at: pressedAt(body.at, Date.now()), actor: 'Ведущий' }
        const payload = room
        setTimeout(() => pushes.forEach((p) => void p(payload)), 200)
      }
      await route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify({ ok: true, serverNow: Date.now() }) } })
    })
    pushes.push((payload) => new Promise((done) => setTimeout(() => void push('rooms', payload).then(done), delay)))
    await page.goto(`/together/${CODE}`)
    await page.getByRole('button', { name: host ? /Начать просмотр/ : /Присоединиться/ }).click()
    await expect(page.locator('iframe.player-iframe')).toHaveAttribute('src', /kodikplayer\.com/)
    return page
  }
  const a = await open(true, 0, 100)
  const b = await open(false, 1700, 300)
  await a.waitForTimeout(2000)
  // Ведущий жмёт в самом плеере Kodik: плеер сообщает о плее, сайт рассылает комнате.
  const hostPresses = (method: string, extra = {}) =>
    a.frameLocator('iframe.player-iframe').locator('body').evaluate((_, [m, e]) => {
      const w = window as unknown as { commands?: number; state: () => { t: number } }
      postMessage({ key: 'kodik_player_api', value: { method: m, ...(e as object) } }, '*')
      return w.state().t
    }, [method, extra] as const)
  const gap = async () => {
    const [x, y] = await Promise.all([kodikState(a), kodikState(b)])
    return Math.abs(x.t - y.t)
  }
  await hostPresses('play')
  await expect.poll(async () => (await kodikState(b)).t, { timeout: 8000 }).toBeGreaterThan(2)
  await expect.poll(gap, { timeout: 20_000, intervals: [500] }).toBeLessThan(0.3)
  await hostPresses('seek', { seconds: 300 })
  await expect.poll(async () => (await kodikState(b)).t, { timeout: 5000 }).toBeGreaterThan(299)
  await expect.poll(gap, { timeout: 20_000, intervals: [500] }).toBeLessThan(0.3)
  await hostPresses('pause')
  await expect.poll(async () => (await kodikState(b)).playing, { timeout: 5000 }).toBe(false)
  await expect.poll(gap, { timeout: 5000, intervals: [500] }).toBeLessThan(0.3)
})

test('закрытая комната показывает понятный экран', async ({ page }) => {
  await mockRoom(page, null)
  await page.goto('/together/ZZZ999')
  await expect(page.getByRole('heading', { name: 'Комната закрыта' })).toBeVisible()
})

test('кто в комнате и кто в голосовом чате, список обновляется живьём', async ({ page }) => {
  const now = Date.now()
  const push = await mockRoom(page, baseRoom, [
    { $id: 'a', roomId: CODE, userId: 'host1', name: 'Ведущий', voice: true, muted: false, at: now },
  ])
  await page.goto(`/together/${CODE}`)
  const people = page.getByRole('region', { name: 'Кто в комнате' })
  await expect(people.getByText('Ведущий · ведущий')).toBeVisible()
  await expect(people.getByLabel('В голосовом чате')).toHaveCount(1)
  // Кинозал под экраном: ведущий сидит в центре первого ряда, кресло горит золотым.
  const hall = page.getByRole('img', { name: /В зале/ })
  await expect(hall.locator('.hall__seat--on')).toHaveCount(1)
  await expect(hall.locator('.hall__seat--host')).toHaveAttribute('title', 'Ведущий')
  await push('members', { $id: 'b', roomId: CODE, userId: 'u2', name: 'Аня', voice: true, muted: true, at: now }, 'create')
  await expect(people.getByText('Аня')).toBeVisible()
  await expect(people.getByLabel('Микрофон выключен')).toHaveCount(1)
  // Новый зритель занимает соседнее кресло, и оно загорается.
  await expect(hall.locator('.hall__seat--on')).toHaveCount(2)
  await expect(hall.locator('.hall__seat[title="Аня"]')).toHaveText('А')
  await push('members', { $id: 'b', roomId: CODE, userId: 'u2', name: 'Аня', voice: false, muted: false, at: now }, 'delete')
  await expect(people.getByText('Аня')).toHaveCount(0)
  await expect(hall.locator('.hall__seat--on')).toHaveCount(1)
})

test('сеанс по расписанию: обратный отсчёт и файл для календаря', async ({ page }) => {
  const startsAt = Date.now() + 90 * 60 * 1000
  await mockRoom(page, { ...baseRoom, startsAt })
  await page.goto(`/together/${CODE}`)
  await expect(page.getByText(/через 1 ч (29|30) мин/)).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'В календарь' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe(`anime-life-${CODE}.ics`)
})

test('вкладка «Вместе»: сеансы по расписанию в разделе «Скоро»', async ({ page }) => {
  await mockRoom(page, { ...baseRoom, startsAt: Date.now() + 3 * 3600 * 1000 })
  await page.goto('/together')
  await expect(page.getByRole('heading', { name: 'Скоро' })).toBeVisible()
  await expect(page.locator('.room-card--soon')).toContainText('через 3 ч')
})

test('плеер сайта в комнате: серия AnimeVost синхронизируется, ведущий выбирает озвучку', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'host1', name: 'Ведущий', email: 'h@example.com', labels: [], prefs: {}, status: true } }),
  )
  const push = await mockRoom(page, { ...baseRoom, source: 'trailer', videoId: 'pl-av-0' })
  await mockAnimeVost(page)
  const stream = page.waitForRequest('https://video.animetop.info/720/1.mp4')
  await page.goto(`/together/${CODE}`)
  await stream
  await expect(page.getByText(/Ведущий: Ведущий · AnimeVost/)).toBeVisible()
  // Плеер и озвучка карточками: играющая отмечена «Играет».
  const picker = page.getByRole('region', { name: 'Плеер и озвучка' })
  await expect(picker.getByRole('button', { name: /AnimeVost/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.getByRole('button', { name: /AnimeVost/ })).toContainText('Играет')

  await page.getByRole('button', { name: /Начать просмотр/ }).click()
  await push('rooms', { ...baseRoom, source: 'trailer', videoId: 'pl-av-0', playing: true, position: 2, at: Date.now() })
  await expect.poll(async () => (await video(page))?.paused, { timeout: 5000 }).toBe(false)
  expect((await video(page))!.t).toBeGreaterThanOrEqual(1.5)

  // Вторая серия по выбору из списка: в комнату уходит номер серии.
  const control = page.waitForRequest((r) => r.url().includes('/functions/community/executions') && (r.postData() ?? '').includes('room-control'))
  await page.getByLabel('Выбрать серию').selectOption('2')
  const sent = JSON.parse(JSON.parse((await control).postData()!).body)
  expect(sent).toMatchObject({ action: 'room-control', episode: 2, playing: false, position: 0 })
})

test('ведущий выбирает озвучку карточкой: вкладки, выбор уходит всей комнате', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'host1', name: 'Ведущий', email: 'h@example.com', labels: [], prefs: {}, status: true } }),
  )
  await mockRoom(page, { ...baseRoom, source: 'trailer', videoId: 'pl-av-0' })
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
  // Субтитры на своей вкладке.
  await expect(picker.getByRole('button', { name: /^CR/ })).toHaveCount(0)
  await picker.getByRole('button', { name: /Субтитры/ }).click()
  await expect(picker.getByRole('button', { name: /^CR/ })).toBeVisible()
  await picker.getByRole('button', { name: /Озвучка/ }).click()

  const control = page.waitForRequest((r) => r.url().includes('/functions/community/executions') && (r.postData() ?? '').includes('room-control'))
  await picker.getByRole('button', { name: /Studio Band/ }).click()
  const sent = JSON.parse(JSON.parse((await control).postData()!).body)
  expect(sent).toMatchObject({ action: 'room-control', videoId: 'pl-ax-29', playing: false, position: 0 })
})

test('гость в комнате «управляют все» меняет озвучку посреди серии: время и плей сохраняются', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'u2', name: 'Аня', email: 'a@example.com', labels: [], prefs: {}, status: true } }),
  )
  const room = { ...baseRoom, controlAll: true, source: 'trailer', videoId: 'pl-av-0', playing: true, position: 3, at: Date.now() }
  await mockRoom(page, room)
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

  const control = page.waitForRequest((r) => r.url().includes('/functions/community/executions') && (r.postData() ?? '').includes('room-control'))
  await picker.getByRole('button', { name: /Studio Band/ }).click()
  const sent = JSON.parse(JSON.parse((await control).postData()!).body)
  expect(sent).toMatchObject({ action: 'room-control', videoId: 'pl-ax-29', playing: true })
  expect(sent.position).toBeGreaterThan(2.5)
})

test('гость без права управлять не видит выбор озвучки', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'u2', name: 'Аня', email: 'a@example.com', labels: [], prefs: {}, status: true } }),
  )
  await mockRoom(page, { ...baseRoom, source: 'trailer', videoId: 'pl-av-0' })
  await mockAnimeVost(page)
  await page.goto(`/together/${CODE}`)
  await expect(page.getByText(/Ведущий: Ведущий · AnimeVost/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Плеер и озвучка' })).toHaveCount(0)
})

test('шумоподавление выбирается до входа, сильное собирает RNNoise и шумовые ворота', async ({ page }) => {
  // Микрофон — тихий синус из Web Audio: настоящего устройства в браузере тестов нет.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const out = ctx.createMediaStreamDestination()
      osc.connect(out)
      osc.start()
      return out.stream
    }
    // Запоминаем модули AudioWorklet, которые загрузились без ошибки.
    const w = window as unknown as { worklets: string[] }
    w.worklets = []
    const add = AudioWorklet.prototype.addModule
    AudioWorklet.prototype.addModule = async function (url, options) {
      await add.call(this, url, options)
      w.worklets.push(String(url))
    }
  })
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'host1', name: 'Ведущий', email: 'h@example.com', labels: [], prefs: {}, status: true } }),
  )
  await mockRoom(page, baseRoom)
  await page.goto(`/together/${CODE}`)
  const people = page.getByRole('region', { name: 'Кто в комнате' })
  const noise = people.getByLabel('Шумоподавление микрофона')
  // До входа в голос режим уже виден и запоминается.
  await expect(noise).toHaveValue('strong')
  await noise.selectOption('browser')
  await noise.selectOption('strong')
  await people.getByRole('button', { name: 'Голосовой чат' }).click()
  await expect(people.getByRole('button', { name: 'Выйти из голоса' })).toBeVisible()
  // Нейросеть и ворота — два отдельных модуля AudioWorklet, оба загрузились.
  const worklets = () => page.evaluate(() => new Set((window as unknown as { worklets: string[] }).worklets).size)
  await expect.poll(worklets).toBe(2)
  await expect(noise).toHaveValue('strong')
  await expect(page.getByText('Сильное шумоподавление не запустилось')).toHaveCount(0)
})
