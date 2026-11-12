import { expect, test } from '@playwright/test'
import { coreActionOk, mockCoreAction, mockCoreSession, mockServices } from './mocks'

const chatRows = () => [
  { $id: 'first', userId: 'u1', name: 'Мика', text: 'Всем привет!', at: Date.now() - 60_000 },
  { $id: 'second', userId: 'u2', name: 'Аня', text: '<script>не запускать</script>', at: Date.now() },
  { $id: 'hidden', userId: 'u3', name: 'Спам', text: 'Скрытое сообщение', at: Date.now(), hidden: true },
]

test.beforeEach(async ({ page }) => {
  await mockServices(page)
  await page.route(/\/api\/core\/chat(?:\?|$)/, (route) => route.fulfill({ json: { messages: chatRows() } }))
})

test('общий чат показывает новые сообщения и оставляет гостю только чтение', async ({ page }) => {
  await page.goto('/chat')
  await expect(page.getByRole('heading', { name: 'Общий чат' })).toBeVisible()
  await expect(page.getByText('Всем привет!')).toBeVisible()
  await expect(page.getByText('<script>не запускать</script>')).toBeVisible()
  await expect(page.getByText('Скрытое сообщение')).toHaveCount(0)
  await expect(page.locator('.community-chat__messages script')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Войдите' })).toHaveAttribute('href', '/account')
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveCount(0)
})

test('вошедший пользователь может отправить жалобу на чужое сообщение', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await mockCoreSession(page, { $id: 'reporter', name: 'Зритель', email: 'viewer@example.test' })
  await mockCoreAction(page, (body) => {
    if (body.action === 'community-chat-report') sent.push(body)
    return coreActionOk(body)
  })

  await page.goto('/chat')
  const report = page.locator('li', { hasText: 'Аня' }).getByRole('button', { name: 'Пожаловаться' })
  await expect(report).toBeVisible()
  await report.click()
  await expect(page.getByRole('button', { name: 'Жалоба отправлена' }).first()).toBeDisabled()
  expect(sent).toEqual([{ action: 'community-chat-report', messageId: 'second' }])
})

test('модератор может разобрать скрытое сообщение из вкладки чата', async ({ page }) => {
  const actions: Record<string, unknown>[] = []
  const message = { $id: 'reported', userId: 'u1', name: 'Зритель', text: 'Проверьте это', at: Date.now(), reports: 3, hidden: true }
  await mockCoreSession(page, { $id: 'admin', name: 'Модератор', email: 'admin@example.test', labels: ['admin'] })
  await mockCoreAction(page, (body) => {
    actions.push(body)
    if (body.action === 'community-chat-mod-list') return { messages: [message] }
    if (body.action === 'community-chat-mod-action') return { message: { ...message, hidden: body.decision === 'hide' } }
    return coreActionOk(body)
  })

  await page.goto('/moderation?tab=chat')
  await expect(page.getByText('Проверьте это')).toBeVisible()
  await expect(page.getByText('жалоб: 3')).toBeVisible()
  await page.getByRole('button', { name: 'Оставить' }).click()
  await expect(page.getByRole('button', { name: 'Скрыть' })).toBeVisible()
  expect(actions.map((action) => action.action)).toContain('community-chat-mod-list')
  expect(actions).toContainEqual({ action: 'community-chat-mod-action', messageId: 'reported', decision: 'show' })
})

test('общий чат не создаёт горизонтальную прокрутку на телефоне', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/chat')
  await expect(page.getByText('Всем привет!')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  )
})
