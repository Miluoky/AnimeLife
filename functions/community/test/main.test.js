// Каждый файл функции должен разбираться без ошибок: синтаксическая ошибка в main.js роняет всю функцию
// (Appwrite отвечает 503 без журнала). node --check не загружает зависимости вроде web-push.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const dir = new URL('../src/', import.meta.url)

for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  test(`${file} без синтаксических ошибок`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', new URL(file, dir).pathname], { stdio: 'pipe' }))
  })
}
