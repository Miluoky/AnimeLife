// Выкладывает функцию Appwrite из папки functions/<id>: архив package.json + src, новая сборка становится активной.
// Запуск: APPWRITE_API_KEY=... node scripts/deploy-function.mjs community
// Ключу нужны права functions.read и functions.write. Настройки функции (команда сборки, права) не меняются.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1'
const PROJECT = '6abf65850016889f9b1b'
const KEY = process.env.APPWRITE_API_KEY
const id = process.argv[2]

if (!KEY || !/^[a-z-]+$/.test(id ?? '')) {
  console.error('Запуск: APPWRITE_API_KEY=... node scripts/deploy-function.mjs <id функции>')
  process.exit(1)
}

const headers = { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': KEY }
const archive = join(tmpdir(), `${id}.tar.gz`)
execFileSync('tar', ['-czf', archive, '-C', `functions/${id}`, 'package.json', 'src'])

const form = new FormData()
form.append('activate', 'true')
form.append('code', new Blob([readFileSync(archive)], { type: 'application/gzip' }), `${id}.tar.gz`)
const res = await fetch(`${ENDPOINT}/functions/${id}/deployments`, { method: 'POST', headers, body: form })
const json = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`Не удалось выложить ${id}: ${res.status} ${json.message ?? ''}`)
  process.exit(1)
}
console.log(`Сборка ${json.$id} загружена, ждём готовности…`)

// Сборка идёт на стороне Appwrite (npm install). Ждём, чтобы ошибка была видна в журнале workflow.
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const d = await (await fetch(`${ENDPOINT}/functions/${id}/deployments/${json.$id}`, { headers })).json()
  if (d.status === 'ready') {
    console.log(`Функция ${id}: сборка ${json.$id} готова и активна.`)
    process.exit(0)
  }
  if (d.status === 'failed' || d.status === 'canceled') {
    console.error(`Сборка ${id} не удалась (${d.status}).`)
    process.exit(1)
  }
}
console.error(`Сборка ${id} не завершилась за 7,5 минут.`)
process.exit(1)
