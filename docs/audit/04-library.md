# AGENT 4 — Library

Аудит зоны списков / библиотеки / подборок / retention. Только чтение кода; `src/` не менялся.

## Scope

| В зоне | Вне зоны (смежно) |
|--------|-------------------|
| `/library` (`LibraryPage`), вкладки new / history / статусы | Плеер целиком (AGENT 3) — только стык `setWatched` / history |
| `/my-list` (`MyList`), redirect `/watching` → `?tab=new` | Account/OAuth кроме UI `ShikimoriSync` (AGENT 5) |
| `Watching` (inbox «Новые серии»), `Continue` на Home + Library | Together / rooms |
| `Collections` + `UserCollections` (полка/карточка/редактор) | Core collections API deep-dive |
| `WatchStreak`, `ListTools`, `listImport`, `shikiSync` UI | Worker `shiki.js` только как evidence push |
| `myList` / `history` / inbox × watchingIds | Manga lists |

**Метод:** роуты `App.tsx` → pages/components/data; happy-path; edge (импорт, tombstone, multi-device); гипотезы — `HYPOTHESIS`.

---

## Карта зоны

### Роуты

| URL | Компонент | Роль |
|-----|-----------|------|
| `/library` | `LibraryPage` | Хаб: ListTools + табы |
| `/library?tab=new` | `Watching` embedded | Новые серии / week digest |
| `/library?tab=history` | `ContinueShelf` | Продолжить (history ≤12) |
| `/library?tab={watching\|planned\|…}` | `MyList` embedded | Статусные сетки |
| `/my-list` | `MyList` | Дубль хаба списка (чипы статусов) |
| `/watching` | Navigate → `/library?tab=new` | Legacy |
| `/collections` | `Collections` | Кураторские полки + lazy user shelf |
| `/collections/my\|new`, `/c/:id`, `/c/:id/edit` | `UserCollections*` | UGC-подборки |
| `/auth/shikimori` | `AuthCallback` | OAuth link → `/account` |
| Home `ContinueWatching` / `NewEpisodesShelf` | `Home.tsx` / `HomeShelves` | Retention на главной |
| Player `WatchStreak` | `WatchStreak.tsx` | Стрик / сезон |

### Данные (local → sync)

| Store | Key | Sync |
|-------|-----|------|
| `listStore` | `anime.mylist.v1` | Core list + prefs; `removedStore` tombstones |
| `historyStore` | `anime.history.v1` | prefs.history (cap 12) |
| `watchLogStore` | `anime.watchlog.v1` | **не** в SyncedPrefs |
| `shikiLinkStore` | `anime.shiki.v1` | сервер `shiki_links` + local nick |
| inbox / follow / mute | inbox + `anime.follow/mute.v1` | push resync |

### Навигация

- Dock/Navbar: одна «Библиотека» (`IN_LIBRARY`), badge inbox.
- Много внешних ссылок всё ещё на `/my-list` (Home shelf, Account hub, ProfileStats, HoverCards…).
- Shikimori OAuth UI только в `ProfileSettings` (`ShikimoriSync`), не в Library.

---

## Баги

### P1 — `mergeImported` не обновляет статус (и затирает tombstone)

- **Evidence:** `src/data/listImport.ts` → `mergeImported` в `src/data/myList.ts` (145–169): для существующего id пишутся только `watched`/`rating`, **status не трогается**; цикл `delete removed[e.anime.id]` снимает tombstone.
- **Эффект:** «Забрать с Shikimori» / импорт по нику / MAL не переносит completed→watching и т.п.; удалённый локально тайтл, ещё живой на Shiki, **возвращается**.
- **Effort:** S–M.

### P1 — `autoSync` после OAuth часто не стартует до reload / смены playback

- **Evidence:** `AuthCallback` → `connectShikimori` пишет `anime.shiki.v1`, **без** `autoSync()`. `Layout.tsx` (97–105): `useEffect([playback])` читает LS один раз при `playback===false`; к моменту connect LS ещё пуст, после navigate на `/account` эффект не перезапускается. `restoreLink()` вызывает `autoSync`, `connectShikimori` — нет.
- **Эффект:** «статусы уходят сами» обещано в UI, но до F5/захода на `/watch` исходящий sync молчит.
- **Effort:** S.

