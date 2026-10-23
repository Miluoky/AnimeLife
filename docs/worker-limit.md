# Лимит вызовов Worker: что сделано в коде и что включить в Cloudflare

На бесплатном плане Cloudflare Worker `anime` может обработать **100 000 вызовов в сутки**. 23.10.2026 лимит
кончился (Error 1027): за сутки пришло ~192 тыс. запросов, ~167 тыс. дошли до Worker, почти все от роботов из США.

Главное правило: **запрос, на который ответил WAF, Redirect Rule или статический файл, Worker не вызывает и в лимит
не идёт.** Отказ из самого Worker (403) тоже стоит вызова. Поэтому защита в два слоя: код отдаёт людям сайт без
Worker, а правила Cloudflare (раздел 3) отсекают роботов до Worker.

## 1. Какие запросы доходят до Worker

`run_worker_first: false` в `wrangler.animelife.jsonc` и `wrangler.jsonc` (было: Worker первым на всё, кроме
`/assets` и картинок). Cloudflare сначала ищет файл в сборке (`dist/`), Worker вызывается только когда файла нет и это
не переход браузера. Список путей в `run_worker_first` не подходит: с ним Cloudflare перестаёт различать переходы
(`Sec-Fetch-Mode`) и отдаёт `index.html` всем, включая поисковики (проверено в `wrangler dev`).

| Запрос | Было | Стало | Зачем Worker |
|---|---|---|---|
| Файлы сборки `/assets/*`, картинки, `sw.js`, манифест | без Worker | без Worker | не нужен |
| `/robots.txt` | Worker | **файл** `public/robots.txt` | не нужен |
| `/favicon.ico`, `/precache.json`, `/opensearch.xml`, `kodik.txt`, ключ IndexNow | Worker | **без Worker** (файлы; `favicon.ico` добавлен) | не нужен |
| Переход человека на любую страницу (браузер шлёт `Sec-Fetch-Mode: navigate`) | Worker | **без Worker**: Cloudflare отдаёт `index.html`, заголовок и canonical ставит приложение (`src/data/pageMeta.ts`) | не нужен |
| Страница для поисковика или превью ссылки (Googlebot, YandexBot, Bingbot, TelegramBot, vkShare… — без `Sec-Fetch-Mode`) | Worker | Worker | canonical, title, og:image, JSON-LD, 404, 301 |
| Данные Shikimori `/api/shiki/*` | Worker на **каждый** запрос приложения | **напрямую** `shikimori.io` из браузера (CORS открыт); Worker только запасной путь | кэш и старая копия при сбое |
| Серии YummyAnime `/api/yummy/videos/*` | Worker, браузер держит 5 мин | Worker, браузер держит **30 мин** | сжатие ответа ~1 МБ в 20–30 раз |
| MangaDex `/api/mangadex*` | Worker | Worker | в РФ MangaDex заблокирован, CORS закрыт |
| `/api/time` (часы комнаты «Вместе») | Worker | Worker | точное время узла |
| `/sitemap*.xml` | Worker | Worker | собирается из Shikimori |
| `www.animelife.top`, `anime.artemdrr61f9.workers.dev` | 301 из Worker | роботам 301 из Worker, людям — скрипт в `index.html`; лучше Redirect Rule (раздел 3) | — |
| `/search?q=…`, `/genre/magic` | 301 из Worker | роботам 301 из Worker, людям — переход в приложении (`src/App.tsx`) | — |

