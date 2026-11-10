# AnimeLife Core — свой бэкенд вместо Appwrite

Сайт больше не зависит от лимитов Appwrite Cloud. Core живёт в том же Cloudflare Worker.

| Было (Appwrite) | Стало (Core) |
|---|---|
| Auth + prefs | D1 `users` + KV `SESSIONS` (cookie `al_session`) |
| TablesDB | D1 (`lists`, reviews, comments, rooms, follows…) |
| Function `community` | `/api/core/action` |
| Realtime (комнаты) | Polling раз в 2.5 с → позже Durable Objects |
| Storage `manga-pages` | **отложено** (R2 нужен billing вне РФ); код в `worker/core/manga.js` |

## Cloudflare (уже создано)

- D1 `anime_core` → binding `DB`
- KV `anime_sessions` → binding `SESSIONS`
- Cron `17 * * * *` — чистка старых комнат/сообщений

## Клиент

По умолчанию `VITE_BACKEND=core`. Откат: `VITE_BACKEND=appwrite`.

**Готово:** регистрация/логин, списки, prefs, отзывы/модерация, комменты, профили, account export/delete, оценки серий, Shikimori sync (`shiki-*` + секреты), community chat, клубы/подборки, analytics, комнаты «Вместе».

**OAuth:** VK, Telegram — `/api/core/auth/oauth`. Google/Яндекс — клиент показывает понятную ошибку, пока нет ключей на воркере.

**Позже:** исходящая почта (сброс пароля), R2 для своей манги, Google/Яндекс OAuth (ключи), Durable Objects для комнат (`docs/rooms-do.md`).

**Операции:** суточный экспорт D1 — `.github/workflows/backup.yml`. Деплой Appwrite Functions выключен (`.github/workflows/appwrite.yml`).

Старых пользователей Appwrite не переносим — регистрируются заново.

## Остаточные точки Appwrite (чеклист клиента)

Пакет `appwrite` в Core-сборке не должен попадать в начальную загрузку — только `import()` в ветках `BACKEND === 'appwrite'`.

| Область | Файл | На Core |
|---|---|---|
| SDK-клиент | `src/api/appwrite.ts` | не импортируется |
| OAuth Google/Яндекс | `src/data/socialAuth.ts` | Core: явная ошибка без ключей; Appwrite: SDK |
| Сброс пароля | `Account.tsx`, `PasswordRecovery.tsx` | Core: выкл. до почты на воркере |
| Отзывы/комменты (чтение) | `community.ts`, `comments.ts`, `rooms.ts` | REST `/api/core/*` |
| Подборки/клубы/оценки серий | `src/data/social.ts` | Core GET + `episode-rate` |
| Community chat | `src/data/communityChat.ts` | `GET /api/core/chat` + polling |
| Голос в комнатах | `src/data/voice.ts` | D1 + polling (`voice.js`); дальше DO — `docs/rooms-do.md` |
| Загрузка манги | `src/pages/MangaUpload.tsx` | **выкл.** (`OWN_MANGA_ENABLED`), пока нет R2 |
| CDN manga (legacy) | `src/api/mangaOwn.ts` | fetch к Appwrite endpoint без SDK |
| Shikimori sync | `src/data/shikiSync.ts` | `shiki-*` (секреты `SHIKIMORI_*` на воркере) |
| Экспорт/удаление аккаунта | `src/components/AccountData.tsx` | `account-export` / `account-delete` |
| Пуши | `src/data/push.ts` | lazy, только при включении |
| Аналитика (fallback) | `src/data/analytics.ts` | на Appwrite — прямой fetch к Functions |
| `index.html` | — | без `preconnect` на fra.cloud.appwrite.io |

## Лимит Worker

См. `docs/worker-limit.md`. Обязательно включи WAF-правила в зоне. На проде с Core лучше **Workers Paid ($5)** — иначе 100k/сутки могут кончиться от ботов + `/api/core`.
