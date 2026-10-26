import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'
import { clsOf, inpOf } from '../src/data/vitals'

// Качество у зрителей: скорость загрузки (LCP, CLS, INP) и плеер — в статистику администратора.

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('CLS по окнам сдвигов и INP с отбрасыванием редких выбросов', ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'без браузера, достаточно одного прогона')
  // Два окна: 0.05+0.04 (паузы меньше секунды) и отдельный сдвиг 0.08 через 3 секунды; сдвиг после ввода не в счёт.
  expect(clsOf([
    { value: 0.05, startTime: 100 },
    { value: 0.04, startTime: 600 },
    { value: 0.5, startTime: 700, hadRecentInput: true },
    { value: 0.08, startTime: 3600 },
  ])).toBeCloseTo(0.09)
  expect(inpOf([])).toBeUndefined()
  expect(inpOf([80, 300, 120])).toBe(300)
  // 100 взаимодействий: два самых долгих отбрасываем.
  expect(inpOf([...Array.from({ length: 98 }, () => 50), 900, 1000])).toBe(50)
})

test('замер скорости уходит один раз, когда вкладку прячут', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    if (body.action === 'quality-track') sent.push(body)
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: '{"ok":true}' } })
  })
  await page.addInitScript(() => ((window as Window & { __reportQuality?: boolean }).__reportQuality = true))
  await page.goto('/')
  await expect(page.locator('.hero, main').first()).toBeVisible()
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toMatchObject({ kind: 'vitals', cls: expect.any(Number) })
  expect(sent[0].lcp).toBeGreaterThan(0)
  expect(['mobile', 'tablet', 'desktop']).toContain(sent[0].device)
})

test('администратор видит качество у зрителей: серии, источники, скорость', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'u1', name: 'Miluoky', email: 'u@example.test', labels: ['admin'], prefs: {} } }),
  )
  const metrics = {
    episode: { good: 90, mid: 6, poor: 4, total: 0 },
    'src-kodik': { good: 95, mid: 0, poor: 5, total: 0 },
    'src-anilibria': { good: 40, mid: 0, poor: 10, total: 0 },
    'lcp-mobile': { good: 60, mid: 30, poor: 10, total: 280_000 },
    'cls-desktop': { good: 9, mid: 1, poor: 0, total: 300 },
  }
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    // Общую статистику здесь не проверяем: карточка качества грузится сама по себе.
    if (body.action === 'analytics-stats') return route.fulfill({ status: 201, json: { responseStatusCode: 500, responseBody: '{"error":"нет"}' } })
    const reply = body.action === 'quality-stats' ? { days: 7, metrics } : body.action === 'error-list' ? { errors: [] } : { ok: true }
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify(reply) } })
  })
  await page.goto('/admin/analytics')
  const card = page.getByRole('region', { name: 'Качество у зрителей (7 дней)' })
  await expect(card.getByText('пошли с первого плеера')).toBeVisible()
  await expect(card.locator('.an-quality__lead .an-bad')).toHaveText('4%')
  await expect(card.getByText('Kodik')).toBeVisible()
  await expect(card.getByText('20% сбоев · 50')).toHaveClass(/an-bad/)
  await expect(card.getByText('Загрузка (LCP), телефоны')).toBeVisible()
  await expect(card.getByText('60% хорошо · в среднем 2.8 с')).toBeVisible()
  await expect(card.getByText('90% хорошо · в среднем 0.03')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('сбой плеера: «серии нет в источнике» не сбой, сломанный поток — сбой с причиной в ошибках', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    if (body.action === 'quality-track' || body.action === 'error-report') sent.push(body)
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: '{"ok":true}' } })
  })
  await page.addInitScript(() => {
    const w = window as Window & { __reportQuality?: boolean; __reportErrors?: boolean }
    w.__reportQuality = w.__reportErrors = true
  })
  // Релиза AniLibria с этим id нет (заготовка mocks отдаёт пустой поиск): серия честно недоступна.
  await page.goto('/watch/1/1')
  await expect(page.getByText(/вот трейлер/)).toBeVisible()
  await page.waitForTimeout(2000)
  expect(sent.filter((b) => b.kind === 'player' || b.action === 'error-report')).toEqual([])

  // Релиз есть, а плейлист отвечает 404: это сбой AniLibria, и причина видна администратору.
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
  await page.route(/anilibria\.top\/api\/v1\/app\/search\/releases/, (route) => route.fulfill({ json: fixture('anilibria-search') }))
  await page.route(/anilibria\.top\/api\/v1\/anime\/releases\/8443$/, (route) => route.fulfill({ json: fixture('anilibria-release') }))
  await page.route(/cache\.libria\.fun\/.*/, (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/watch/1/2')
  await expect.poll(() => sent.find((b) => b.kind === 'player')).toMatchObject({ source: 'anilibria', ok: false })
  await expect.poll(() => sent.find((b) => b.action === 'error-report')?.message).toMatch(/^PlayerError: anilibria: Не удалось воспроизвести серию/)
})
