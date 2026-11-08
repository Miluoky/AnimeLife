import { expect, test, type Page } from '@playwright/test'
import { mockServices } from './mocks'

const bebop = { id: '1', title: 'Ковбой Бибоп', kind: 'TV', episodes: 26, ongoing: false, posterFill: '#333' }

/** Разрешение + поддельный PushManager: e2e без настоящего push-сервера браузера. */
async function mockPushOff(page: Page) {
  await page.addInitScript(() => {
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
      expirationTime: null,
      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: null,
          keys: { p256dh: 'dGVzdC1wMjU2ZGg', auth: 'dGVzdC1hdXRo' },
        }
      },
      unsubscribe: async () => true,
    }
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' })
    Notification.requestPermission = async () => 'granted'
    const fakeReg = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => sub,
      },
      showNotification: async () => undefined,
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => fakeReg,
        ready: Promise.resolve(fakeReg),
      },
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('пуши «Смотрю»: включение шлёт push-subscribe с id из списка и даёт пример', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'подписка одна и та же на телефоне')
  await page.addInitScript((entry) => {
    localStorage.setItem('anime.mylist.v1', JSON.stringify([{ anime: entry, status: 'watching', addedAt: 1 }]))
  }, bebop)
  await mockPushOff(page)

  const subscribed: unknown[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, async (route) => {
    const raw = route.request().postData() ?? ''
    let body: { action?: string; animeIds?: string[] } = {}
    try {
      body = JSON.parse(JSON.parse(raw).body)
    } catch {
      body = {}
    }
    if (body.action === 'push-subscribe') subscribed.push(body)
    await route.fulfill({
      status: 201,
      json: { responseStatusCode: 200, responseBody: JSON.stringify({ ok: true, count: body.animeIds?.length ?? 0 }) },
    })
  })

  await page.goto('/account#notify')
  await expect(page.getByRole('heading', { name: 'Уведомления о новых сериях' })).toBeVisible()
  await page.getByRole('button', { name: 'Включить' }).click()
  await expect.poll(() => subscribed.length).toBe(1)
  expect(subscribed[0]).toMatchObject({ action: 'push-subscribe', animeIds: ['1'] })
  await expect(page.getByRole('button', { name: 'Выключить' })).toBeVisible()
  await page.getByRole('button', { name: 'Показать пример' }).click()
  await expect(page.getByRole('status')).toContainText(/Пример показан/)
})

test('пуши «Смотрю»: без тайтлов после включения — ссылка в библиотеку', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'один прогон')
  await mockPushOff(page)
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, async (route) => {
    await route.fulfill({
      status: 201,
      json: { responseStatusCode: 200, responseBody: JSON.stringify({ ok: true, count: 0 }) },
    })
  })
  await page.goto('/account#notify')
  await page.getByRole('button', { name: 'Включить' }).click()
  await expect(page.getByRole('link', { name: /Открыть «Смотрю»/ })).toBeVisible()
})