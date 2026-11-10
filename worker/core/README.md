# AnimeLife Core — свой бэкенд вместо Appwrite

Сайт больше не зависит от лимитов Appwrite Cloud. Core живёт в том же Cloudflare Worker.

| Было (Appwrite) | Стало (Core) |
|---|---|
| Auth + prefs | D1 `users` + KV `SESSIONS` (cookie `al_session`) |
| TablesDB | D1 (`lists`, reviews, comments, rooms, follows…) |
| Function `community` | `/api/core/action` |
| Realtime (комнаты) | Polling раз в 2.5 с → позже Durable Objects |
| Storage `manga-pages` | R2 (ещё не подключено) |

## Cloudflare (уже создано)

- D1 `anime_core` → binding `DB`
- KV `anime_sessions` → binding `SESSIONS`
- Cron `17 * * * *` — чистка старых комнат/сообщений

## Клиент

По умолчанию `VITE_BACKEND=core`. Откат: `VITE_BACKEND=appwrite`.

**Готово:** регистрация/логин, списки, prefs, отзывы, комменты, профили, analytics pageview, комнаты «Вместе», follow/лента/топ.

**В очереди:** OAuth (Google/VK/TG), голос WebRTC, push/Telegram, клубы, коллекции, community chat, манга R2, admin analytics-stats.

Старых пользователей Appwrite не переносим — регистрируются заново.

## Лимит Worker

См. `docs/worker-limit.md`. Обязательно включи WAF-правила в зоне. На проде с Core лучше **Workers Paid ($5)** — иначе 100k/сутки могут кончиться от ботов + `/api/core`.
