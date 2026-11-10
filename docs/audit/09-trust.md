# AGENT 9 — Trust & Safety / Legal / Moderation

## Scope
- Роуты: `/moderation`, `/admin/analytics`, `/rightholders`, `/contacts`, `/privacy`, `/terms`, `/about`, `/app`, `/news`, `/changelog`, `/hentai*`, adult gate на тайтле/плеере/манге.
- UI: `Moderation.tsx`, `ModerationTakedowns|Comments|Chat`, `AdminAnalytics.tsx`, `Legal.tsx`, `ContactForm.tsx`, `AgeGateModal.tsx`, `AccountData.tsx`, report-кнопки в Reviews / EpisodeComments / CommunityChat / ClubPage.
- Данные/копия: `src/data/legal.ts`, `flags.ts` (достижения, не жалобы), `takedowns.ts`, `adult.ts`, `changelog.ts`, `couchMode.ts`.
- Core: `worker/core/{community,chat,clubs,misc,analytics,oauth}.js` — reports, mod-*, takedown-*, automod, account block via `users.status`.
- Legacy зеркало: `functions/community/src/{takedowns,automod,main,profile}.js` (не прод-путь при `BACKEND=core`).
- Вне зоны правок: `src/` не меняли; только этот файл.

## Карта зоны
| URL / модуль | Компонент | Статус |
|---|---|---|
| `/moderation` (+`?tab=`) | `Moderation` → reviews / comments / chat / takedowns | ok (очередь есть) |
| `/admin/analytics` | `AdminAnalytics` | ok (observability; не T&S-метрики) |
| `/rightholders` | `Legal` + `ContactForm` kind=takedown | ok (форма + SLA-копия 3 раб. дня) |
| `/contacts` | `Legal` + `ContactForm` kind=contact | ok |
| `/privacy` | `Legal` ← `legal.ts` | **broken** (описывает Appwrite Frankfurt, устарело) |
| `/terms` | `Legal` | thin (правила есть; баны/аудит обещаны сильнее, чем реализовано) |
| `/about`, `/app` | `Legal` | ok |
| `/news` | `News` (прокси Shikimori forum/news) | thin (чужой UGC без своей модерации) |
| `/changelog` | `Changelog` ← `changelog.ts` | ok (прозрачность продукта) |
| `/hentai`, `/hentai-manga`, adult на `/anime/:id` | Age Gate + `isAdultContent` | ok / soft (self-attest localStorage) |
| Жалобы: отзыв / коммент / общий чат | report-* → auto-hide@3 | ok |
| Жалобы: посты клубов | `club-post-report` | thin (автоскрытие есть, вкладки модерации нет) |
| Чат комнат Together | host delete only | thin (нет report/ban flow) |
| Баны аккаунтов | `users.status` в Core oauth | **dead UI** (логин режет, админ-инструмента нет) |
| `src/data/flags.ts` | achievement flags | ok / не trust-флаги |
| Telegram news | `scripts/telegram-news.mjs` | thin (fallback токена на Appwrite) |
| `tests/legal.spec.ts` | Playwright | **broken vs Core** (мокает Appwrite executions) |

