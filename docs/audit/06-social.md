# AGENT 6 — Соц / Together / чат / клубы

## Scope
- Роуты: `/together`, `/together/:code`, `/chat`, `/community`, `/club/:id`, `/quiz`, `/duel` (+ `/duel/share`, `/duel/:code`), `/recap`
- UI: `TogetherHome`, `Together`, `Community`, `CommunityChat`, `ClubPage`, `WatchTogetherButton`, `InviteCard`, `CreateRoomSearch`, `Hall`/`People`/`SyncVideo`/`RoomVoices`/`ScheduleSession`, `TasteDuel`, `Quiz`, `Recap`
- Client API: `src/data/rooms.ts`, `communityChat.ts`, `tasteDuel.ts`, `voice.ts`, `roomWs.ts`, `social.ts`, `invites.ts`
- Core: `worker/core/rooms.js`, `chat.js`, `automod.js`, `clubs.js`, `voice.js` (+ optional `roomDo.js` / WS fallback — **не** Paid DO as must-have)
- Модерация UI (только пересечение с чатом): `Moderation?tab=chat` → см. AGENT 9 для полного trust

## Карта зоны
| URL / модуль | Компонент | Статус |
|---|---|---|
| `/together` | `TogetherHome` | ok (часто empty list — продукт/дефолт, не crash) |
| `/together/:code` | `Together` | ok (полноценная комната: sync, chat, voice, hall) |
| `WatchTogetherButton` (title/player) | create → navigate | ok, но `public` не ставится |
| `/chat` | `CommunityChat` | ok + automod |
| `/community` | `Community` (лента / лидеры / клубы) | ok / thin при низкой активности |
| `/club/:id` | `ClubPage` | ok / thin (цель без чужого прогресса; нет mod inbox) |
| `/quiz` | `Quiz` | ok (solo + share streak) |
| `/duel*` | `TasteDuel` | ok / thin (share pack ок; short code = localStorage) |
| `/recap` | `Recap` | ok как personal share-card, не multiplayer |
| Presence/rooms UI | poll ~4.5s; WS→501 без ROOMS binding | ok на Free (latency tradeoff) |
| Nav «Ещё» / MoreSheet | Together/Community/Chat/Duel | ok |
| Home Discover | quiz/random/collections | thin — **нет** Together/Community |

## Баги и недочёты
| ID | Sev | Что | Evidence | Effort |
|---|---|---|---|---|
| S-B1 | P1 | Публичный список комнат системно пустой: create не передаёт `public: true`, listing фильтрует `r.public` | `WatchTogetherButton.tsx` / `CreateRoomSearch.tsx` → `createRoom({…})` без `public`; `rooms.js` `public: !!body.public` + `filter((r) => r.public)` | S |
| S-B2 | P1 | После создания InviteCard **не** открывается (`showInvite` default false); `fresh` только авто-подбор плеера | `Together.tsx` ~94, 308–316, 498–504 | S |
| S-B3 | P2 | Room chat без `heldReason` / report — только delete host/self/admin | `rooms.js` `room-message` ~230–258 vs `chat.js` + automod | S–M |
| S-B4 | P2 | Club posts: report → auto-hide, но **нет** вкладки клубов в `Moderation` (только reviews/comments/chat/takedowns) | `clubs.js` `club-post-report`; `Moderation.tsx` tab whitelist | M |
| S-B5 | P2 | TasteDuel `/duel/:code` читает только `localStorage` того же браузера; кросс-девайс — только `/duel/share?p=` | `TasteDuel.tsx` `boardFromRoute` / `loadDuel`; changelog уже намекает на share URL | S (copy UX) / L (server store) |
| S-B6 | P2 | Create без trailer → `source: 'file'` — гость обязан выбрать локальный файл (высокий drop-off) | `WatchTogetherButton` / `CreateRoomSearch` `source: videoId ? 'trailer' : 'file'` | M |
| S-B7 | P3 | E2E `together.spec.ts` всё ещё на Appwrite TablesDB mocks — регрессии Core/D1 могут проскочить | `tests/together.spec.ts` | M |
| S-B8 | P3 | Empty copy `/together` не объясняет чекбокс «Показывать во «Вместе»» | `TogetherHome.tsx` 174–176 vs host toggle `Together.tsx` 553–565 | S |

## UX / продукт
| ID | Sev | Боль | Кому больно | Идея |
|---|---|---|---|---|
| S-U1 | P1 | «Вместе» не discoverable с Home Discover; спрятано в «Ещё» | Новые / casual | Карточка `/together` (+ опц. `/community`) в `HomeShelves` DISCOVER |
| S-U2 | P1 | Почему не заходят «вместе»: нет чужих комнат + нет nudge «позови друга» + login gate на create/chat | Хост и гости | Default/public prompt + auto-open InviteCard + soft guest watch already ok |
| S-U3 | P2 | Два invite-контура: room code/link vs `?ref=` XP — путаница «пригласить друга» | Хост / реферал | Развести копирайт: «Позвать в комнату» vs «Пригласить на сайт» |
| S-U4 | P2 | Gate «Присоединиться» + autoplay blocked overlay + login для чата/голоса | Гости по ссылке | Укоротить gate для trailer/player; оставить file-pick только для file mode |
| S-U5 | P2 | Community feed/clubs часто empty при cold start — тексты хорошие, но нет моста в Together/Chat | Новички | CTA из empty feed → `/chat` / «создать комнату» |
| S-U6 | P2 | Club goal показывает только прогресс зрителя из My List | Участники клуба | Опциональный opt-in progress share (см. AGENT 4) — без DO |
| S-U7 | P3 | Quiz/Recap — share-only social; мало возврата в multiplayer | Retention | После quiz streak → «сыграть дуэль» / «позвать в Together» |
| S-U8 | P3 | Polling ~4.5s ощущается «не живым» vs Discord/Telegram | Голос/чат в комнате | Оставить poll на Free; Paid DO только при бюджете (см. `docs/rooms-do.md`, AGENT 8) — **не** must-have |

