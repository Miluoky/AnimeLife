import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { coreActionOk, mockCoreAction, mockCoreSession, mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('мои данные: выгрузка одним файлом и удаление аккаунта со словом УДАЛИТЬ', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  let signedIn = true
  const logouts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/core\/auth\/logout(?:\?|$)/.test(r.url())) logouts.push(r.url())
  })
  await mockCoreSession(page, () =>
    signedIn ? { $id: 'u1', name: 'Аня', email: 'a@example.com' } : null,
  )
  await mockCoreAction(page, (body) => {
    sent.push(body)
    if (body.action === 'account-export') {
      return { exportedAt: '2026-10-11T00:00:00Z', account: { id: 'u1', email: 'a@example.com' }, tables: { comments: [{ text: 'моё' }] } }
    }
    if (body.action === 'account-delete') {
      signedIn = false
      return { ok: true, removed: 3, accountDeleted: true }
    }
    return coreActionOk(body)
  })
  await page.addInitScript(() => localStorage.setItem('anime.nospoil.v1', 'true'))
  await page.goto('/account')
  const block = page.getByRole('region', { name: 'Мои данные' })
  await expect(block).toBeVisible()

  const download = page.waitForEvent('download')
  await block.getByRole('button', { name: 'Скачать мои данные' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^animelife-moi-dannye-\d{4}-\d{2}-\d{2}\.json$/)
  const data = JSON.parse(readFileSync(await file.path(), 'utf8'))
  expect(data.account.email).toBe('a@example.com')
  expect(data.tables.comments[0].text).toBe('моё')
  expect(data.browser['anime.nospoil.v1']).toBe(true)

  await block.getByRole('button', { name: 'Удалить аккаунт' }).click()
  const confirm = block.getByRole('button', { name: 'Удалить навсегда' })
  await expect(confirm).toBeDisabled()
  await block.getByRole('textbox', { name: 'Подтверждение удаления' }).fill('удалить')
  await confirm.click()
  await expect(page.getByText(/Аккаунт и его данные удалены/)).toBeVisible()
  expect(sent).toContainEqual({ action: 'account-delete', confirm: 'удалить' })
  expect(logouts.length).toBeGreaterThan(0)
  await expect(page.getByRole('region', { name: 'Мои данные' })).toHaveCount(0)
})
