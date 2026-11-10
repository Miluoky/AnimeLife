# Anime Life

Anime Life — русскоязычный сайт «смотреть аниме + вести список + вместе». Дизайн: тёмная тема «Ночной кинотеатр», акцент `#FF5470`, шрифты Unbounded и Manrope.

Бэкенд аккаунтов и коммьюнити — **AnimeLife Core**: тот же Cloudflare Worker, **D1** (`anime_core`) и **KV** (`SESSIONS`). Клиент ходит только в `/api/core` (`BACKEND = 'core'` в `src/api/config.ts`). Отдельного SDK и переменных `VITE_APPWRITE_*` нет.

## Cloudflare Free

Прод живёт на **Workers Free**: 100 000 вызовов Worker в сутки. Страницы для людей отдаёт статика (`run_worker_first: false`); Worker нужен поисковикам, превью ссылок и `/api/*`. Защита от ботов и как не сжечь лимит: [docs/worker-limit.md](docs/worker-limit.md).

**Отложено (не включать на Free):**

- **RoomDO** (Durable Objects для комнат «Вместе») — нужен Workers Paid. Код есть в `worker/core/roomDo.js`, binding в wrangler закомментирован. Сейчас комнаты на D1 и коротком polling.
- **R2** для своих глав манги — нужна карта оплаты вне РФ. `OWN_MANGA_ENABLED = false`; читать мангу можно с MangaDex.

## Запуск

```bash
npm install
npm run dev      # локальный сервер разработки
npm run build    # сборка в dist/
npm test         # браузерные тесты (Playwright, нужен `npx playwright install chromium`)
npm run size     # бюджет размера сборки после npm run build
```

Локально Worker + Core: `npm run build && npx wrangler@4 dev -c wrangler.animelife.jsonc`.

На каждый PR GitHub Actions (`.github/workflows/ci.yml`) собирает сайт, проверяет типы и бюджет размера, гоняет браузерные тесты и замеряет Lighthouse. Тесты подменяют Shikimori и Core заготовками из `tests/fixtures`, поэтому не зависят от сети.

Как сайт остаётся быстрым: главная входит в основную сборку, остальные страницы грузятся отдельными частями при первом открытии; постеры в сетках — лёгкие webp из GraphQL Shikimori; шрифты лежат в репозитории (`src/fonts`); при наведении на карточку код и данные страницы тайтла подтягиваются заранее.

## Что есть

- `/` — главная: подборка недели, «Продолжить просмотр», популярное с фильтром по жанрам
- `/catalog` — каталог с поиском и фильтрами (жанр, тип, статус, год, оценка)
- `/anime/:id` — страница тайтла со списком серий
- `/ongoing` — онгоинги
- `/genre/:slug`, `/type/:kind`, `/year/:yyyy`, `/year/:yyyy/:season` — подборки по жанру, типу, году и сезону
- `/schedule` — расписание новых серий на неделю
- `/my-list` — «Мой список» со статусами «Смотрю», «Буду смотреть», «Просмотрено», «Брошено»
- `/watch/:id/:episode` — плеер (Kodik / Alloha / AniLibria / …)
- `/account` — вход и регистрация (почта, VK ID, Telegram; Google/Яндекс выкл., пока нет ключей на Worker)
- `/together` — «Вместе»: открытые комнаты и вход по коду; `/together/:code` — комната совместного просмотра
- `/manga` — манга: каталог Shikimori, главы MangaDex

## Данные

