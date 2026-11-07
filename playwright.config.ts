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
    // 127.0.0.1: на Windows localhost иногда резолвится в ::1, а preview слушает IPv4 — тесты зависают на webServer.
    baseURL: `http://127.0.0.1:${port}`,
    // Запросы из service worker не проходят через подмену сети, поэтому в тестах его нет.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    // CI качает dist артефактом: preview иногда стартует дольше минуты на холодном раннере.
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
})