### P1 — Две формулы «что новое»: Home shelf ≠ Library «Новые серии»

- **Evidence:** `HomeShelves.NewEpisodesShelf` — `watched = max(list.watched, history.episode-1)`; `Watching.tsx` / inbox — только `list.watched` (+ `watchingIds`).
- **Эффект:** на главной «всё досмотрено», во вкладке Library те же тайтлы в «Можно смотреть» (или наоборот).
- **Effort:** S.

### P2 — Удаление из AnimeLife не удаляет rate на Shikimori

- **Evidence:** `shikiSync.autoSync` шлёт только изменённые записи текущего списка; `removedStore` в push не участвует. Worker `shiki-push` — PATCH/POST only (`worker/core/shiki.js`).
- **Effort:** M (нужен DELETE rate + политика).

### P2 — Двойной `ListTools` на статусных вкладках Library

- **Evidence:** `LibraryPage` всегда рендерит `<ListTools />`; embedded `MyList` снова рендерит `<ListTools />` + `CalendarExport`.
- **Effort:** S.

### P2 — JSON-экспорт без импорта

- **Evidence:** `exportJson` есть; обратного `importJson` / file picker в `ListTools` нет → «резервная копия» односторонняя.
- **Effort:** S.

### P2 — Ссылки «Мой список» ведут мимо Library-хаба

- **Evidence:** `NewEpisodesShelf` `more: { to: '/my-list' }`; Account / ProfileStats / HoverCards → `/my-list`. Changelog уже описывает unified Library.
- **Effort:** S.

### P3 — Offline shelf path устарел

- **Evidence:** `offlineShelf.isShelfPath` = `/my-list|/watching`, не `/library`.
- **Effort:** S.

### P3 — Подписи статусов расходятся

- **Evidence:** Library tab `В планах` vs `listStatuses` / toast `Буду смотреть`.
- **Effort:** S.

### HYPOTHESIS P2 — Стрик начисляется за открытие серии, не за досмотр

- **Evidence:** `Player` `useEffect` → `logEpisode` при смене episode; `WatchStreak` считает дни из `watchLog`. `onEnded` отдельно двигает `setWatched`.
- **Риск:** retention-цифра завышена; при честном «досмотрел» UX другой.

### HYPOTHESIS P2 — `watchLog` не синхронизируется → стрик/дайджест «за неделю» локальны

- **Evidence:** `SyncedPrefs` в `auth.ts` без watchLog; после входа на другом устройстве стрик с нуля при живом списке.

---

## UX

| ID | Sev | Наблюдение | Evidence |
|----|-----|------------|----------|
| UX1 | P2 | Shikimori sync спрятан в профиле; в Library только «импорт по нику» (публичный список) — разный mental model | `ProfileExtras.ShikimoriSync`, `ListTools` |
| UX2 | P2 | После connect нет auto-pull; кнопки «Отправить / Забрать» ручные; silent `.catch` в autoSync | `shikiSync.ts` 102 |
| UX3 | P3 | Пустые состояния Library/Watching/MyList сильные (CTA, PickForMe, popular shelf) | `MyList.StatusEmpty`, `Watching` empty |
| UX4 | P3 | Continue: Home 6 карточек, Library 12; remove+undo ок; прогресс-бар = episode/total, не позиция в серии | `LibraryPage`, `Home` |
| UX5 | P3 | User collections empty + editor из списка — хорошо; кураторские полки не зависят от Appwrite (комментарий в `Collections` устарел) | `Collections.tsx` L76 |
| UX6 | P3 | WatchStreak только в Player — в Library нет «продлите стрик / что смотреть сегодня» | `WatchStreak` usage |
| UX7 | P3 | Week digest + PushSettings внутри вкладки new — плотно для первого визита | `Watching.tsx` |

---

## Техдолг