Как это работает: с датой совместимости не раньше 2025-04-01 и `not_found_handling: "single-page-application"`
Cloudflare отдаёт на переход браузера (`Sec-Fetch-Mode: navigate`) `index.html` сам, без Worker
([документация](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).
Поисковики и боты превью этот заголовок не шлют, поэтому получают от Worker полную страницу, как раньше.

### Отсев в самом Worker (`worker/guard.js`)

Первой строкой Worker, до сборки страницы и запросов к Shikimori:

- **410** на адреса сканеров уязвимостей (`.php`, `/wp-*`, `/.env`, `/.git` …);
- **403** сборщикам для ИИ и SEO-сервисам (Amazonbot, meta-externalagent, SemrushBot, AhrefsBot, GPTBot,
  ClaudeBot, Bytespider, PerplexityBot…), программам (`python-requests`, `Go-http-client`, HeadlessChrome…) и пустому User-Agent;
- «Chrome/Firefox» без `Sec-Fetch-Mode` (настоящие браузеры шлют его всегда) получает простой `index.html`
  без подзапросов и без места в кэше; к `/api/*` такой «браузер» получает 403;
- Googlebot, YandexBot, Bingbot, DuckDuckBot, Applebot, Mail.ru, TelegramBot, vkShare, facebookexternalhit,
  Twitterbot, Discordbot, WhatsApp, Viber и др. проходят всегда (`WELCOME` в `worker/guard.js`).

Ответ отказа кэшируется браузером и не трогает Shikimori, но **вызов всё равно засчитывается** — поэтому раздел 3.

## 2. Сколько вызовов Worker на заход

Замер в Playwright (заготовки вместо Shikimori, одна вкладка без кэша): сколько запросов к API делает страница.
Раньше каждый из них на animelife.top шёл через Worker.

| Что открыли | Было | Стало |
|---|---|---|
| Главная | 1 (страница) + 10 (`/api/shiki`) + 2 (`favicon.ico`, `precache.json`) = **13** | **0** |
| Тайтл `/anime/ID` | 1 + 7 (часть данных приходила вместе со страницей) = **5–8** | **0** |
| Серия `/watch/ID/N` с плеером | 1 + 2 + 1 (Yummy) = **4** | **1** (Yummy, дальше 30 мин из кэша браузера) |
| Каталог `/catalog` | 1 + 4 (с предзагрузкой 1–2) = **2–5** | **0** |
| Типичный визит человека: главная → тайтл → серия | **~20–25** | **~1** |
| Робот поисковика / превью: одна страница | 1 | 1 (без изменений, нужен для SEO) |
| Сборщик (Amazonbot и т.п.): одна страница | 1 + 3–4 подзапроса к Shikimori | 1, ответ 403 без подзапросов; **0** после правила WAF №1 |
| Робот с поддельным Chrome | 1 + 3–4 подзапроса | 0, если шлёт `Sec-Fetch-Mode`; 1 без подзапросов, если нет; **0** после правила WAF №2 |

Если Shikimori недоступен из сети зрителя или отвечает 429, его запросы на 15 минут идут через прокси, как было
раньше (`shiki.viaProxy` в sessionStorage). Это запасной путь, а не обычный.

Итог: люди почти перестают тратить лимит, остаются поисковики (единицы тысяч в сутки) и роботы. С правилами из
раздела 3 до Worker доходят только поисковики, превью ссылок и запасные запросы — ожидаемо **5–20 тыс. в сутки**.

## 3. Правила Cloudflare (включает владелец, ничего не включено)

Зона `animelife.top` в аккаунте регистратора. Все правила: **Security → Security rules (WAF) → Custom rules →
Create rule → Edit expression**, вставить выражение целиком. На бесплатном плане 5 своих правил, здесь 4.
Порядок важен: сверху вниз.

### №1. Блок сборщиков и сканеров — действие **Block**

```
(lower(http.user_agent) contains "amazonbot") or (lower(http.user_agent) contains "meta-externalagent") or
(lower(http.user_agent) contains "meta-externalfetcher") or (lower(http.user_agent) contains "semrush") or
(lower(http.user_agent) contains "ahrefs") or (lower(http.user_agent) contains "mj12bot") or
(lower(http.user_agent) contains "dotbot") or (lower(http.user_agent) contains "petalbot") or
(lower(http.user_agent) contains "bytespider") or (lower(http.user_agent) contains "gptbot") or
(lower(http.user_agent) contains "ccbot") or (lower(http.user_agent) contains "claudebot") or
(lower(http.user_agent) contains "perplexity") or (lower(http.user_agent) contains "dataforseo") or
(lower(http.user_agent) contains "blexbot") or (lower(http.user_agent) contains "python-requests") or
(lower(http.user_agent) contains "go-http-client") or (lower(http.user_agent) contains "headlesschrome") or
(http.user_agent eq "") or (http.request.uri.path contains ".php") or (http.request.uri.path contains "/.env") or
(http.request.uri.path contains "/.git") or starts_with(http.request.uri.path, "/wp-")
```

Зачем: то же, что `worker/guard.js`, но до Worker — 0 вызовов. Риск для людей: нет (у браузеров таких строк нет).

### №2. Поддельные браузеры — действие **Block**

```
((http.user_agent contains "Chrome/") or (http.user_agent contains "Firefox/")) and
not any(http.request.headers.names[*] == "sec-fetch-mode") and not cf.client.bot
```

Зачем: программа называет себя Chrome, но не шлёт заголовок, который настоящий Chrome (с 2019) и Firefox (с 2021)
шлют на каждый запрос. Это основная масса «Chrome/145» из США. Googlebot и Bingbot тоже пишут «Chrome/», их
пропускает `cf.client.bot` (проверенные роботы Cloudflare). Риск: очень старый браузер или корпоративный прокси,
который вырезает заголовки, — единицы. Если что-то сломается, поменять действие на **Managed Challenge**.

### №3. Дата-центры без статуса проверенного робота — действие **Managed Challenge**

```
(ip.src.asnum in {16509 14618 8075 396982 14061 24940 16276 63949 20473 45102 132203 37963}) and
not cf.client.bot and not starts_with(http.request.uri.path, "/assets/") and
not (lower(http.user_agent) contains "telegrambot") and not (lower(http.user_agent) contains "vkshare") and
not (lower(http.user_agent) contains "facebookexternalhit") and not (lower(http.user_agent) contains "twitterbot") and
not (lower(http.user_agent) contains "discordbot")
```

Сети: AWS (16509, 14618), Microsoft (8075), Google Cloud (396982), DigitalOcean (14061), Hetzner (24940),
OVH (16276), Linode (63949), Vultr (20473), Alibaba (45102), Tencent (132203, 37963). Люди из дома и с телефона
сидят в сетях провайдеров, не здесь. Риск: зритель через VPN на таком хостинге увидит проверку «я не робот»
один раз (Managed Challenge, решается сам). Запросы `/api/*` из браузера после проверки идут с cookie и проходят.

### №4 (по желанию). Ограничение частоты — **Security rules → Rate limiting rules**

```
starts_with(http.request.uri.path, "/api/")
```
Считать по IP, **30 запросов за 10 секунд**, действие **Block на 10 секунд** (максимум бесплатного плана).
Зачем: один робот не выест лимит запросами к прокси. Риск: нет, приложение делает единицы запросов к `/api/`.

### Другие настройки в той же зоне

- **AI Crawl Control** (Security → Bots, или AI Crawl Control в меню): «Block AI bots / Блокировать на всех страницах».
  Бесплатно, не трогает поисковики. Риск: нет.
- **Bot Fight Mode** (Security → Bots): включить. Проверенных роботов (Google, Яндекс, Bing) не трогает.
  Риск: может мешать превью ссылок у мелких сервисов; если превью в Telegram/VK пропадут, выключить.
- **Redirect Rule для www** (Rules → Redirect Rules → Create): `http.host eq "www.animelife.top"`, тип Dynamic,
  выражение `concat("https://animelife.top", http.request.uri.path)`, 301, «Preserve query string».
  Тогда www не вызывает Worker совсем.
- **Cache Rules для HTML не помогут**: Worker на своём домене выполняется раньше кэша, каждый такой запрос —
  вызов. Поэтому страницы людям отдаются статикой, а не кэшем.
- **Workers Paid ($5 в месяц, 10 млн вызовов)** — страховка на случай нового наплыва, если правил не хватит.

## 4. Как проверить после выкладки

```
# Человек: Worker не вызывается — в ответе нет X-Page-Cache, это обычный index.html
curl -sI -H 'Sec-Fetch-Mode: navigate' https://animelife.top/anime/1 | grep -i 'x-page-cache\|content-type'
# Поисковик: полная страница от Worker
curl -s -A 'Mozilla/5.0 (compatible; YandexBot/3.0)' https://animelife.top/anime/1 | grep -o '<link rel="canonical"[^>]*>'
# Превью Telegram
curl -s -A 'TelegramBot (like TwitterBot)' https://animelife.top/anime/1 | grep -o '<meta property="og:image"[^>]*>'
# 404 для робота
curl -s -o /dev/null -w '%{http_code}\n' -A 'curl' https://animelife.top/anime/999999999
# Сборщик
curl -s -o /dev/null -w '%{http_code}\n' -A 'Amazonbot/0.1' https://animelife.top/anime/1   # 403
```

В Google Search Console «Проверка URL → Просмотреть просканированную страницу» должна показывать canonical
тайтла (значит, Googlebot получил страницу от Worker).

Где смотреть расход: **Workers & Pages → anime → Metrics → Requests** (вызовы за сутки) и **Security → Events**
(что отсекли правила). Без токена Cloudflare снаружи этого не узнать, поэтому отдельной проверки в
`scripts/source-health.mjs` нет.

## 5. Как откатить

Вместо `"run_worker_first": false` вернуть в обоих `wrangler*.jsonc` прежний список
`["/*", "!/assets/*", "!/*.png", "!/*.svg", "!/*.webmanifest", "!/sw.js"]` — Worker снова получает все страницы.
Прямые запросы к Shikimori выключает флаг сборки `VITE_SHIKIMORI_PROXY=1` (всё через прокси, как раньше).
