// Бюджет размера сборки: проверка падает, если сайт потяжелел сверх меры.
// Запуск: node scripts/check-size.mjs (после npm run build).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = {
  // основная часть: Preact (вместо React), роутер, главная страница; запас ~10 КБ на новые функции
  main: 46,
  // любая отдельная страница или библиотека
  chunk: 40,
  // SDK Appwrite грузится отдельно и только когда нужен
  appwrite: 30,
  // hls.js (облегчённая сборка) грузится только при выборе плеера AniLibria в браузерах без нативного HLS
  hls: 120,
  css: 10,
}

const dir = 'dist/assets'
const rows = []
let failed = false

for (const file of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(file)) continue
  const gzip = gzipSync(readFileSync(join(dir, file))).length / 1024
  const raw = statSync(join(dir, file)).size / 1024
  const budget = file.endsWith('.css')
    ? BUDGET_KB.css
    : file.startsWith('index-')
      ? BUDGET_KB.main
      : file.startsWith('appwrite-')
        ? BUDGET_KB.appwrite
        : file.startsWith('hls')
          ? BUDGET_KB.hls
          : BUDGET_KB.chunk
  const over = gzip > budget
  if (over) failed = true
  rows.push({ file, 'KB': raw.toFixed(1), 'gzip KB': gzip.toFixed(1), 'бюджет': budget, ok: over ? 'ПРЕВЫШЕН' : 'ок' })
}

rows.sort((a, b) => Number(b['gzip KB']) - Number(a['gzip KB']))
console.table(rows)
if (failed) {
  console.error('Сборка превысила бюджет размера. Разбейте код на части или уберите лишнее.')
  process.exit(1)
}
