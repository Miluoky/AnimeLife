# AGENT 3 — Player

## Scope

Зона просмотра серии: маршруты `/watch/:id/:episode` и `/hentai/watch/:id/:episode` (один `Player.tsx`), `VideoPlayer` + балансеры Kodik / Alloha / Anixart / Yummy / own (AniLibria, AnimeVost, Dream Cast, Sibnet), skips OP/ED, positions/history, danmaku, glow как продукт (opt-in), `NextEpisode`, `WatchReturn`, engage defer (`useEngageReady`).

**Вне scope этого файла:** витрина/title SEO (агенты 1–2), library sync UI (4), account (5), social rooms deep-dive (6), manga/adult catalog beyond watch gate (7), worker quotas (8), trust (9).

**Не предлагать откат:** `warmLimit() = 0`, glow default OFF, ambient OFF на `/watch`, danmaku default `false`, Core-only / не Appwrite, watch layout lite / engage defer. См. `docs/PERF_WATCH.md`.

Метод: чтение `App.tsx` роутов + `Player.tsx` / `VideoPlayer.tsx` / related; happy-path и edge; TODO/мёртвый код; гипотезы — `HYPOTHESIS`. Severity **P0–P3**, effort **S/M/L**, evidence — файл/символ.

---

## Карта зоны

| Поверхность | Путь / символ | Роль |
|---|---|---|
| Роуты | `App.tsx` → `watch/:id/:episode`, `hentai/watch/:id/:episode` | Оба → lazy `Player` |
| Страница | `src/pages/Player.tsx` | Озвучки/хосты, age gate, filler skip, goNext, engage shell, JSON-LD |
| Плеер | `src/components/VideoPlayer.tsx` (~82 KB) | Embed/own, resume, warm pool (limit 0), unavailable→trailer, AutoNext, Danmaku mount |
| Контролы / skips | `PlayerControls.tsx` | Seek, auto-skip OP/ED, autoNext store |
| Failover (живой) | `Player.fallBack` + `VideoPlayer` 3.5 s ladder + `onUnavailable` | Два каскада (см. Баги) |
| Failover (мёртвый) | `FailoverPlayer.tsx` | Нигде не импортируется |
| Балансеры | `api/balancers.ts`, `api/kodik.ts`, `api/anixart.ts`, `api/yummy.ts` (+ `worker/yummyProxy.js`) | Embed URL, домены Kodik, Yummy skips |
| Позиции | `data/positions.ts`, `data/playerTime.ts`, `data/watchLog.ts`, `data/history.ts` | Resume local; sync helpers для аккаунта |
| Glow | `PlayerGlow.tsx`, `AppearanceSettings.tsx` | Монтаж только при `glow === true` |
| Danmaku | `Danmaku.tsx` (`anime.danmaku.v2`, default false) | Cues из `/api/core/comments` + таймкоды |
| Engage | `watchModes.ts` → `useEngageReady` | Play / scroll / idle 8–12 s → комменты, WatchReturn, rating, Together |
| Return | `WatchReturn.tsx`, `NextEpisode.tsx` | Login nudge, TG remind, similar, countdown онгоинга |
| Adult | `AgeGateModal.tsx`, `data/adult.ts` | Soft gate (`animelife.age_verified`) до плеера |
| Perf doc | `docs/PERF_WATCH.md` | Бюджеты FPS / 1 iframe / glow off |

Happy-path (обычный тайтл): loadAnime → Kodik+free параллельно → (опц. wait Yummy) → defaultVoice → VideoPlayer → resume/`start_from` → savePosition → AutoNext/`goNext` → engage ниже fold.

---

## Баги

