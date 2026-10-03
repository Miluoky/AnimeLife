import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Сайт можно собрать для подпапки: BASE_PATH=/папка/ npm run build.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})