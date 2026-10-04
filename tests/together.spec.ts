import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mockServices } from './mocks'

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
  if (isMobile) await expect(page.locator('.bottom-nav')).toBeInViewport()
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
  // Через секунду после подстройки: действия плеера в первые мгновения считаются эхом команды комнаты.
  await page.waitForTimeout(1000)
  await page.evaluate(() => document.querySelector('video')!.play())
  await expect(page.getByRole('status').filter({ hasText: 'Войдите, чтобы управлять' })).toBeVisible()
  await expect.poll(async () => (await video(page))?.paused).toBe(true)
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
  await push('members', { $id: 'b', roomId: CODE, userId: 'u2', name: 'Аня', voice: true, muted: true, at: now }, 'create')
  await expect(people.getByText('Аня')).toBeVisible()
  await expect(people.getByLabel('Микрофон выключен')).toHaveCount(1)
  await push('members', { $id: 'b', roomId: CODE, userId: 'u2', name: 'Аня', voice: false, muted: false, at: now }, 'delete')
  await expect(people.getByText('Аня')).toHaveCount(0)
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
  await page.route(/api\.animevost\.org\/v1\/search/, (route) =>
    route.fulfill({ json: { state: { status: 'ok' }, data: [{ id: 8, title: 'Ковбой Бибоп / Cowboy Bebop [1-26 из 26]', year: '1998' }] } }),
  )
  await page.route(/api\.animevost\.org\/v1\/playlist/, (route) =>
    route.fulfill({ json: [1, 2].map((n) => ({ name: `${n} серия`, hd: `http://video.animetop.info/720/${n}.mp4` })) }),
  )
  const body = readFileSync(clip)
  // Как настоящий сервер с роликами: отдаёт куски по Range, иначе браузер не даст перемотать.
  await page.route(/video\.animetop\.info\/.*/, (route) => {
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
  const stream = page.waitForRequest('https://video.animetop.info/720/1.mp4')
  await page.goto(`/together/${CODE}`)
  await stream
  await expect(page.getByText(/Ведущий: Ведущий · AnimeVost/)).toBeVisible()
  const picker = page.getByLabel('Плеер и озвучка')
  await expect(picker).toHaveValue('pl-av-0')

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
