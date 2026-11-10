# AGENT 5 — Аккаунт / auth / профиль

## Scope
- Роуты: `/account`, `/account/recovery`, `/auth/callback`, `/auth/vk`, `/auth/shikimori`, `/u/:id`
- Модули UI: `Account`, `AuthCallback`, `PasswordRecovery`, `PublicProfile`, `ProfileSettings`, `ProfileExtras`, `AccountData`, `AppearanceSettings`, `TelegramNotifySettings`, `PushSettings`
- Auth/data: `src/data/auth.ts`, `socialAuth.ts`, `telegramMiniApp.ts`, `profile.ts`, `profileStyle.ts`, `api/config.ts` (`SOCIAL_LOGIN`)
- Core: `worker/core/oauth.js`, `worker/core/account.js`, `worker/core/actions.js` (`profile-*`), `worker/core/auth.js`
- Не в зоне deep-dive: Rooms DO, модерация, Shikimori sync логика списков (см. AGENT 4), social feed (AGENT 6)

## Карта зоны
| URL / модуль | Компонент | Статус |
|---|---|---|
| `/account` (гость) | `Account` + `AuthForm` + `SocialButtons` | ok (почта); TG/VK — ок при секретах; Google/Яндекс **off** |
| `/account` (юзер) | hub + appearance/notify/public/data | ok / thin (длинный скролл-хаб) |
| `/account/recovery` | `PasswordRecovery` | **broken / dead** — Core recovery всегда `false` |
| `/auth/callback` | `AuthCallback` | thin — legacy `userId/secret` → только `refresh()` |
| `/auth/vk` | `AuthCallback` → `finishVk` | ok (при `VITE_VK_APP_ID` + Worker) |
| `/auth/shikimori` | `AuthCallback` → `connectShikimori` | ok/thin (зависит от secrets; см. AGENT 4) |
| `/u/:id` | `PublicProfile` | **thin / broken edges** — фейковые метрики; privacy leak + возможный crash |
| Telegram Mini App | `telegramMiniApp.initTelegramMiniApp` | ok (auto-login через `telegram-webapp`) |
| OAuth Google/Yandex | `signInWithOAuth` + `stubProvider` | **dead / off** — флаги `0`, клиент throw, сервер 501 |
| Prefs sync | `auth.ts` adopt/push | ok |
| Export/Delete | `AccountData` + `worker/core/account.js` | ok на Core (тест e2e ещё про Appwrite) |
| Appearance / couch | `AppearanceSettings` | ok (локально, без логина) |