| Sev | Effort | Проблема | Evidence |
|---|---|---|---|
| **P1** | S | **Утечка пути `/hentai/watch` → `/watch`.** Смена серии, полоса серий, share moment, JSON-LD episode URL и CTA в `WatchReturn` всегда строят `/watch/...`. Со страницы `/hentai/watch/...` зритель выпадает из adult-шелла после любого next/prev. | `Player.tsx` `goTo` ~374; `EpisodePicker` Links ~771–812; `shareMoment` ~672; JSON-LD ~254; `WatchReturn.tsx` ~52 |
| **P1** | M | **Два владельца failover конфликтуют.** (1) `onUnavailable` → `fallBack` (1.2 s, уважает `manual` / `MAX_AUTO_SWITCHES`). (2) Внутренний таймер 3.5 s в `VideoPlayer` зовёт `setProvider` → при controlled режиме `onProviderChange` → `chooseVoice` → **`manual = true`**, после чего `fallBack` больше не крутит каскад. Лестница (2) считает табы «available» без проверки, что у тайтла реально есть серии в этом провайдере. | `VideoPlayer.tsx` ~197–201, ~230–262, ~1315–1320; `Player.tsx` ~151–187, ~483–487 |
| **P2** | S | **Имена/«нет в озвучке» в полосе серий только от AniLibria.** `names` пишутся из `onEpisodes` AniLibria; для Kodik/Anixart/Yummy missing-chips почти не работают → зритель кликает «пустую» серию и ловит трейлер/failover. | `Player.tsx` ~471, ~624, ~719–721 |
| **P2** | S | **`WatchReturn` «Следующая» игнорирует skip-fillers** и путь hentai (см. P1). Дубль CTA рядом с `watch-next`, но без той же семантики. | `WatchReturn.tsx` ~43–56 vs `Player.goNext` ~376–379 |
| **P2** | S | **Danmaku грузит комментарии сразу при монтировании плеера**, даже при default OFF — мимо engage defer (цель волны: не тянуть heavy ниже fold до play/idle). Лишний `/api/core/comments` + lazy chunk на старте серии. | `Danmaku.tsx` ~35–58; mount в `VideoPlayer.tsx` ~1414–1417; контраст `useEngageReady` ~74 |
| **P2** | M | **Resume несимметричен.** Kodik/Anixart/Yummy-Kodik: `start_from` + postMessage. Own HLS/mp4: `currentTime`. Alloha / CVH / Aksor / прочий non-Kodik embed: **нет** API seek → смена озвучки/хоста сбрасывает место или не восстанавливает. `HYPOTHESIS`: основная жалоба «сменил плеер — с начала» на Yummy non-Kodik. | `withStart` / `isKodik` `VideoPlayer.tsx` ~1551–1565; carry ~291–301 |
| **P3** | S | **`FailoverPlayer.tsx` — мёртвый «production-grade» stub** (React.FC, trivia/heatmap в комментариях, `console.warn`). Не подключён; путает аудит/merge с живым каскадом. | только `src/components/FailoverPlayer.tsx` (grep import = 0) |
| **P3** | S | Age gate — только `localStorage` флаг; отказ → `/`, не `/hentai`. Ок как soft UX, но смена серии на `/watch` (P1) ослабляет mental model adult-раздела. | `AgeGateModal.tsx`; `Player.tsx` ~345–347 |
| **P3** | S | Fillers берутся только с **первой** озвучки Anixart. `HYPOTHESIS`: расхождение разметки между студиями редко, но skip может пропустить сюжетную / оставить филлер. | `Player.tsx` ~129–131 |

Нет подтверждённого **P0** «плеер никогда не стартует» на happy-path: тесты `tests/player.spec.ts` покрывают AniLibria, трейлер, missing episode, controls.

---

## UX

| Sev | Effort | Наблюдение | Evidence |
|---|---|---|---|
| **P1** | M | После perf-волны **смена озвучки холодная** (warmLimit=0): каждый Kodik iframe с нуля (реклама/буфер). Есть тег «Подключаем озвучку…», но нет ожиданий по времени / прогресса. Не возвращать warm pool; улучшить feedback. | `warmLimit()` ~1545–1548; pending tag ~1386–1389; `PERF_WATCH.md` |
| **P2** | S | **Glow как продукт:** default OFF правильно; toggle только в `AppearanceSettings` («Подсветка…»). На `/watch` нет hint «можно включить в оформлении» → фича невидима, кнопка «Свет из кадра» появляется лишь после opt-in. | `AppearanceSettings.tsx` ~79–81; `Player.tsx` wantGlow; `GlowCaptureButton` |
| **P2** | S | **Engage defer:** комменты / rating / WatchReturn / Together до 8–12 s idle или play+scroll. Login nudge и «похожие» могут появиться поздно; Playwright форсит `webdriver` → ready сразу (тесты не ловят задержку). | `watchModes.ts` ~53–99; `Player.tsx` ~635–647 |
| **P2** | S | Недоступный источник: трейлер + текст + «Попробовать другой» / toast auto-switch — сильный happy-path. Слабее: при `manual` и мёртвом embed зритель остаётся на трейлере без явного «эта озвучка умерла, вот 3 живых». | `VideoPlayer.tsx` ~1439–1480; `fallBack` early-return if manual |
| **P2** | S | HostPicker (Yummy) занимает место до ответа (CLS-защита) — хорошо; при долгом Yummy строка «ищем» + пустой плеер (если waitYummy) может ощущаться как зависание. | `Player.tsx` ~124–126, ~450–453, ~494–498 |
| **P3** | S | Danmaku toggle с emoji `💬` на кадре; default off, но кнопка видна только если cues уже распарсены (после fetch) — мигание UI. | `Danmaku.tsx` ~90–98 |
| **P3** | S | Adult gate до метаданных плеера — ок; нет различия «18+ тайтл в общем каталоге» vs «раздел /hentai» после P1 path leak. | `isAdultContent` + routes |

---

## Техдолг

