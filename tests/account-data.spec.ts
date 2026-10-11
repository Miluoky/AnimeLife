import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

test('мои данные: выгрузка одним файлом и удаление аккаунта со словом УДАЛИТЬ', async ({ page }) => {
  const sent: Record<string, unknown>[] = []
  let signedIn = true
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    signedIn
      ? route.fulfill({ json: { $id: 'u1', name: 'Аня', email: 'a@example.com', labels: [], prefs: {}, status: true } })
      : route.fulfill({ status: 401, json: { message: 'guests' } }),
  )
  let statusCalls = 0
  await page.route(/cloud\.appwrite\.io\/v1\/account\/status$/, (route) => {
    statusCalls++
    signedIn = false
    return route.fulfill({ json: { $id: 'u1', status: false } })
  })
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    sent.push(body)
    const reply =
      body.action === 'account-export'
        ? { exportedAt: '2026-10-11T00:00:00Z', account: { id: 'u1', email: 'a@example.com' }, tables: { comments: [{ text: 'моё' }] } }
        : body.action === 'account-delete'
          ? { ok: true, removed: 3, accountDeleted: false }
          : { items: [], unread: 0 }
    return route.fulfill({ status: 201, json: { responseStatusCode: 200, responseBody: JSON.stringify(reply) } })
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
  // Функции не хватило прав удалить аккаунт: сайт отключил его сам.
  expect(statusCalls).toBe(1)
  await expect(page.getByRole('region', { name: 'Мои данные' })).toHaveCount(0)
})
