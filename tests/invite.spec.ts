import { expect, test } from '@playwright/test'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('«Позови друга»: ?ref запоминается и уходит из адреса, после входа засчитывается, в профиле своя ссылка и счётчик', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({ json: { $id: 'u1', name: 'Аня', email: 'a@example.com', labels: [], prefs: {}, status: true } }),
  )
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    sent.push(body)
    const reply =
      body.action === 'invite-claim' ? { ok: true, inviter: 'Мика' } : body.action === 'invite-stats' ? { invited: 2, invitedBy: true } : { ok: true }
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify(reply) } })
  })

  await page.goto('/?ref=host1')
  await expect(page).toHaveURL(/\/$/)
  expect(await page.evaluate(() => localStorage.getItem('anime.invite.ref'))).toContain('host1')

  await page.goto('/account')
  await expect(page.getByText('Вас позвал(а) Мика')).toBeVisible()
  expect(sent.find((b) => b.action === 'invite-claim')).toMatchObject({ ref: 'host1' })
  expect(await page.evaluate(() => localStorage.getItem('anime.invite.ref'))).toBeNull()

  const card = page.locator('#invite')
  await expect(card.getByRole('textbox', { name: 'Ваша ссылка-приглашение' })).toHaveValue(/\?ref=u1$/)
  await expect(card).toContainText('По вашей ссылке пришли: 2')
  await expect(card).toContainText('+400 опыта')
})