## Баги и недочёты
| ID | Sev | Что | Evidence | Effort |
|---|---|---|---|---|
| T09-01 | P0 | Политика конфиденциальности врёт про хранилище: «Appwrite Cloud (Франкфурт)», сессия Appwrite. Прод — Core на Cloudflare (D1/KV, cookie `al_session`). Для RU/152-ФЗ это ложное информирование субъекта. | `src/data/legal.ts` §«С аккаунтом» / «Cookie»; `worker/core/README.md`, `src/api/config.ts` `BACKEND='core'` | S |
| T09-02 | P1 | Противоречие удаления аккаунта: `/contacts` и `AccountData` — самообслуживание; `/privacy` — «напишите в Контакты, удалим за 30 дней». | `legal.ts` contacts vs privacy; `AccountData.tsx` `account-delete` | S |
| T09-03 | P1 | Нет audit trail модерации: `mod-action` / `comment-mod-action` / chat-mod / `takedown-status` пишут только `hidden`/`moderated`/`status`, без who/when/reason/note. Невозможно разбирать споры и эскалации. | `worker/core/community.js` mod-*; `misc.js` takedown-status; UI без поля причины | M |
| T09-04 | P1 | Terms обещают ограничение доступа/бан за повторные нарушения; в Core есть `users.status` → «аккаунт заблокирован» при логине, но в `/moderation` нет UI ban/unban и нет связи «N нарушений → ban». | `terms` §Модерация; `worker/core/oauth.js` status check; `Moderation.tsx` только hide/show/delete контента | M |
| T09-05 | P1 | Takedown-очередь = смена статуса. Нет: скрытия плеера/тайтла по ID, дедлайна SLA, исходящего ответа с сайта, истории исполнителя. Обещанные «3 рабочих дня» — только текст. | `ModerationTakedowns.tsx`; `misc.js` takedown-*; нет blacklist titles | M |
| T09-06 | P2 | Посты клубов: report + auto-hide@3 есть; вкладки в `/moderation` и `*-mod-list/action` для клубов нет; флага `moderated` нет → после ручного разблокирования (если появится) снова спрячет. | `worker/core/clubs.js` club-post-report; `Moderation.tsx` tabs | M |
| T09-07 | P2 | Privacy: «своих cookie нет» + нет упоминания first-party `analytics-track` (пути, устройства, источники, online). Факт: сессионная cookie + своя аналитика в D1. | `legal.ts`; `worker/core/analytics.js`, `auth.js` cookie | S |
| T09-08 | P2 | Age Gate — только `localStorage animelife.age_verified=1`; 16+ для UGC в terms без любой проверки. Обход тривиален; для 18+ раздела — ожидаемо soft, но копирайт/возрастной риск для RU остаётся. | `AgeGateModal.tsx`; `terms` §Возраст | S (копия) / L (жёсткая верификация) |
| T09-09 | P2 | `tests/legal.spec.ts` мокает `cloud.appwrite.io/.../community/executions` — при Core happy-path формы не покрыт. | `tests/legal.spec.ts` `mockCommunity` | S |
| T09-10 | P3 | `ContactForm` комментарий «SDK Appwrite подгружается…»; `telegram-news.mjs` fallback токена через Appwrite variables. Шум и ложный ops-путь. | файлы выше | S |
| T09-11 | P3 | Together room chat: нет «Пожаловаться»; только host/self delete. Стена профиля / клубы частично покрыты, комнаты — дыра. | `Together.tsx` grep report=∅ | M |
| T09-12 | P3 | HYPOTHESIS: новости `/news` рендерят текст/картинки Shikimori без своей фильтрации (DOMParser убирает script, но контент чужой). Риск репутации/возрастных материалов в ленте. | `News.tsx` `parse()` | S–M |

## UX / продукт
| ID | Sev | Боль | Кому больно | Идея |
|---|---|---|---|---|
| U09-01 | P1 | Модератор не видит «сколько в очереди» и клубы; нет бана автора из карточки жалобы | Админы | Бейджи на табах + «Заблокировать автора» + вкладка Клубы |
| U09-02 | P1 | Правообладатель не получает статус/тикет; админ не видит просрочку 3 дней | Legal / ops | Тикет-ID в ответе формы + фильтр «просрочено» + mailto-шаблон ответа |
| U09-03 | P2 | Зритель читает privacy про Appwrite — недоверие / претензия | Все / регулятор | Переписать storage map под Core (где что лежит) |
| U09-04 | P2 | Правила общения в terms есть, но нет короткой «Правила сообщества» у кнопки «Пожаловаться» | UGC-авторы | Линк «что нельзя» рядом с report |
| U09-05 | P2 | AdminAnalytics сильный для продукта, но ноль trust-метрик (reports open, auto-hides/day, takedown SLA) | Админы | Блок «Модерация за 7 дней» на той же странице или виджет на `/moderation` |
| U09-06 | P3 | Changelog прозрачен; news — чужие. Зритель может принять Shikimori-новость за редакцию AnimeLife | Читатели | Явнее «источник: Shikimori» в UI (сейчас в lead есть, усилить на карточке) |

## Техдолг
| ID | Sev | Что | Где |
|---|---|---|---|
| D09-01 | P1 | Legal copy рассинхрон с архитектурой Core | `src/data/legal.ts` (+ SSR в `worker/index.js`) |
| D09-02 | P2 | Дубль automod/takedowns: `functions/community` vs `worker/core` | держать единый источник правды под Core |
| D09-03 | P2 | Legal e2e на мёртвом Appwrite mock | `tests/legal.spec.ts` → `/api/core` |
| D09-04 | P3 | Нет таблицы/лога `moderation_events` | схема D1 + запись в mod-* |
| D09-05 | P3 | Club reports без `moderated` parity с reviews/comments/chat | `clubs.js` |

