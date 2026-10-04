import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockServices } from './mocks'

const animes: { id: number; russian: string }[] = JSON.parse(readFileSync(new URL('./fixtures/animes.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await mockServices(page)
  // Имя кадра — id тайтла: так тест знает верный ответ.
  await page.route(/\/animes\/(\d+)\/screenshots/, (route) => {
    const id = route.request().url().match(/animes\/(\d+)\/screenshots/)![1]
    return route.fulfill({ json: [{ original: `/system/screenshots/original/${id}.jpg`, preview: `/system/screenshots/x332/${id}.jpg` }] })
  })
})

const answerOf = async (page: import('@playwright/test').Page) => {
  const src = await page.locator('.quiz-shot img').getAttribute('src')
  const id = Number(src!.match(/(\d+)\.jpg/)![1])
  return animes.find((a) => a.id === id)!.russian
}

test('угадай по кадру: верный ответ растит серию и рекорд, ошибка сбрасывает серию', async ({ page }) => {
  await page.goto('/quiz')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Угадай аниме по кадру')
  const options = page.getByRole('group', { name: 'Варианты ответа' }).getByRole('button')
  const score = page.getByLabel('Счёт')
  await expect(options.first()).toBeEnabled()
  await expect(options).toHaveCount(4)

  await options.filter({ hasText: await answerOf(page) }).click()
  await expect(page.locator('.quiz-result')).toContainText('Верно!')
  await expect(page.locator('.quiz-option--right')).toHaveCount(1)
  await expect(score).toContainText('Подряд1')
  await expect(score).toContainText('Рекорд1')

  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect(options.first()).toBeEnabled()
  const right = await answerOf(page)
  await options.filter({ hasNotText: right }).first().click()
  await expect(page.locator('.quiz-result')).toContainText('Мимо.')
  await expect(page.locator('.quiz-option--wrong')).toHaveCount(1)
  await expect(page.locator('.quiz-option--right')).toHaveText(right)
  await expect(score).toContainText('Подряд0')
  await expect(score).toContainText('1 из 2')

  await page.reload()
  await expect(score).toContainText('Рекорд1')
})
