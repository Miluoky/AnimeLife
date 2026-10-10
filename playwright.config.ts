import { defineConfig, devices } from '@playwright/test'

// PW_PORT — свой порт preview, чтобы параллельные прогоны (несколько веток, агенты) не делили сервер.
const port = Number(process.env.PW_PORT) || 4173

// Браузерные тесты ходят на собранный сайт (vite preview), Shikimori и Appwrite подменяются
// заготовками из tests/fixtures: тесты не зависят от сети и лимитов API.
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // Запросы из service worker не проходят через подмену сети, поэтому в тестах его нет.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
})