## Идеи новых функций (зона)
| ID | Value | Зачем | Зависимости | Effort | Риск |
|---|---|---|---|---|---|
| I09-01 | Высокий | Карточка «Скрыть тайтл/плеер» из takedown (blacklist animeId / source) | Core + TitlePage/Player check | M | Ложные срабатывания SEO |
| I09-02 | Высокий | Ban/mute UI + срок + причина; отражение в terms | `users.status` / prefs + audit log | M | Abuse админом без 2-го модератора |
| I09-03 | Средний | Trust dashboard: open reports, auto-hides, aged takedowns | analytics + counts SQL | S–M | Worker reads на Free |
| I09-04 | Средний | Публичный статус жалобы по коду обращения (без PII) | takedown token | M | Enumeration |
| I09-05 | Средний | Короткий «Кодекс» + in-product tips при 1-й публикации | legal + Reviews/Comments | S | Низкий |
| I09-06 | Низкий | Report в Together + kick с записью | rooms + mod | M | Сложность realtime |
| I09-07 | Низкий | Еженедельный digest модерации в Telegram (как changelog-news) | telegram-news | S | Нужен bot token без Appwrite |

## Быстрые победы (≤1–2 дня)
- Переписать `/privacy` под Core: Cloudflare/D1/KV, cookie сессии, first-party analytics «без рекламных счётчиков», удаление через «Мои данные».
- Синхронизировать `/privacy` с `/contacts` про self-serve delete (убрать «только письмо / 30 дней» или оставить как fallback для потерянного входа).
- Вкладка «Клубы» в `/moderation` + `club-post-mod-list/action` по образцу comments (с `moderated=1`).
- Починить `tests/legal.spec.ts` на `/api/core`.
- На `/moderation` показать counts очередей (хотя бы `length` после load) и deep-link «автор → профиль».
- Убрать Appwrite-fallback в `telegram-news.mjs` / устаревшие комментарии ContactForm.

## Не трогать / уже ок
- Очередь отзывов/комментов/чата: report → 3 → auto-hide; «Оставить» ставит `moderated` и не даёт снова спрятать — хорошая база.
- Automod (`heldReason`: мат/чужие ссылки) + honeypot `website` + rate limits takedown + Turnstile.
- Страницы правообладателям/контактам с единым `legal.ts` и SSR в Worker — правильный SEO/прозрачность.
- Age Gate + изоляция `/hentai*` + couch mode, скрывающий 18+/сообщество.
- Self-serve export/delete в `AccountData` (продуктово сильнее, чем privacy-текст).
- Changelog как канал прозрачности изменений.
- AdminAnalytics (качество плеера, client errors) — полезный соседний контур, не ломать.

## Вопросы к продакту
1. Юр. статус сайта для RU: физлицо / ИП / «информационный проект»? Нужны ли реквизиты оператора ПДн в privacy (152-ФЗ)?
2. SLA takedown 3 раб. дня — оставляем публично? Если да — нужен хотя бы ops-процесс (почта + blacklist), иначе риск претензии «не исполнили обещание».
3. Баны: кто кроме label `admin`? Нужен ли роль `moderator` без доступа к analytics?
4. 16+ UGC — только дисклеймер или мягкий checkbox при первой публикации?
5. Новости Shikimori — оставляем как агрегатор или своя лента/модерация?
6. AGENT 5 (Account): подтвердить, что export/delete на Core полные (чтобы privacy ссылалась точно).
7. AGENT 7 (Manga/Adult) / AGENT 8 (Platform): пересечение age-gate soft vs WAF/observability — кто владеет risk register?

## Happy-path (кратко)
1. Зритель жмёт «Пожаловаться» на отзыв → Core `review-report` → при 3 жалобах `hidden`.
2. Админ открывает `/moderation` → hide/show/delete.
3. Правообладатель `/rightholders` → форма → `takedown-create` → админ `?tab=takedowns` → done/rejected.
4. 18+: Age Gate → localStorage → каталог/плеер.
5. Пользователь `/account` → «Мои данные» → export / delete.

## Edge cases
- Не-админ на `/moderation` / `/admin/analytics` — текст «только для…», API 403.
- Takedown без `animelife.top` в links / без confirm — 400.
- Honeypot `website` заполнен — `{ok:true}` без записи.
- Забаненный `status=0` — не логинится; из UI забанить нельзя.
- Adult URL `/anime/:id` с rx/hentai — gate срабатывает (`isAdultContent`), не только `/hentai`.
- Legal e2e на Appwrite mock — ложнозелёный/красный вне реальной отправки.