| Sev | Effort | Долг | Notes |
|---|---|---|---|
| **P1** | M | Один **watch base path** helper (`/watch` vs `/hentai/watch`) для navigate/Link/share/JSON-LD | Чинит P1 path leak системно |
| **P1** | M | **Один каскад failover** (предпочтительно page-level `fallBack` / `nextSource`); убрать или gated-off внутренний 3.5 s `setProvider` в controlled режиме | Сейчас два мозга |
| **P2** | S | Удалить или `deprecated/` **`FailoverPlayer.tsx`** | Не мержить с VideoPlayer |
| **P2** | M | `VideoPlayer.tsx` монолит: slots/warm/resume/failover/UI | Дробить осторожно после стабилизации каскада |
| **P2** | S | Danmaku: lazy fetch **только при ON**; не монтировать toggle-path до engage или до жеста | Согласовать с perf budget comments |
| **P3** | S | `BufferTrivia` на буфере >2.5 s — лишний DOM во время и так стрессового старта | `VideoPlayer.tsx` ~207–214, ~1413 |
| **P3** | L | Матрица «серия × озвучка доступна» из Kodik/Anixart/Yummy maps | Заменит AniLibria-only missing chips |

---

## Идеи функций

1. **Smart next source chip** — при unavailable показать 2–3 живых альтернативы с той же секундой (carry), без ручного перебора списка.
2. **Glow «попробовать» once** — мягкий one-shot на desktop после N минут watch, с явным FPS-warning; **не** default ON.
3. **Skip-fillers в AutoNext/WatchReturn** — единый `nextStoryEpisode()`.
4. **Resume badge для non-Kodik** — честно «продолжить нельзя — другой плеер» вместо тихого старта с 0.
5. **Озвучка: «эта серия есть у N студий»** на chip серии — снижает клики в тупик.
6. **Danmaku density / spoiler filter** уже частично есть; продукт: писать таймкод из плеера одной кнопкой (engage-zone, не на старте).
7. **Переключатель host sticky per studio** уже в sessionStorage — продлить в prefs аккаунта вместе с positions sync (без Appwrite SDK на watch start).

---

## Быстрые победы

| # | Effort | Что | Зачем |
|---|---|---|---|
| 1 | S | `const watchBase = location.pathname.includes('/hentai/') ? '/hentai/watch' : '/watch'` во всех goTo/Link/share/JSON-LD/WatchReturn | Чинит adult navigation |
| 2 | S | В controlled режиме **не** запускать внутренний 3.5 s provider ladder (оставить `onUnavailable`/`fallBack`) | Убрать dual-brain |
| 3 | S | `loadComments` в Danmaku только если `danmakuStore.get()` или по клику toggle | Меньше Worker/comments на cold watch |
| 4 | S | WatchReturn next → тот же `goNext`/filler-aware href | Паритет с кнопкой «Следующая серия» |
| 5 | S | Удалить или пометить unused `FailoverPlayer.tsx` | Меньше ложных «фич» |
| 6 | S | Одна строка under HostPicker при `waitYummy`: «Ищем запасные плееры…» уже есть searching — усилить disabled state плеера | Снижает ощущение зависания |

---

## Не трогать

- `warmLimit() = 0` / возврат warm iframe pool по умолчанию.
- Glow / ambient / danmaku **default ON**.
- Возврат Appwrite SDK на critical path watch.
- Откат engage defer целиком (можно тюнить таймауты 8/12 s).
- Ломать `content-visibility` / CLS-резерв под HostPicker без замены.
- Поднимать число живых Kodik iframe >1 во время playback (бюджет `PERF_WATCH.md`).

---

## Вопросы

1. Нужен ли **канонический URL** adult-тайтлов только `/hentai/watch/...`, или `/watch/...` + age gate достаточно (тогда P1 — только deep-link из раздела hentai)?
2. Какой failover считать источником правды: **озвучка/host** (`nextSource`) или **balancer ladder** (`BALANCER_FALLBACK_LADDER`)? Сейчас оба.
3. Целевой UX смены озвучки при warm=0: спиннер N с ок, или один «ghost» poster overlay + unmute после ready?
4. Glow: оставляем только в оформлении или добавляем discoverability на `/watch` без default ON?
5. Синк positions на аккаунт: покрывает ли уже reconcile non-Kodik дыры, или продукт обещает resume «везде»?
6. Стоит ли e2e на `/hentai/watch/:id/:ep` → next episode остаётся под `/hentai/watch`?

---

## Вердикт (для сводки)

Плеер **зрелый по happy-path** (источники, resume Kodik/own, skips, trailer fallback, engage/perf-дисциплина), но **хрупкий на adult-навигации и на отказоустойчивости**: path leak с `/hentai/watch`, двойной failover и cold voice-switch после perf-волны — главные рычаги. Glow/danmaku как продукт сейчас «выключены правильно», но **плохо открываются** зрителю; докрутка — discoverability и defer fetch, не откат defaults.
