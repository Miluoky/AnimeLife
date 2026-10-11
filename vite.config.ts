import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'

/**
 * precache.json: код и стили всех страниц сборки. Service worker (public/sw.js) скачивает их на быстрой сети,
 * чтобы без интернета открывались и те разделы, куда зритель ещё не заходил. hls.js (около 120 КБ)
 * не входит: он нужен только одному плееру в части браузеров.
 */
function precacheList(): Plugin {
  return {
    name: 'precache-list',
    apply: 'build',
    // После записи: Vite к этому моменту уже убрал пустые части (JS у страниц, где только CSS).
    writeBundle(options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /^assets\/.+\.(js|css|woff2)$/.test(f) && !/^assets\/hls/.test(f))
        .sort()
      writeFileSync(join(options.dir ?? 'dist', 'precache.json'), JSON.stringify(files))
    },
  }
}

export default defineConfig({
  // Сайт можно собрать для подпапки: BASE_PATH=/папка/ npm run build.
  base: process.env.BASE_PATH ?? '/',
  // Preact вместо React: тот же API через preact/compat, а основной бандл легче примерно на 35 КБ (gzip).
  plugins: [preact(), precacheList()],
})
