import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // На GitHub Pages сайт живёт в подпапке /Anime/, её передаёт сборка в .github/workflows/pages.yml.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
