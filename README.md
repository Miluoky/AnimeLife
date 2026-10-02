# Anime Life

Anime Life — сайт для просмотра аниме. Дизайн: тёмная тема «Ночной кинотеатр», акцент `#FF5470`, шрифты Unbounded и Manrope.

## Запуск

```bash
npm install
npm run dev      # локальный сервер разработки
npm run build    # сборка в dist/
npm test         # браузерные тесты (Playwright, нужен `npx playwright install chromium`)
npm run size     # бюджет размера сборки после npm run build
```

На каждый PR GitHub Actions (`.github/workflows/ci.yml`) собирает сайт, проверяет типы и бюджет размера,
гоняет браузерные тесты на компьютере и телефоне и замеряет Lighthouse. Тесты подменяют Shikimori и Appwrite
заготовками из `tests/fixtures`, поэтому не зависят от сети.

Как сайт остаётся быстрым: главная входит в основную сборку, остальные страницы и SDK Appwrite грузятся отдельными
частями при первом открытии; постеры в сетках берутся лёгкими webp из GraphQL Shikimori; шрифты лежат в репозитории
(`src/fonts`), а не на Google Fonts; при наведении на карточку код и данные страницы тайтла подтягиваются заранее.

## Что есть

- `/` — главная: подборка недели, «Продолжить просмотр», популярное с фильтром по жанрам
- `/catalog` — каталог с поиском и фильтрами (жанр, тип, статус, год, оценка)
- `/anime/:id` — страница тайтла со списком серий
- `/ongoing` — онгоинги
- `/schedule` — расписание новых серий на неделю
- `/my-list` — «Мой список» со статусами «Смотрю», «Буду смотреть», «Просмотрено», «Брошено»
- `/watch/:id/:episode` — плеер: официальный трейлер и список серий
- `/account` — вход и регистрация (почта, VK ID, Яндекс, Google, Telegram)
- `/together` — «Вместе»: открытые комнаты и вход по коду; `/together/:code` — комната совместного просмотра

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

## Приложение на телефон

Сайт устанавливается как приложение (PWA): `public/manifest.webmanifest` задаёт название, иконки и ярлыки,
`public/sw.js` кэширует сайт, данные Shikimori и постеры, поэтому открытые раньше страницы работают без сети.
На Android и в Chrome появляется кнопка «Установить», на iPhone подсказка про «На экран Домой».
Service worker подключается только в собранной версии; при изменении логики кэша поднимите `VERSION` в `sw.js`.

## Отзывы и уведомления о сериях

Функция Appwrite `community` (`functions/community`) и база `anime` (TablesDB, таблицы `reviews`, `push`, `sent`).
Отзывы читаются с сайта напрямую (чтение открыто всем), а пишет в таблицы только функция: она знает, кто вошёл,
поэтому чужое имя подставить нельзя. Один отзыв на тайтл от пользователя, 20–3000 символов, оценка 1–10.

Пуши: браузер подписывается в профиле, подписка и список «Смотрю» уходят в функцию и обновляются при изменении списка.
Каждые 15 минут функция берёт календарь Shikimori, находит серии, вышедшие за последние 3 часа, и шлёт уведомление
подписчикам (Web Push, ключи VAPID: публичный в `src/api/appwrite.ts`, секретный только в переменной функции
`VAPID_PRIVATE_KEY`). На iPhone пуши работают только в установленном приложении (iOS 16.4+).

Развернуть функцию: упаковать `package.json` и `src/` в tar.gz и загрузить в `/functions/community/deployments`
с `entrypoint=src/main.js` и `commands=npm install --omit=dev` (как для `social-login`).

## Мой список: прогресс, импорт, синхронизация

Список вошедшего пользователя лежит в таблице `lists` (строка = ID пользователя, право на чтение и правку только
у владельца; строку создаёт действие `list-init` функции `community`). Раньше список жил в настройках аккаунта,
но там лимит 64 КБ, а это около 150 тайтлов; старая копия переносится автоматически при первом входе.
У каждого тайтла есть прогресс по сериям («+1 серия»), последняя серия переносит его в «Просмотрено».
Импорт: из Shikimori по нику (открытый API `users/:nick/anime_rates`) и из файла экспорта MyAnimeList
(`.xml` или `.xml.gz`; id тайтлов на Shikimori и MAL совпадают). Экспорт: XML в формате MAL и JSON-копия.
Кнопка «Мои онгоинги в календарь» собирает `.ics` с ближайшими сериями из «Смотрю» и «Буду смотреть».

## Совместный просмотр

Комнаты лежат в таблице `rooms` (ID строки и есть код из 6 символов), чат и реакции в `messages`. Читать их может
кто угодно по коду, пишет только функция `community` (действия `room-create`, `room-control`, `room-message`,
`room-close`, `room-time`, см. `functions/community/src/rooms.js`). В строке комнаты хранится `playing`, `position`
и `at` (время сервера); сайт подписан на строку через Appwrite Realtime и считает позицию сам:
`position + (сейчас − at)`. Часы устройства сверяются с сервером при входе в комнату. Расхождение больше 1,5 с
исправляется перемоткой, меньше — подстройкой скорости на несколько процентов (для своего файла).
Источник видео: трейлер с YouTube (IFrame API) или свой файл, который каждый выбирает у себя.

Кто в комнате: вошедшие зрители раз в 45 секунд отмечаются в таблице `members` (`room-presence`), список
обновляется через Realtime. Голосовой чат до 6 человек идёт напрямую между браузерами (WebRTC, каждый с каждым,
STUN Cloudflare и Google). Предложение и ответ с адресами передаются через `room-signal` в таблицу `signals`
с правом чтения только для адресата. Без TURN-сервера часть сетей (строгий NAT) соединиться не сможет.
Сеанс по расписанию: ведущий задаёт `startsAt`, комната попадает во «Вместе → Скоро», зрители скачивают `.ics`. Заброшенные комнаты
(6 часов без действий) и сообщения старше суток функция удаляет по расписанию.

## Хостинг

- https://anime-night.pages.dev — Cloudflare Pages, workflow `.github/workflows/cloudflare.yml` (нужны секреты `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`)
- http://maintech67.me/Anime/ — GitHub Pages, workflow `.github/workflows/pages.yml`