## Баги и недочёты
| ID | Sev | Что | Evidence | Effort |
|---|---|---|---|---|
| A5-B01 | P1 | **Скрытый/неопубликованный профиль не 404.** `profile-hide` ставит `hidden=1`, `profile-get` ищет `hidden=0`, при промахе отдаёт stub `{ name, summary: {} }` для любого существующего `users.id` → имя утекает; UI «Профиль скрыт» не показывается. | `worker/core/actions.js` `profile-get`; `worker/core/community.js` `profile-hide`; `PublicProfile` ждёт `null` | S |
| A5-B02 | P1 | **Crash на stub/пустом summary.** `PublicProfile` сразу читает `s.facts.episodes`, `s.watching`, `s.counts` без дефолтов → `TypeError` на скрытом профиле или битой строке. | `src/pages/PublicProfile.tsx` ~59–76 | S |
| A5-B03 | P1 | **Публичный профиль врёт метриками.** Стрик = `Math.max(7, …episodes…)`, жанры захардкожены (Экшен/Сёнен/…), «В сети» всегда `online={true}`, «На неделе» fallback `'6 ч 20 мин'`, манга всегда `0`. Trust/retention удар. | `PublicProfile.tsx` 58–69, 106–113, 320–339 | M |
| A5-B04 | P1 | **Сброс пароля по почте мёртв.** `corePasswordRecoveryEnabled() => false`; `requestRecovery`/`finishRecovery` всегда throw; UI честно прячет «Забыли пароль?» / показывает notice, но `/account/recovery` и копия «напишите в поддержку» — без рабочего канала. | `src/data/auth.ts` 270–284; `Account.tsx` 323–331; `PasswordRecovery.tsx` | L (нужен email на Worker) |
| A5-B05 | P2 | **Google/Яндекс выключены честно, но путь «включить флаг» ломается.** Клиент: `signInWithOAuth` сразу `SocialLoginError` (не ходит на сервер). Сервер: `stubProvider` → 501 даже при наличии `GOOGLE_*`/`YANDEX_*` («в разработке»). `AuthCallback` + `finishSession(userId,secret)` — legacy no-op кроме `refresh()`. | `socialAuth.ts` 15–22; `oauth.js` 352–373; `auth.ts` 263–268 | M–L |
| A5-B06 | P2 | **Кнопка Telegram выглядит «мертвой» при загрузке кода.** Пока нет `login` и нет `failure`, `<button disabled={!failure}>` — disabled без пояснения. | `Account.tsx` `TelegramButton` 117–132 | S |
| A5-B07 | P2 | **Произвольные `coverUrl`/`avatarUrl` в CSS/`img`.** `backgroundImage: url("${coverUrl}")` без allowlist схемы/хоста → CSS break / tracking pixels / смешанный контент. | `PublicProfile.tsx` 84–86; `ProfileExtras.tsx` 149–150, 217–262 | M |
| A5-B08 | P2 | **Вкладка «Списки» на /u/:id неполна.** Показывает только watching / high-rated / recent completed; planned/dropped/on_hold и полный counts-разрез в табе нет (легенда есть, полки — нет). | `PublicProfile.tsx` tab `lists` 386–409 | S–M |
| A5-B09 | P2 | **E2E `account-data` / `profile` мокают Appwrite**, не Core — регресс export/delete/privacy на проде тестами не ловится. | `tests/account-data.spec.ts`; `tests/profile.spec.ts` | M |
| A5-B10 | P3 | **Гость на `/account` видит Notify + Public + Achievements** ниже формы входа (секции не за `{user &&}`), хотя nav-якоря только у залогиненных. Шум и ложное ожидание «профиля без входа». | `Account.tsx` 487–515 | S |
| A5-B11 | P3 | **Delete: локальный список не чистится** — toast честно говорит об этом; после удаления guest-данные остаются → риск «призрак» чужого списка на общем ПК. | `AccountData.tsx` 62–64; `forgetDeletedAccount` | S |
| A5-B12 | P3 | **OAuth users email `*@oauth.local`** попадает в export/UI — ок технически, путает при «Мои данные». | `oauth.js` `findOrCreateOAuthUser` | S |

## UX / продукт
| ID | Sev | Боль | Кому больно | Идея |
|---|---|---|---|---|
| A5-U01 | P1 | Нет восстановления пароля → регистрация «в никуда» при забытом пароле | email-юзеры | Пока нет SMTP: явный CTA «войти через VK/Telegram» + support mailto/бот; не обещать «напишите в поддержку» без канала |
| A5-U02 | P1 | Фейковый «онлайн / стрик / жанры» роняют доверие к соц-слою | все зрители /u | Убрать фейк или считать из `watchLog`/жанров списка; «офлайн» если нет presence |
| A5-U03 | P2 | Google/Яндекс ожидаются в RU/глобали, кнопок нет (правильно) — но нет текста «пока почта / VK / TG» | гости | Одна строка под соц-кнопками о доступных способах |
| A5-U04 | P2 | Хаб аккаунта = длинная страница с якорями; на мобиле легко не найти Delete/Export | власть над данными | Sticky subnav или отдельные роуты `/account/data`, `/account/profile` |
| A5-U05 | P2 | Публичный профиль: нет slug/ника в URL (`/u/<uuid>`), шаринг неудобен | соц-рост | Опциональный `slug` / короткий код |
| A5-U06 | P3 | Mini App login silent (`catch` swallow) — при сбое подписи юзер просто «гость» без toast | TG WebApp | Toast «Не удалось войти через Telegram» + кнопка retry |
| A5-U07 | P3 | Telegram notify только для `tg_*` аккаунтов — email/VK не могут привязать бота | гибридные аккаунты | Link Telegram к существующему аккаунту (oauth_links) |