### Happy-path (ожидаемый)
1. Title/Player → «Смотреть вместе» → комната → «Позвать друга» → друг открывает `/together/CODE` → sync.
2. `/together` → код/ссылка или открытая комната из списка.
3. `/chat` → читать (guest) / писать (auth) → report → mod tab.
4. `/community` → лента / клубы → `/club/:id` стена.
5. `/duel` → ответы → share URL → второй игрок.

### Edge cases
- Гость: смотреть комнату можно; create/chat/control — login.
- 401 на create → toast + `/account`.
- Комната TTL 6h + одна комната на host (`DELETE FROM rooms WHERE host_id`).
- Нет trailer → file mode.
- Offline/hidden tab → poll pause (`visibility`).
- Adult/title gates — вне зоны (см. AGENT 3/7).

## Техдолг
| ID | Sev | Что | Где |
|---|---|---|---|
| S-T1 | P2 | Legacy Appwrite community tests/functions vs prod Core | `functions/community/*`, `tests/together.spec.ts` |
| S-T2 | P2 | Room chat / club posts не разделяют automod-пайплайн с `/chat` | `rooms.js`, `clubs.js`, `automod.js` |
| S-T3 | P3 | Dual social surfaces + CSS (`together.css`, `community-*`, `social.css`) — ок, но discover entry points разрознены | NavMore / Discover / empty states |
| S-T4 | P3 | RoomDO/WS код есть, binding закомментирован — корректный Free fallback; не путать с «сломанным realtime» | `docs/rooms-do.md`, `roomWs.ts` |
| S-T5 | P3 | Нет dedicated e2e TasteDuel / ClubPage deep flow | `tests/` |

## Идеи новых функций (зона)
| ID | Value | Зачем | Зависимости | Effort | Риск |
|---|---|---|---|---|---|
| S-I1 | High | Default public **или** one-tap «Открыть комнату в списке» после create | Core `room-control` уже умеет `public` | S | Spam публичных пустых комнат → rate/host limit |
| S-I2 | High | Auto-open InviteCard + copy link toast на `fresh` host | Только UI | S | Низкий |
| S-I3 | High | Discover card «Смотрят вместе» с live count (0 → soft CTA create) | `/api/core/rooms` | S–M | Пустой count — не врать «N онлайн» |
| S-I4 | Med | «Сейчас смотрят этот тайтл» на TitlePage (count публичных rooms по animeId) | rooms list filter | M | Privacy — только public |
| S-I5 | Med | Scheduled room с Telegram/PWA напоминанием | notifications (см. community telegram) | M | Spam |
| S-I6 | Med | Automod + report на room-message (reuse `heldReason`) | automod.js | S | False positive в мем-чате |
| S-I7 | Med | Club mod queue / reuse chat reports UI | Moderation + clubs | M | Нагрузка на модеров |
| S-I8 | Med | TasteDuel short-code на Core/KV (TTL 24h) вместо localStorage | Core endpoint | M | Abuse storage |
| S-I9 | Low | Together lobby «случайная открытая комната» | public rooms | S | Empty lobby UX |
| S-I10 | Low | Recap/Quiz → deep link «сравнить с другом» через duel pack | TasteDuel pack | M | Scope creep |
| — | — | **Не предлагать Paid Durable Objects как must-have** без $; poll+D1 достаточно для MVP | — | — | Биллинг |

## Быстрые победы (≤1–2 дня)
- Create: `public: true` **или** post-create modal «Показывать во Вместе?» (S-B1 / S-I1).
- `fresh` host → `setShowInvite(true)` + toast со ссылкой (S-B2 / S-I2).
- DISCOVER += `/together` (и опц. `/community`) (S-U1).
- Empty `/together`: одна строка про чекбокс «Показывать во Вместе» (S-B8).
- `heldReason` на `room-message` kind=chat (S-B3 / S-I6).
- В TasteDuel после хода 1 всегда форсировать copy `/duel/share?p=` (не short code) (S-B5).

## Не трогать / уже ок
- SyncVideo + server clock / Kodik path — зрелая фича (changelog + tests).
- InviteCard: copy/QR/share/Telegram/VK.
- Community chat automod + rate + reports + ModerationChat.
- Guest watch в комнате без login.
- Hall / People / RNNoise voice — polish уже есть.
- Core-only rooms (не возвращать Appwrite).
- Free poll presence; RoomDO остаётся optional Paid path (документирован).
- Perf-волна: не возвращать glow/warm iframes; together CSS split уже сделан.

## Вопросы к продакту
1. Публичные комнаты по умолчанию **on** или opt-in (приватность vs discoverability)?
2. Нужен ли «случайный зал» / matchmaking, или Together = только friends-by-link?
3. Клубы — приоритет retention или достаточно ленты+чата? Нужен ли mod inbox клубов сейчас?
4. TasteDuel: инвестировать в server codes или оставить share-URL only?
5. Метрики успеха соц-зоны: % create→invite→second viewer; public rooms >0; chat DAU?

## Связи с другими агентами
- AGENT 3 — WatchTogether entry с Player (engage defer не ломать).
- AGENT 4 — club goal / My List progress share.
- AGENT 5 — login gates create/chat.
- AGENT 8 — rooms poll vs optional DO, quotas.
- AGENT 9 — club reports / trust tooling beyond chat tab.
- AGENT 10 — влить в DEVELOPMENT_MAP (social maturity: feature-rich, discovery-starved).
`)