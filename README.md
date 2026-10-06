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
- `/genre/:slug`, `/type/:kind`, `/year/:yyyy`, `/year/:yyyy/:season` — подборки по жанру, типу, году и сезону
  (посадочные страницы для поиска, см. «SEO»)
- `/schedule` — расписание новых серий на неделю
- `/my-list` — «Мой список» со статусами «Смотрю», «Буду смотреть», «Просмотрено», «Брошено»
- `/watch/:id/:episode` — плеер: официальный трейлер и список серий
- `/account` — вход и регистрация (почта, VK ID, Яндекс, Google, Telegram)
- `/together` — «Вместе»: открытые комнаты и вход по коду; `/together/:code` — комната совместного просмотра

## Данные

Каталог, постеры, описания и трейлеры берутся из открытого API [Shikimori](https://shikimori.io/api/doc), ключ не нужен (`src/api/shikimori.ts`). На animelife.top запросы идут через кэширующий прокси в Worker (`/api/shiki`, см. «Хостинг»), на зеркалах и локально — прямо из браузера. Адрес можно поменять переменной `VITE_SHIKIMORI_URL`.

Если API недоступно, сайт показывает демо-данные из `src/data/catalog.ts`. История просмотра и «Мой список» хранятся в браузере (`localStorage`), а после входа синхронизируются через аккаунт.

Самих серий пока нет: для них нужен легальный источник видео.

## Аккаунты

Вход работает через [Appwrite Cloud](https://cloud.appwrite.io) (регион Франкфурт, проект `6abf65850016889f9b1b`, `src/api/appwrite.ts`). «Мой список» и история лежат в настройках пользователя (prefs), отдельная база не нужна. Другой проект можно подключить переменными `VITE_APPWRITE_ENDPOINT` и `VITE_APPWRITE_PROJECT`.

Appwrite принимает запросы только с зарегистрированных адресов. В проекте добавлены Web-платформы:

- `anime-night.pages.dev` и `*.anime-night.pages.dev` (Cloudflare Pages и превью)
- `maintech67.me` (бывшая копия на GitHub Pages, больше не работает)
- `animelife.top` и `www.animelife.top` (основной домен)
- `anime.artemdrr61f9.workers.dev` (Workers Builds)

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

Функция Appwrite `community` (`functions/community`) и база `anime` (TablesDB, таблицы `reviews`, `push`, `sent`, `community_chat`).
Отзывы читаются с сайта напрямую (чтение открыто всем), а пишет в таблицы только функция: она знает, кто вошёл,
поэтому чужое имя подставить нельзя. Один отзыв на тайтл от пользователя, 20–3000 символов, оценка 1–10.

Общий чат (`/chat`) доступен для чтения всем, писать могут вошедшие пользователи. Функция ограничивает частоту до 5 сообщений за 10 секунд; автор и модератор могут удалить сообщение. На чужие сообщения можно пожаловаться: после трёх жалоб они скрываются до проверки в `/moderation?tab=chat`. История старше 7 дней очищается по расписанию; workflow Appwrite автоматически создаёт таблицы чата и жалоб.

Пуши: браузер подписывается в профиле, подписка и список «Смотрю» уходят в функцию и обновляются при изменении списка.
Каждые 15 минут функция берёт календарь Shikimori, находит серии, вышедшие за последние 3 часа, и шлёт уведомление
подписчикам (Web Push, ключи VAPID: публичный в `src/api/appwrite.ts`, секретный только в переменной функции
`VAPID_PRIVATE_KEY`). На iPhone пуши работают только в установленном приложении (iOS 16.4+).

Развернуть функцию: упаковать `package.json` и `src/` в tar.gz и загрузить в `/functions/community/deployments`
с `entrypoint=src/main.js` и `commands=npm install --omit=dev` (как для `social-login`).

## Правообладателям, контакты, документы

`/rightholders`, `/contacts`, `/privacy`, `/terms` — одна страница `src/pages/Legal.tsx`, тексты в `src/data/legal.ts`
(их же Worker отдаёт поисковикам без JavaScript, страницы есть в `/sitemap-pages.xml`). Ссылки на них и строка
«Anime Life не хранит видео…» — в подвале (`FooterLinks`, константы в `src/data/seo.ts`).

Формы жалобы и обратной связи отправляют действие `takedown-create` функции `community` (вход не нужен, капча
Turnstile, если включена). Обращения лежат в таблице `takedowns` (права на таблицу пустые, пишет и читает только
функция), модераторы видят их на `/moderation?tab=takedowns` (`takedown-list`, `takedown-status`). Ограничения:
3 обращения в час с одного IP (в базе только хеш, соль — необязательная переменная функции `IP_HASH_SALT`),
5 в сутки на один email, 30 в час на всех. Создать таблицу: `APPWRITE_API_KEY=... node functions/community/setup-takedowns.mjs`
(повторный запуск пропускает то, что уже есть).

Возрастная маркировка: рейтинг Shikimori (`g`, `pg`, `pg_13`, `r`, `r_plus`, `rx`) превращается в 0+, 6+, 12+, 16+, 18+
(`ageLabel` в `src/data/seo.ts`) и показывается на странице тайтла, в плеере и в разметке `contentRating`.

## Мой список: прогресс, импорт, синхронизация

Список вошедшего пользователя лежит в таблице `lists` (строка = ID пользователя, право на чтение и правку только
у владельца; строку создаёт действие `list-init` функции `community`). Раньше список жил в настройках аккаунта,
но там лимит 64 КБ, а это около 150 тайтлов; старая копия переносится автоматически при первом входе.
У каждого тайтла есть прогресс по сериям («+1 серия»), последняя серия переносит его в «Просмотрено».
Импорт: из Shikimori по нику (открытый API `users/:nick/anime_rates`) и из файла экспорта MyAnimeList
(`.xml` или `.xml.gz`; id тайтлов на Shikimori и MAL совпадают). Экспорт: XML в формате MAL и JSON-копия.
Кнопка «Мои онгоинги в календарь» собирает `.ics` с ближайшими сериями из «Смотрю» и «Буду смотреть».

## Открытый профиль, достижения, обсуждение серий

- `/u/:id` — открытый профиль: включается в «Профиле», сводка (счётчики, любимое, что смотрит, достижения)
  лежит в таблице `profiles` и обновляется не чаще раза в минуту после изменений (`profile-save`, `profile-hide`).
- Достижения считаются на сайте по списку и разовым событиям (комната, ночной просмотр, отзыв, импорт),
  события синхронизируются с аккаунтом. Новое достижение показывает уведомление.
- Под плеером обсуждение серии: таблица `comments`, пишет функция (`comment-save`, `comment-delete`,
  не больше 6 комментариев за 10 минут), спойлеры скрыты до нажатия.

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

## Превью ссылок и поиск

`worker/index.js` работает перед статическими файлами на Cloudflare Workers (`wrangler.jsonc`, `run_worker_first`).
Через него идут все страницы, а файлы сборки (`/assets/*`), картинки, манифест и `sw.js` отдаются напрямую и не
тратят лимит Worker.

- **Один адрес для поисковиков.** Основной сайт — `https://animelife.top` (`ORIGIN` в Worker). С `www.animelife.top`
  и `anime.artemdrr61f9.workers.dev` Worker отвечает постоянным редиректом 301 на тот же путь на animelife.top.
  `canonical`, `og:url`, разметка schema.org, `/sitemap.xml` и `/robots.txt` везде указывают на animelife.top.
  Копии сайта на других адресах тоже называют канонической страницу на animelife.top (`useCanonical` в `src/data/pageMeta.ts`).
- **Превью и текст без JavaScript.** Для `/anime/:id`, `/watch/:id/:n`, `/together/:code` и `/u/:id` подставляются
  заголовок, описание и картинка (Open Graph, Twitter), для тайтла ещё разметка schema.org и простой текст страницы:
  название, год, жанры, описание, ссылки. На `/`, `/catalog` и `/ongoing` — список ссылок на популярные тайтлы.
  Приложение заменяет этот текст при запуске.
- **404 и noindex.** Незнакомый адрес, тайтл, которого нет на Shikimori, и закрытый или удалённый профиль отдаются
  с кодом 404 (приложение само показывает «Страница не найдена»). Комнаты `/together/:code`, `/account`, `/auth/*`,
  `/my-list` и `/moderation` получают `noindex`.
- `/sitemap.xml` — индекс карты сайта из трёх частей: `/sitemap-pages.xml` (разделы и посадочные страницы),
  `/sitemap-titles.xml` (500 популярных тайтлов и онгоинги, у онгоингов `lastmod`) и `/sitemap-episodes.xml`
  (последние 50 вышедших серий каждого онгоинга). Части с тайтлами и сериями кэшируются на сутки только полными:
  если Shikimori ответил не на все запросы, карта отдаётся без сохранения.

Если Shikimori или Appwrite не ответили за 3 секунды, отдаётся обычный index.html. Проверить локально:
`npm run build && npx wrangler@4 dev -c wrangler.animelife.jsonc`, затем
`curl -H "Host: animelife.top" localhost:8787/anime/52991` (страница тайтла) или `localhost:8787/genre/romance?page=2`.

### SEO

- **Заголовки и описания по шаблонам** (`src/data/seo.ts`, общий для Worker и приложения, поэтому `<title>` с сервера
  и после перехода внутри сайта совпадают). Тайтл: «Название (Original, год) — смотреть аниме онлайн бесплатно все
  серии | Anime Life», лишнее отбрасывается, чтобы уложиться в 70 знаков; у анонса — «дата выхода и трейлер».
  Серия: «Название 5 серия — смотреть онлайн бесплатно», своё описание и canonical у каждой серии. Описание тайтла
  (до 160 знаков): тип, год, серии, студия, жанры и начало сюжета.
- **Посадочные страницы** (`src/data/landings.ts`): 38 жанров `/genre/<slug>` (id жанров Shikimori, без взрослых),
  типы `/type/tv|movie|ova|ona|special`, годы `/year/2026` и сезоны `/year/2026/fall`, онгоинги `/ongoing`.
  У каждой свой h1, вводный текст и ссылки на соседние. Worker отдаёт список тайтлов обычными ссылками, приложение
  (`src/pages/Landing.tsx`) — сетку каталога с тем же фильтром. Пустая страница (год без тайтлов, `?page=999`) — 404.
- **Страницы списка `?page=N`** у каталога и посадочных: по 24 тайтла, ссылки «Назад/Дальше» и номера страниц
  обычными `<a href>` (до 20-й страницы). Canonical у страницы N указывает на неё саму; в каталоге с фильтрами — на
  `/catalog`. Поиск по сайту (`/catalog?q=`) получает noindex.
- **Текст без JavaScript.** У тайтла — хлебные крошки, жанры и год ссылками на посадочные, ссылки на серии
  (все до сотни, у длинных сериалов первые 10 и последние 90), связанное и похожее (`/related` и `/similar`
  Shikimori, кэш на сутки). У серии — соседние серии и ссылка на все серии. У расписания — серии на неделю по МСК.
- **schema.org** (JSON-LD): на главной `WebSite` с поиском (`/catalog?q=`) и `Organization`; у тайтла `TVSeries`
  или `Movie` (альтернативные названия, серии, даты, жанры, студия) и `BreadcrumbList`; у серии `TVEpisode`;
  у списков `ItemList`. Рейтинга (`aggregateRating`) нет: оценки берутся с Shikimori, а Google запрещает размечать
  чужие рейтинги. `VideoObject` тоже нет: у серий нет своей даты загрузки, превью и прямого адреса видео.
- `<meta name="robots" content="max-image-preview:large…">`, Open Graph и Twitter у каждой страницы, один h1
  на странице, `lang="ru"`. В robots.txt `Clean-param` для меток utm, чтобы Яндекс склеивал такие адреса.
- **IndexNow** (Яндекс, Bing и другие участники протокола): ключ лежит в `public/<ключ>.txt` и отдаётся по адресу
  `https://animelife.top/<ключ>.txt` — так поисковик проверяет, что ключ наш (ключ открытый по замыслу протокола).
  После публикации workflow `animelife.yml` запускает `scripts/indexnow.mjs`: он ждёт, пока файл ключа доступен,
  и отправляет в `yandex.com/indexnow` и `api.indexnow.org` адреса из `/sitemap-pages.xml` и 50 популярных онгоингов
  (около 150 адресов). Шаг не обязательный: ошибка не ломает публикацию. Посмотреть список без отправки:
  `node scripts/indexnow.mjs --dry-run`. Новый ключ — переименовать файл и поменять его содержимое
  (`openssl rand -hex 16`).

### Подтверждение сайта в Google и Яндексе

Worker добавляет в `<head>` каждой страницы `<meta name="google-site-verification">` и `<meta name="yandex-verification">`,
если заданы переменные `GOOGLE_SITE_VERIFICATION` и `YANDEX_VERIFICATION`. Значение — только код из атрибута `content`,
который выдаёт Search Console или Вебмастер. Задать их можно двумя способами, код менять не нужно:

- в `wrangler.animelife.jsonc` добавить `"vars": { "GOOGLE_SITE_VERIFICATION": "код", "YANDEX_VERIFICATION": "код" }`
  и опубликовать (workflow `animelife.yml`);
- или в панели Cloudflare (аккаунт регистратора): Workers & Pages → `anime` → Settings → Variables and Secrets → Add,
  тип Text. Публикация их не сотрёт: в настройках стоит `"keep_vars": true`.

Другой способ без кода — DNS: в Google Search Console добавить ресурс типа «Доменное имя» `animelife.top` и
TXT-запись `google-site-verification=…` в DNS домена (Cloudflare → DNS → Add record, тип TXT, имя `@`); так подтверждаются
сразу все адреса домена. Яндекс Вебмастер тоже умеет подтверждение через DNS (TXT `yandex-verification: …`).
После подтверждения добавьте карту сайта `https://animelife.top/sitemap.xml` (индекс, части поисковик найдёт сам).

## Хостинг

- https://animelife.top — основной адрес. Домен и Worker `anime` живут в аккаунте Cloudflare от регистратора, публикует workflow `.github/workflows/animelife.yml` с настройками `wrangler.animelife.jsonc` (нужны секреты `ANIMELIFE_CF_EMAIL` и `ANIMELIFE_CF_API_KEY`)
- https://anime.artemdrr61f9.workers.dev — Cloudflare Workers Builds из `main` (`wrangler.jsonc`)
- https://anime-night.pages.dev — Cloudflare Pages, workflow `.github/workflows/cloudflare.yml` (нужны секреты `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`)
- Код: https://github.com/temos123fox/AnimeLife (с 3 октября 2026; прежний репозиторий ShizukuZK/Anime и копия на GitHub Pages maintech67.me больше недоступны)

### Прокси Shikimori

На animelife.top (и `www`) приложение берёт данные не прямо с Shikimori, а через Worker: `/api/shiki/<путь API>`,
например `/api/shiki/api/animes?limit=1` (`worker/shikiProxy.js`). Ответы лежат в кэше Cloudflare, общем для всех
зрителей: тайтл — 6 часов, связанное, похожее, кадры, персонажи и ссылки — 12 часов, списки — 30 минут (поиск — час),
расписание — 15 минут, жанры — неделю, постеры из GraphQL — сутки. Если Shikimori тормозит дольше 8 секунд, отвечает
429 или ошибкой, отдаётся последняя копия (хранится ещё неделю), заголовок `X-Cache: HIT | MISS | STALE` показывает,
откуда ответ. Пропускаются только адреса, которые нужны приложению, остальное — 404; GraphQL — только запрос постеров.
Списки пользователей Shikimori (импорт по нику) и статистика профиля идут напрямую, мимо прокси. Картинки всегда
грузятся прямо с Shikimori. Каждый запрос к прокси тратит лимит Worker (100 тыс. в сутки), поэтому браузер держит
ответы 5 минут, а `/api/` закрыт в robots.txt. Зеркала, локальный запуск и тесты ходят на Shikimori напрямую; включить
прокси на другой сборке, где есть этот Worker: `VITE_SHIKIMORI_PROXY=1 npm run build`. Проверить локально:
`npm run build && npx wrangler@4 dev -c wrangler.animelife.jsonc`, затем дважды
`curl -i localhost:8787/api/shiki/api/animes?limit=1` (`X-Cache: MISS`, потом `HIT`).