## Техдолг
| ID | Sev | Что | Где |
|---|---|---|---|
| A5-T01 | P2 | Dual account.js: legacy Appwrite `functions/community` + Core `worker/core/account.js` | риск правок «не в тот» |
| A5-T02 | P2 | README всё ещё ссылается на `src/api/appwrite.ts` для SOCIAL_LOGIN | `README.md` ~60 |
| A5-T03 | P2 | Google/Yandex stub на Worker и клиенте дублируют отказ по-разному | `socialAuth.ts` / `oauth.js` |
| A5-T04 | P3 | `finishSession` / Appwrite-era tokens в callback — мёртвый контракт | `AuthCallback` + `auth.ts` |
| A5-T05 | P3 | Telegram login через `getUpdates` polling из start/poll (WAF режет webhook) — хрупко при нагрузке | `oauth.js` drainTelegramUpdates; см. AGENT 8 |
| A5-T06 | P3 | Tests + community account.test.js живут в Appwrite-модели | `tests/*`, `functions/community/test` |

## Идеи новых функций (зона)
| ID | Value | Зачем | Зависимости | Effort | Риск |
|---|---|---|---|---|---|
| A5-I01 | Высокий | Email magic-link / recovery через CF Email Routing или Resend | Worker secret, SPF/DKIM | L | abuse/rate-limit |
| A5-I02 | Высокий | Реальные жанры + стрик из списка/`watchLog` на /u | данные уже в summary/prefs | M | CPU на publish |
| A5-I03 | Средний | Привязка нескольких OAuth к одному user (merge VK+TG+email) | `oauth_links`, UI settings | L | account takeover |
| A5-I04 | Средний | Google/Yandex OAuth довести до конца (сейчас даже secrets → 501 «в разработке») | Client ID/Secret, redirect allowlist | L | scope/PII |
| A5-I05 | Средний | Privacy presets: публичный профиль / только друзьям / скрыть «смотрю сейчас» | profile + follows | M | product scope |
| A5-I06 | Средний | Username/slug + QR шаринг профиля | D1 unique index | M | moderation nicks |
| A5-I07 | Низкий | Session list «где я вошёл» + revoke | sessions table уже есть | M | UX copy |
| A5-I08 | Низкий | После delete — опция «очистить данные браузера» | localStorage keys `anime.*` | S | accidental wipe |

## Быстрые победы (≤1–2 дня)
- **A5-B01/B02:** `profile-get` при `hidden=1` или отсутствии публичной строки → **404** (не stub); на клиенте — safe defaults для `summary`.
- **A5-B03 (минимум):** убрать hardcode «В сети», фейковый стрик/жанры/«6 ч 20 мин»; показывать блок только при реальных данных.
- **A5-B06:** loading-state на TG («Готовим вход…») вместо disabled-пустышки.
- **A5-U03:** подпись «Доступно: почта, VK, Telegram» (динамически из `SOCIAL_LOGIN`).
- **A5-B10:** секции notify/public для гостя свернуть или спрятать за login.
- **A5-B11:** чекбокс «также очистить данные в этом браузере» после delete.

## Не трогать / уже ок
- Фильтрация OAuth-кнопок по `SOCIAL_LOGIN.*.on` — Google/Яндекс **не** рисуются пустыми при дефолте `VITE_AUTH_*=0`.
- Клиентский отказ Google/Yandex без сетевого шума — честнее, чем вечная «Секунду…».
- VK ID PKCE + callback `/auth/vk`.
- Telegram bot confirm + Mini App `initData` HMAC (`verifyWebAppData`).
- Prefs merge/push (list/history/flags/positions/manga/seasonPlan/reactions).
- Core `account-export` / `account-delete` с подтверждением «УДАЛИТЬ», purge sessions, owned tables + wall.
- Appearance/couch локально без аккаунта — осознанно.
- Не предлагать Appwrite revival; Paid DO не нужен для auth.

## Вопросы к продакту
1. Нужен ли **email recovery** в ближайший спринт, или ставка на VK/Telegram как основной вход?
2. Публичный профиль по умолчанию **opt-in** (сейчас prefs `publicProfile`) — оставляем, или follow-only visibility?
3. Делаем ли **Google/Yandex** приоритетом, или хватит VK+TG+почта на год?
4. Фейковые жанры/стрик — баг на выпил или временный «Senku mock» до AGENT 6 presence?
5. После delete обязаны ли чистить localStorage автоматически (152-ФЗ UX), или достаточно export + toast?
)