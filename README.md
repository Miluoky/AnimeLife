# Anime

Сайт для просмотра аниме. Дизайн: тёмная тема «Ночной кинотеатр», акцент `#FF5470`, шрифты Unbounded и Manrope.

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
- `/account` — вход и регистрация

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

## Хостинг

- https://anime-night.pages.dev — Cloudflare Pages, workflow `.github/workflows/cloudflare.yml` (нужны секреты `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`)
- http://maintech67.me/Anime/ — GitHub Pages, workflow `.github/workflows/pages.yml`