Каталог, постеры, описания и трейлеры — открытый API [Shikimori](https://shikimori.io/api/doc), ключ не нужен (`src/api/shikimori.ts`). Запросы идут из браузера; на animelife.top есть запасной кэширующий прокси в Worker (`/api/shiki`). Адрес можно поменять переменной `VITE_SHIKIMORI_URL`.

Если API недоступно, сайт показывает демо-данные из `src/data/catalog.ts`. История просмотра и «Мой список» хранятся в браузере (`localStorage`), после входа синхронизируются через Core.

## Аккаунты (Core)

Сессия — cookie `al_session` в KV `SESSIONS`; пользователи и prefs — D1. Клиент: `src/api/core.ts`, `src/data/auth.ts`. Старых пользователей облака не переносим — регистрируются заново.

Способы входа (`SOCIAL_LOGIN` в `src/api/config.ts`, или `VITE_AUTH_GOOGLE=1`, `VITE_AUTH_YANDEX=1`, `VITE_VK_APP_ID`, `VITE_AUTH_TELEGRAM=0`):

- **VK ID и Telegram** — `/api/core/auth/oauth` (секреты бота и VK на Worker).
- **Google и Яндекс** — кнопки выкл. по умолчанию, пока на Worker нет серверных ключей.

Пуши: публичный VAPID в `src/api/config.ts`, секрет `VAPID_PRIVATE_KEY` только на Worker.

## Приложение на телефон

Сайт устанавливается как приложение (PWA): `public/manifest.webmanifest` задаёт название, иконки и ярлыки,
`public/sw.js` кэширует сайт, данные Shikimori и постеры. Service worker подключается только в собранной версии; при изменении логики кэша поднимите `VERSION` в `sw.js`.

## Отзывы, чат, уведомления о сериях

Всё через Core: `POST /api/core/action` и GET `/api/core/*` (`worker/core/`). Отзывы, комментарии к сериям, общий чат, профили, списки, модерация, жалобы правообладателей — D1. Пишет только тот, кто вошёл (кроме открытых форм takedown/contact).

Пуши: браузер подписывается в профиле; Worker по cron сверяет календарь Shikimori и шлёт Web Push. На iPhone пуши работают только в установленном приложении (iOS 16.4+).

## Правообладателям, контакты, документы

`/rightholders`, `/contacts`, `/privacy`, `/terms` — `src/pages/Legal.tsx`, тексты в `src/data/legal.ts`
(их же Worker отдаёт поисковикам без JavaScript). Формы жалобы и обратной связи — `takedown-create` в Core (вход не нужен, капча Turnstile, если включена).

Возрастная маркировка: рейтинг Shikimori (`g`, `pg`, `pg_13`, `r`, `r_plus`, `rx`) → 0+, 6+, 12+, 16+, 18+
(`ageLabel` в `src/data/seo.ts`).

## Мой список: прогресс, импорт, синхронизация

Список вошедшего — таблица `lists` в D1. У каждого тайтла есть прогресс по сериям. Импорт: из Shikimori по нику и из файла экспорта MyAnimeList. Экспорт: XML в формате MAL и JSON-копия. Кнопка «Мои онгоинги в календарь» собирает `.ics`.

## Открытый профиль, достижения, обсуждение серий

- `/u/:id` — открытый профиль (включается в «Профиле»).
- Достижения считаются на сайте по списку и событиям.
- Под плеером обсуждение серии: пишет Core (`comment-save` / `comment-delete`).

## Совместный просмотр

Комнаты в D1 (код из 6 символов). Клиент опрашивает `/api/core` коротким polling, без Realtime. Позиция: `playing`, `position` и `at` (время сервера); сайт считает `position + (сейчас − at)`. Голосовой чат — WebRTC между браузерами (STUN Cloudflare и Google). RoomDO на Free не включаем.

## Превью ссылок и поиск

`worker/index.js` работает рядом со статическими файлами на Cloudflare Workers (`wrangler.animelife.jsonc`, `run_worker_first: false`).
Переход человека по странице Cloudflare отдаёт статическим `index.html` без Worker. Worker получает запросы без файла и без `Sec-Fetch-Mode: navigate`: поисковики, превью ссылок, `/api/*` и карту сайта. Роботов-сборщиков отсекает `worker/guard.js`.

- Основной сайт — `https://animelife.top`. С `www` и `*.workers.dev` — 301 на тот же путь.
- Для `/anime/:id`, `/watch/:id/:n`, `/together/:code` и `/u/:id` Worker подставляет title, описание и картинку (Open Graph), для тайтла — schema.org.
- `/sitemap.xml` — индекс: страницы, 500 популярных тайтлов, последние серии онгоингов.

Проверить локально: `curl -H "Host: animelife.top" localhost:8787/anime/52991`.

### SEO (кратко)

Шаблоны заголовков — `src/data/seo.ts`. Посадочные — `src/data/landings.ts` (жанры, типы, годы, сезоны). schema.org без чужого `aggregateRating`. IndexNow после публикации: `scripts/indexnow.mjs` из workflow `animelife.yml`.

Коды подтверждения в Search Console / Вебмастере: `GOOGLE_SITE_VERIFICATION` и `YANDEX_VERIFICATION` в vars Worker (`keep_vars: true`) или DNS TXT.

## Хостинг

- https://animelife.top — основной адрес. Домен и Worker `anime` в аккаунте Cloudflare от регистратора, публикует `.github/workflows/animelife.yml` (`wrangler.animelife.jsonc`, секреты `ANIMELIFE_CF_EMAIL` и `ANIMELIFE_CF_API_KEY`)
- https://anime.artemdrr61f9.workers.dev — Cloudflare Workers Builds из `main` (`wrangler.jsonc`)
- https://anime-night.pages.dev — Cloudflare Pages, `.github/workflows/cloudflare.yml`
- Код: https://github.com/temos123fox/AnimeLife

Суточный экспорт D1: `.github/workflows/backup.yml`. Расшифровка старых копий Appwrite — архивный `decrypt-appwrite-backup.yml`, не прод-операция.

### Прокси Shikimori

На animelife.top, если Shikimori недоступен из сети зрителя или отвечает 429, запросы на 15 минут уходят в `/api/shiki/<путь API>` (`worker/shikiProxy.js`). Это запасной путь: каждый запрос тратит лимит Worker. Пустить все запросы через прокси: `VITE_SHIKIMORI_PROXY=1 npm run build`.
