import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  // Сайт можно собрать для подпапки: BASE_PATH=/папка/ npm run build.
  base: process.env.BASE_PATH ?? '/',
  // Preact вместо React: тот же API через preact/compat, а основной бандл легче примерно на 35 КБ (gzip).
  plugins: [preact()],
})
