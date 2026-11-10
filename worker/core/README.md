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

Сборка **только Core**: `BACKEND = 'core'` в `src/api/config.ts`, отката на Appwrite SDK в клиенте нет.

**Готово:** регистрация/логин, списки, prefs, отзывы/модерация, комменты, профили, account export/delete, оценки серий, Shikimori sync (`shiki-*` + секреты), community chat, клубы/подборки, analytics, комнаты «Вместе».

**OAuth:** VK, Telegram — `/api/core/auth/oauth`. Google/Яндекс — клиент показывает понятную ошибку, пока нет ключей на воркере.

**Позже:** исходящая почта (сброс пароля), R2 для своей манги, Google/Яндекс OAuth (ключи). RoomDO уже в коде (`worker/core/roomDo.js`) — binding включить на Workers Paid, см. `docs/rooms-do.md`.

**Операции:** суточный экспорт D1 — `.github/workflows/backup.yml`. Appwrite Functions и `functions/community` в репозитории сняты с эксплуатации.

Старых пользователей Appwrite не переносим — регистрируются заново.

## Legacy в клиенте

| Область | Файл | Примечание |
|---|---|---|
| Сброс пароля | `Account.tsx`, `PasswordRecovery.tsx` | Core: выкл. до почты на воркере |
| Загрузка манги | `src/pages/MangaUpload.tsx`, `src/api/mangaOwn.ts` | **выкл.** (`OWN_MANGA_ENABLED`), пока нет R2 |

## Лимит Worker

См. `docs/worker-limit.md`. Обязательно включи WAF-правила в зоне. На проде с Core лучше **Workers Paid ($5)** — иначе 100k/сутки могут кончиться от ботов + `/api/core`.