| ID | Effort | Долг |
|----|--------|------|
| TD1 | S | Комментарий «Подборки зрителей тянут SDK Appwrite» — фактически `/api/core/collections` |
| TD2 | M | Три поверхности одного списка: `/library`, `/my-list`, status chips — дрейф копий/ссылок |
| TD3 | M | `mergeImported` vs `mergeList` (LWW по `updatedAt`) — разная семантика merge |
| TD4 | S | `offlineShelf` / changelog / deep-links не до конца переехали на `/library` |
| TD5 | L | Shiki autoSync: батчи 10 + pause 220ms/item; silent fail; нет очереди удалений |
| TD6 | M | Снимок `AnimeCard` в списке без `episodesAired` — прогресс онгоингов грубее, чем на Title |

---

## Идеи функций

1. **Единый «synced progress»** для Home + Library + inbox: `effectiveWatched = max(list.watched, history.ep-1, …)` с явным правилом.
2. **Smart merge импорта:** статус LWW по `updatedAt` / выбор «Shiki wins / Local wins / Ask»; tombstone не сбрасывать без confirm.
3. **Library retention strip:** компактный WatchStreak + «сегодня не смотрели» + deep-link в Continue / PickForMe.
4. **Shikimori panel в Library** рядом с ListTools (connect status, last sync, pull/push) — не только Account.
5. **Import JSON** зеркально export; опционально zip MAL+JSON.
6. **После connect:** optional «Забрать список сейчас?» wizard.
7. **Стрик за досмотр** (порог % или onEnded) + sync watchLog для multi-device.
8. **Коллекции → список:** «добавить все в Буду смотреть» с undo.
9. **Рассинхрон badge:** показать «N тайтлов отличаются от Shikimori» перед pushAll.

---

## Быстрые победы

| # | Effort | Что | Зачем |
|---|--------|-----|-------|
| 1 | S | Вызвать `autoSync()` из `connectShikimori` (+ подписка Layout на `shikiLinkStore`) | P1 sync |
| 2 | S | В `mergeImported` обновлять `status` (и rating по политике); не `delete removed` без явного pull-флага | P1 desync |
| 3 | S | Одна формула watched для `NewEpisodesShelf` и `Watching` | P1 UI split |
| 4 | S | Убрать второй `ListTools` при `embedded` | шум |
| 5 | S | `more` полки → `/library?tab=new`; массово заменить `/my-list` deep-links | навигация |
| 6 | S | `isShelfPath` += `/library` | offline |
| 7 | S | Унифицировать «В планах» / «Буду смотреть» | копирайт |
| 8 | S | Импорт JSON в ListTools | backup loop |

---

## Не трогать

- Unified `/library` + redirect `/watching` — правильное направление; не плодить третий хаб.
- Tombstones `removedStore` + LWW `mergeList` для аккаунт-sync — не ломать ради Shiki.
- Пустые состояния с CTA / PickForMe / popular ongoing — сильная retention-база.
- Отложенный `autoSync` вне `/watch` (не стартовать тяжёлый subscribe во время playback) — сохранять intent, чинить только trigger.
- Не предлагать paid DO / возврат Appwrite SDK для коллекций.
- Не предлагать glow/warm iframes defaults (perf-волна).

---

## Вопросы

1. Политика импорта/pull: **Shikimori всегда побеждает**, local wins, или conflict UI?
2. Должны ли удаления в AnimeLife **удалять** rates на Shikimori?
3. Стрик: открытие серии vs досмотр — продукт какое обещание?
4. Нужен ли sync `watchLog` между устройствами (квота prefs/D1)?
5. `/my-list` оставить как alias навсегда или soft-deprecate в пользу `/library?tab=…`?
6. Показывать ли Shikimori panel гостям (только nick-import) vs только залогиненным OAuth?

---

## Вердикт (для сводки)

Библиотека как **хаб** собрана хорошо (табы, empty states, inbox, Continue). Главный риск — **рассинхрон статусов/прогресса**: импорт не двигает status и бьёт tombstones, Home и «Новые серии» считают watched по-разному, Shiki autoSync после OAuth легко «молчит» до reload. Retention (streak, week digest, PickForMe) есть, но слабо связан с Library и multi-device.
