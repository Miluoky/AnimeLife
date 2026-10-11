import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifyWebAppData } from '../src/main.js'

const TOKEN = '123:test-token'

// Подписываем данные так же, как Telegram: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function signed(fields, token = TOKEN) {
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}

const now = Date.now()
const fields = {
  query_id: 'AAE1',
  user: JSON.stringify({ id: 7852687569, first_name: 'Аня', last_name: 'Ли' }),
  auth_date: String(Math.floor(now / 1000) - 60),
}

test('настоящие данные запуска дают аккаунт tg_<id>', () => {
  assert.deepEqual(verifyWebAppData(signed(fields), TOKEN, now), { userId: 'tg_7852687569', name: 'Аня Ли' })
})

test('подпись чужим токеном не принимается', () => {
  assert.throws(() => verifyWebAppData(signed(fields, '999:other'), TOKEN, now), /Подпись/)
})

test('подменённый пользователь не принимается', () => {
  const data = new URLSearchParams(signed(fields))
  data.set('user', JSON.stringify({ id: 1, first_name: 'X' }))
  assert.throws(() => verifyWebAppData(data.toString(), TOKEN, now), /Подпись/)
})

test('данные старше суток устарели', () => {
  const old = { ...fields, auth_date: String(Math.floor(now / 1000) - 25 * 3600) }
  assert.throws(() => verifyWebAppData(signed(old), TOKEN, now), /устарели/)
})

test('без хэша или токена вход не проходит', () => {
  assert.throws(() => verifyWebAppData('user=1', TOKEN, now), /неполные/)
  assert.throws(() => verifyWebAppData(signed(fields), '', now), /не настроен/)
})
