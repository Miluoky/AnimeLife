import { expect, test } from '@playwright/test'
import { coreActionOk, mockCoreAction, mockCoreSession, mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('«Позови друга»: ?ref запоминается и уходит из адреса, после входа засчитывается, в профиле своя ссылка и счётчик', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  await mockCoreSession(page, { $id: 'u1', name: 'Аня', email: 'a@example.com' })
  await mockCoreAction(page, (body) => {
    sent.push(body)
    if (body.action === 'invite-claim') return { ok: true, inviter: 'Мика' }
    if (body.action === 'invite-stats') return { invited: 2, invitedBy: true }
    return coreActionOk(body)
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
