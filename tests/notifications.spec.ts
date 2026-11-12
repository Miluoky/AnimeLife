import { expect, test, type Page } from '@playwright/test'
import { coreActionOk, mockCoreAction, mockCoreSession, mockServices } from './mocks'

/** Вошли как Аня; POST /api/core/action отвечает по действию, все вызовы складываются в sent. */
async function signedIn(page: Page, reply: (body: Record<string, unknown>) => unknown) {
  const sent: Record<string, unknown>[] = []
  await mockCoreSession(page, { $id: 'u1', name: 'Аня', email: 'a@example.com' })
  await mockCoreAction(page, (body) => {
    sent.push(body)
    return reply(body) ?? coreActionOk(body)
  })
  return sent
}

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

/** Комментарии и опенинги монтируются, когда секция рядом с экраном. Первая прокрутка
 * раскрывает блок выше и удлиняет страницу, поэтому листаем, пока блок не появится. */
async function revealComments(page: Page) {
  const block = page.getByRole('region', { name: 'Комментарии' })
  for (let i = 0; i < 16 && (await block.count()) === 0; i++) {
    await page.evaluate(() => window.scrollBy(0, Math.max(900, window.innerHeight)))
    await page.waitForTimeout(60)
  }
}

test('обсуждение: ответ встаёт под комментарием, «Ответить» отправляет replyTo', async ({ page }) => {
  const now = Date.now()
  await page.route(/\/api\/core\/comments/, (route) =>
    route.fulfill({
      json: {
        comments: [
          { $id: 'c3', animeId: '1', episode: 0, userId: 'u3', name: 'Вика', text: 'Свежий отдельный', spoiler: false, at: now - 1000 },
          { $id: 'c2', animeId: '1', episode: 0, userId: 'u3', name: 'Вика', text: 'Согласна!', spoiler: false, at: now - 5000, replyTo: 'c1', replyName: 'Боря' },
          { $id: 'c1', animeId: '1', episode: 0, userId: 'u2', name: 'Боря', text: 'Лучшая серия', spoiler: false, at: now - 9000 },
        ],
      },
    }),
  )
  const sent = await signedIn(page, (b) =>
    b.action === 'comment-save'
      ? { comment: { $id: 'c4', animeId: '1', episode: 0, userId: 'u1', name: 'Аня', text: b.text, spoiler: false, at: Date.now(), replyTo: 'c1', replyName: 'Боря' } }
      : coreActionOk(b),
  )
  await page.goto('/anime/1')
  await revealComments(page)
  const block = page.getByRole('region', { name: 'Комментарии' })
  const thread = block.locator('.comment-thread').filter({ hasText: 'Лучшая серия' })
  await expect(thread.locator('.comments__replies')).toContainText('Согласна!')
  await expect(thread.locator('.comments__replies')).toContainText('ответ для Боря')
  await expect(block.locator('.comment-thread > .comment p')).toHaveText(['Свежий отдельный', 'Лучшая серия'])

  await thread.locator('#c-c1').getByRole('button', { name: 'Ответить' }).click()
  const field = block.getByRole('textbox', { name: 'Ответ для Боря' })
  await expect(field).toBeFocused()
  await field.fill('И мне понравилась')
  await block.getByRole('checkbox', { name: 'Мне есть 16 лет' }).check()
  await block.getByRole('button', { name: 'Отправить' }).click()
  await expect(thread.locator('.comments__replies')).toContainText('И мне понравилась')
  expect(sent.find((b) => b.action === 'comment-save')).toMatchObject({ replyTo: 'c1', text: 'И мне понравилась', episode: 0 })
  await expect(block.getByRole('textbox', { name: 'Комментарий к тайтлу' })).toBeVisible()
})

test('комментарии: с матом виден автору «на проверке», #comments на странице тайтла', async ({ page }) => {
  await page.route(/\/api\/core\/comments/, (route) => route.fulfill({ json: { comments: [] } }))
  await signedIn(page, (b) =>
    b.action === 'comment-save'
      ? { comment: { $id: 'c5', animeId: '1', episode: 0, userId: 'u1', name: 'Аня', text: b.text, spoiler: false, hidden: true, at: Date.now() }, held: 'мат' }
      : coreActionOk(b),
  )
  await page.goto('/anime/1#comments')
  await revealComments(page)
  const block = page.getByRole('region', { name: 'Комментарии' })
  await expect(block.getByText('Пока никто не написал')).toBeVisible()
  await expect(block).toBeInViewport()
  await block.getByRole('textbox', { name: 'Комментарий к тайтлу' }).fill('ну и финал, блин')
  await block.getByRole('checkbox', { name: 'Мне есть 16 лет' }).check()
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
      : coreActionOk(b),
  )
  await page.goto('/')
  const bell = page.getByRole('button', { name: /Уведомления.*новых:\s*2/ })
  await expect(bell).toBeVisible()
  await expect(bell).toContainText('2')
  await bell.click()
  const panel = page.getByRole('region', { name: 'Уведомления' })
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
