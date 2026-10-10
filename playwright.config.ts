import { defineConfig, devices } from '@playwright/test'

// Браузерные тесты ходят на собранный сайт (vite preview), Shikimori и Appwrite подменяются
// заготовками из tests/fixtures: тесты не зависят от сети и лимитов API.
// PW_PORT — свой порт для параллельных прогонов (несколько копий репозитория на одной машине).
const port = Number(process.env.PW_PORT ?? 4173)
const origin = `http://localhost:${port}`

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: origin,
    // Запросы из service worker не проходят через подмену сети, поэтому в тестах его нет.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
})
