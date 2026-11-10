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

**Готово:** регистрация/логин, списки, prefs, отзывы, комменты, профили, analytics pageview, комнаты «Вместе» (+ голос: `room_members` / `room_signals`, polling 2 с), follow/лента/топ.

**OAuth:** VK, Telegram (бот + Mini App) — `/api/core/auth/oauth`, вебхук `…/auth/oauth/telegram/webhook`. Google/Яндекс — заглушки.

**В очереди:** голос WebRTC, push/Telegram-уведомления, клубы, коллекции, community chat, admin analytics-stats.

Старых пользователей Appwrite не переносим — регистрируются заново.

## Остаточные точки Appwrite (чеклист клиента)

Пакет `appwrite` в Core-сборке не должен попадать в начальную загрузку — только `import()` в ветках `BACKEND === 'appwrite'`.

| Область | Файл | На Core |
|---|---|---|
| SDK-клиент | `src/api/appwrite.ts` | не импортируется |
| OAuth Google/Яндекс | `src/data/socialAuth.ts` | Core: `/api/core/auth/oauth`; Appwrite: SDK |
| Отзывы/комменты (чтение) | `community.ts`, `comments.ts`, `rooms.ts` | REST `/api/core/*` |
| Подборки/клубы (частично) | `src/data/social.ts` | Core GET; оценки серий — заглушка |
| Community chat | `src/data/communityChat.ts` | `GET /api/core/chat` + polling |
| Голос в комнатах | `src/data/voice.ts` | polling; `room-presence`/`room-signal` пока no-op на сервере |
| Загрузка манги | `src/pages/MangaUpload.tsx` | **выкл.** (`OWN_MANGA_ENABLED`), пока нет R2 |
| CDN manga (legacy) | `src/api/mangaOwn.ts` | fetch к Appwrite endpoint без SDK |
| Shikimori sync | `src/data/shikiSync.ts` | **выкл.** до `shiki-*` в Core |
| Экспорт/удаление аккаунта | `src/components/AccountData.tsx` | **выкл.** до `account-*` в Core |
| Пуши | `src/data/push.ts` | lazy, только при включении |
| Аналитика (fallback) | `src/data/analytics.ts` | на Appwrite — прямой fetch к Functions |
| `index.html` | — | без `preconnect` на fra.cloud.appwrite.io |

## Лимит Worker

См. `docs/worker-limit.md`. Обязательно включи WAF-правила в зоне. На проде с Core лучше **Workers Paid ($5)** — иначе 100k/сутки могут кончиться от ботов + `/api/core`.
