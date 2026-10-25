import { expect, test, type Page } from '@playwright/test'
import { mockServices } from './mocks'

/** Вошли как Аня; функция community отвечает по действию, все вызовы складываются в sent. */
async function signedIn(page: Page, reply: (body: Record<string, unknown>) => unknown) {
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'u1', name: 'Аня', email: 'a@example.com', labels: [], prefs: {}, status: true } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    sent.push(body)
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify(reply(body) ?? { ok: true }) } })
  })
  return sent
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('обсуждение: ответ встаёт под комментарием, «Ответить» отправляет replyTo', async ({ page }) => {
  const now = Date.now()
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/comments\/rows\?.*/, (route) =>
    route.fulfill({
      json: {
        total: 3,
        rows: [
          { $id: 'c3', animeId: '1', episode: 1, userId: 'u3', name: 'Вика', text: 'Свежий отдельный', spoiler: false, at: now - 1000 },
          { $id: 'c2', animeId: '1', episode: 1, userId: 'u3', name: 'Вика', text: 'Согласна!', spoiler: false, at: now - 5000, replyTo: 'c1', replyName: 'Боря' },
          { $id: 'c1', animeId: '1', episode: 1, userId: 'u2', name: 'Боря', text: 'Лучшая серия', spoiler: false, at: now - 9000 },
        ],
      },
    }),
  )
  const sent = await signedIn(page, (b) =>
    b.action === 'comment-save'
      ? { comment: { $id: 'c4', animeId: '1', episode: 1, userId: 'u1', name: 'Аня', text: b.text, spoiler: false, at: Date.now(), replyTo: 'c1', replyName: 'Боря' } }
      : { items: [], unread: 0 },
  )
  await page.goto('/watch/1/1')
  const block = page.getByRole('region', { name: 'Обсуждение серии 1' })
  const thread = block.locator('.comment-thread').filter({ hasText: 'Лучшая серия' })
  await expect(thread.locator('.comments__replies')).toContainText('Согласна!')
  await expect(thread.locator('.comments__replies')).toContainText('ответ для Боря')
  // Ветки по свежести: отдельный новый комментарий выше ветки Бори.
  await expect(block.locator('.comment-thread > .comment p')).toHaveText(['Свежий отдельный', 'Лучшая серия'])

  await thread.locator('#c-c1').getByRole('button', { name: 'Ответить' }).click()
  const field = block.getByRole('textbox', { name: 'Ответ для Боря' })
  await expect(field).toBeFocused()
  await field.fill('И мне понравилась')
  await block.getByRole('button', { name: 'Отправить' }).click()
  await expect(thread.locator('.comments__replies')).toContainText('И мне понравилась')
  expect(sent.find((b) => b.action === 'comment-save')).toMatchObject({ replyTo: 'c1', text: 'И мне понравилась' })
  await expect(block.getByRole('textbox', { name: 'Комментарий к серии' })).toBeVisible()
})

test('обсуждение: комментарий с матом виден автору «на проверке», ссылка #comments из канала ведёт к обсуждению', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/tablesdb\/anime\/tables\/comments\/rows\?.*/, (route) => route.fulfill({ json: { total: 0, rows: [] } }))
  await signedIn(page, (b) =>
    b.action === 'comment-save'
      ? { comment: { $id: 'c5', animeId: '1', episode: 1, userId: 'u1', name: 'Аня', text: b.text, spoiler: false, hidden: true, at: Date.now() }, held: 'мат' }
      : { items: [], unread: 0 },
  )
  await page.goto('/watch/1/1#comments')
  const block = page.getByRole('region', { name: 'Обсуждение серии 1' })
  await expect(block.getByText('Пока никто не написал')).toBeVisible()
  await expect(block).toBeInViewport()
  await block.getByRole('textbox', { name: 'Комментарий к серии' }).fill('ну и финал, блин')
  await block.getByRole('button', { name: 'Отправить' }).click()
  await expect(block.locator('#c-c5')).toContainText('на проверке')
  await expect(page.getByText('пока его не проверит модератор')).toBeVisible()
})

test('колокольчик: число новых, список уведомлений и «прочитано» при открытии', async ({ page }) => {
  const sent = await signedIn(page, (b) =>
    b.action === 'notif-list'
      ? {
          unread: 2,
          items: [
            { $id: 'n1', kind: 'reply', actorId: 'u2', actorName: 'Боря', text: 'Согласен, 12:34 огонь', link: '/watch/1/2#c-c9', at: Date.now() - 60_000, read: false },
            { $id: 'n2', kind: 'follow', actorId: 'u3', actorName: 'Вика', text: '', link: '/u/u3', at: Date.now() - 3_600_000, read: false },
            { $id: 'n3', kind: 'review-like', actorId: 'u4', actorName: 'Гоша', text: '', link: '/anime/1#reviews', at: Date.now() - 86_400_000, read: true },
          ],
        }
      : { ok: true },
  )
  await page.goto('/')
  const bell = page.getByRole('button', { name: 'Уведомления: новых 2' })
  await expect(bell).toBeVisible()
  await expect(bell).toContainText('2')
  await bell.click()
  const panel = page.getByRole('dialog', { name: 'Уведомления' })
  await expect(panel.locator('.bell__item')).toHaveCount(3)
  await expect(panel.locator('.bell__item').first()).toContainText('Боря ответил(а) на ваш комментарий')
  await expect(panel.locator('.bell__item').first()).toContainText('Согласен, 12:34 огонь')
  await expect(panel).toContainText('Вика подписался(-ась) на вас')
  await expect(panel).toContainText('Гоша отметил(а) ваш отзыв полезным')
  await expect.poll(() => sent.some((b) => b.action === 'notif-read')).toBe(true)
  await expect(page.getByRole('button', { name: 'Уведомления', exact: true })).toBeVisible()
  await panel.getByRole('link', { name: /Вика подписался/ }).click()
  await expect(page).toHaveURL(/\/u\/u3$/)
  await expect(panel).toBeHidden()
})

test('колокольчик только у вошедших', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Уведомления/ })).toHaveCount(0)
})
