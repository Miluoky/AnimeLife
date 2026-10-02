# Anime Life

Anime Life — сайт для просмотра аниме. Дизайн: тёмная тема «Ночной кинотеатр», акцент `#FF5470`, шрифты Unbounded и Manrope.

## Запуск

```bash
npm install
npm run dev      # локальный сервер разработки
npm run build    # сборка в dist/
```

## Что есть

- `/` — главная: подборка недели, «Продолжить просмотр», популярное с фильтром по жанрам
- `/catalog` — каталог с поиском и фильтрами (жанр, тип, статус, год, оценка)
- `/anime/:id` — страница тайтла со списком серий
- `/ongoing` — онгоинги
- `/schedule` — расписание новых серий на неделю
- `/my-list` — «Мой список» со статусами «Смотрю», «Буду смотреть», «Просмотрено», «Брошено»
- `/watch/:id/:episode` — плеер: официальный трейлер и список серий
- `/account` — вход и регистрация (почта, VK ID, Яндекс, Google, Telegram)

## Данные

Каталог, постеры, описания и трейлеры берутся из открытого API [Shikimori](https://shikimori.io/api/doc) прямо из браузера, ключ не нужен (`src/api/shikimori.ts`). Адрес можно поменять переменной `VITE_SHIKIMORI_URL`.

Если API недоступно, сайт показывает демо-данные из `src/data/catalog.ts`. История просмотра и «Мой список» хранятся в браузере (`localStorage`), а после входа синхронизируются через аккаунт.

Самих серий пока нет: для них нужен легальный источник видео.

## Аккаунты

Вход работает через [Appwrite Cloud](https://cloud.appwrite.io) (регион Франкфурт, проект `6abf65850016889f9b1b`, `src/api/appwrite.ts`). «Мой список» и история лежат в настройках пользователя (prefs), отдельная база не нужна. Другой проект можно подключить переменными `VITE_APPWRITE_ENDPOINT` и `VITE_APPWRITE_PROJECT`.

Appwrite принимает запросы только с зарегистрированных адресов. В проекте добавлены Web-платформы:

- `anime-night.pages.dev` и `*.anime-night.pages.dev` (Cloudflare Pages и превью)
- `maintech67.me` (GitHub Pages)

`localhost` разрешён по умолчанию. Новый домен сайта нужно добавить в консоли Appwrite: Overview → Platforms → Add platform → Web.

### Вход через VK, Яндекс, Google и Telegram

Кнопки на `/account` появляются, только когда сервис включён в `SOCIAL_LOGIN` (`src/api/appwrite.ts`, или переменными `VITE_AUTH_GOOGLE=1`, `VITE_AUTH_YANDEX=1`, `VITE_VK_APP_ID`, `VITE_AUTH_TELEGRAM=0` выключает Telegram).

- **Google и Яндекс** встроены в Appwrite. Сайт получает от Appwrite одноразовый токен на `/auth/callback` (`account.createOAuth2Token`), поэтому вход не зависит от сторонних cookie. Ключи приложения вносятся в консоли Appwrite: Auth → Settings → Google / Yandex. Адрес возврата для приложения у сервиса: `https://fra.cloud.appwrite.io/v1/account/sessions/oauth2/callback/<google|yandex>/6abf65850016889f9b1b`.
- **VK ID и Telegram** обслуживает функция Appwrite `social-login` (`functions/social-login`), она находит или создаёт пользователя `vk_<id>` / `tg_<id>` и выдаёт токен на минуту.
  - VK возвращает на `/auth/vk` с кодом (OAuth 2.1 + PKCE), функция обменивает его у VK. Доверенный адрес возврата у VK: `https://anime-night.pages.dev/auth/vk`.
  - Telegram работает как у других ботов: кнопка открывает `t.me/AnimeLifeAuth_bot?start=<код>`, бот спрашивает «Подтвердить вход?», а сайт раз в две секунды спрашивает функцию, подтверждён ли вход. Бот получает сообщения через вебхук на `https://anime-night-login.fra.appwrite.run` (домен функции) с секретом `TELEGRAM_WEBHOOK_SECRET`. Незавершённый вход хранится во временном заблокированном пользователе `tgl_<код>` и удаляется через 5 минут.
  - Переменные функции: `VK_APP_ID`, `TELEGRAM_BOT_TOKEN` (секрет), `TELEGRAM_WEBHOOK_SECRET` (секрет), `TELEGRAM_BOT_USERNAME`, `SITE_URL`.

Выложить новую версию функции:

```bash
cd functions/social-login && tar -czf ../social-login.tar.gz package.json src
curl -X POST https://fra.cloud.appwrite.io/v1/functions/social-login/deployments \
  -H "X-Appwrite-Project: 6abf65850016889f9b1b" -H "X-Appwrite-Key: $APPWRITE_API_KEY" \
  -F code=@../social-login.tar.gz -F activate=true -F entrypoint=src/main.js
```

## Хостинг

- https://anime-night.pages.dev — Cloudflare Pages, workflow `.github/workflows/cloudflare.yml` (нужны секреты `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`)
- http://maintech67.me/Anime/ — GitHub Pages, workflow `.github/workflows/pages.yml`
