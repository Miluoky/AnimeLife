import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../src/main.js'

// Так же, как в среде Appwrite: геттер bodyJson бросает SyntaxError на пустом или битом теле.
const run = (bodyText) =>
  handler({
    req: { method: 'POST', headers: {}, bodyText, get bodyJson() { return JSON.parse(this.bodyText) } },
    res: { json: (body, code = 200) => ({ body, code }) },
    log() {},
    error() {},
  })

test('пустое тело — ответ 400, а не падение', async () => {
  const r = await run('')
  assert.equal(r.code, 400)
})

test('битое тело — ответ 400, а не падение', async () => {
  const r = await run('{oops')
  assert.equal(r.code, 400)
  assert.equal(r.body.error, 'Неверный запрос.')
})
