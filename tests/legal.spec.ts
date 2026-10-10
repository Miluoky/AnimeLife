import { expect, test, type Page, type Route } from '@playwright/test'
import { mockServices } from './mocks'
import { CONTACT_EMAIL, LEGAL } from '../src/data/legal'

test.beforeEach(async ({ page }) => {
  await mockServices(page)
})

/** Подменяет функцию community: отвечает reply(тело запроса) и запоминает, что отправил сайт. */
async function mockCommunity(page: Page, reply: (body: Record<string, unknown>) => [number, object]) {
  const sent: Record<string, unknown>[] = []
  await page.route(/cloud\.appwrite\.io\/v1\/functions\/community\/executions/, (route: Route) => {
    const body = JSON.parse(route.request().postDataJSON().body)
    sent.push(body)
    const [status, json] = reply(body)
    return route.fulfill({ status: 201, json: { responseStatusCode: status, responseBody: JSON.stringify(json) } })
  })
  return sent
}

test('служебные страницы: заголовок, описание и ссылки в подвале', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('.site-footer')
  await expect(footer).toContainText('Anime Life не хранит видео')
  await footer.getByRole('link', { name: 'Правообладателям' }).click()
  await expect(page).toHaveURL(/\/rightholders$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Правообладателям')
  await expect(page).toHaveTitle('Правообладателям — жалобы и удаление материалов | Anime Life')

  for (const [path, l] of Object.entries(LEGAL)) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(l.h1)
    await expect(page).toHaveTitle(`${l.title} | Anime Life`)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', l.description)
    expect(`${l.title} | Anime Life`.length).toBeLessThanOrEqual(70)
    expect(l.description.length).toBeLessThanOrEqual(160)
    // Длинные ссылки в тексте не раздвигают страницу на телефоне.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  // «О проекте» и «Приложение» открываются из подвала.
  await page.goto('/')
  await footer.getByRole('link', { name: 'О проекте' }).click()
  await expect(page).toHaveURL(/\/about$/)
  await footer.getByRole('link', { name: 'Приложение' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Приложение Anime Life')
  await expect(page.locator('.legal__install')).toBeVisible()
  await page.goto('/terms')
  // Ссылка внутри текста ведёт на другую служебную страницу.
  await page.getByRole('main').getByRole('link', { name: 'Контакты' }).first().click()
  await expect(page).toHaveURL(/\/contacts$/)
})

test('жалоба правообладателя: галочка обязательна, после отправки — подтверждение', async ({ page }) => {
  const sent = await mockCommunity(page, () => [200, { ok: true }])
  await page.goto('/rightholders')
  await page.getByLabel('Имя или название организации').fill('ООО «Студия»')
  await page.getByLabel('Электронная почта для ответа').fill('legal@example.com')
  await page.getByLabel(/Ссылки на страницы animelife\.top/).fill('https://animelife.top/anime/1')
  await page.getByLabel(/Описание/).fill('Исключительные права на сериал принадлежат нам по договору №1.')
  const send = page.getByRole('button', { name: 'Отправить жалобу' })
  await expect(send).toBeDisabled()
  await page.getByLabel(/Подтверждаю, что являюсь правообладателем/).check()
  await send.click()
  await expect(page.getByRole('status').filter({ hasText: 'Жалоба отправлена' })).toContainText('legal@example.com')
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({
    action: 'takedown-create',
    kind: 'takedown',
    name: 'ООО «Студия»',
    email: 'legal@example.com',
    links: 'https://animelife.top/anime/1',
    confirm: true,
    website: '',
  })
})

test('форма обратной связи показывает ошибку сервера', async ({ page }) => {
  const sent = await mockCommunity(page, () => [400, { error: 'Слишком много обращений подряд. Попробуйте через час.' }])
  await page.goto('/contacts')
  await expect(page.getByLabel(/Подтверждаю/)).toHaveCount(0)
  await page.getByLabel('Имя', { exact: true }).fill('Мика')
  await page.getByLabel('Электронная почта для ответа').fill('mika@example.com')
  await page.getByLabel('Сообщение').fill('Не открывается страница расписания.')
  await page.getByRole('button', { name: 'Отправить', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Слишком много обращений подряд. Попробуйте через час.')
  expect(sent[0]).toMatchObject({ action: 'takedown-create', kind: 'contact', confirm: false })
})

test('возрастная маркировка на странице тайтла и в плеере', async ({ page }) => {
  // У тайтла из заготовки рейтинг r_plus.
  await page.goto('/anime/1')
  await expect(page.locator('.title-head .chip--age')).toHaveText('18+')
  await page.goto('/watch/1/1')
  await expect(page.locator('.watch-head__age')).toHaveText('18+')
})

test('модерация: вкладка обращений для админа', async ({ page }) => {
  await page.route(/cloud\.appwrite\.io\/v1\/account$/, (route) =>
    route.fulfill({
      json: { $id: 'admin1', name: 'Модератор', email: 'mod@example.com', labels: ['admin'], prefs: {}, status: true },
    }),
  )
  const takedown = {
    $id: 't1',
    kind: 'takedown',
    name: 'ООО «Студия»',
    email: 'legal@example.com',
    links: 'https://animelife.top/anime/1',
    message: 'Права принадлежат нам.',
    status: 'new',
    createdAt: Date.now(),
  }
  const sent = await mockCommunity(page, (body) => {
    if (body.action === 'takedown-list') return [200, { takedowns: [takedown] }]
    if (body.action === 'takedown-status') return [200, { takedown: { ...takedown, status: body.status } }]
    if (body.action === 'mod-list') return [200, { reviews: [] }]
    return [200, { ok: true }]
  })
  await page.goto('/moderation?tab=takedowns')
  await expect(page.getByRole('tab', { name: 'Обращения' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Жалоба правообладателя: ООО «Студия»')).toBeVisible()
  await page.locator('article').getByRole('button', { name: 'Выполнено' }).click()
  await expect(page.getByText('Обращений нет.')).toBeVisible()
  expect(sent.find((b) => b.action === 'takedown-status')).toMatchObject({ takedownId: 't1', status: 'done' })
})

test('почта сайта на «Контактах» — ссылка mailto', async ({ page }) => {
  await page.goto('/contacts')
  const mail = page.locator('main').getByRole('link', { name: CONTACT_EMAIL })
  await expect(mail).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`)
})
