# Карта развития AnimeLife (2026-11-10)

Синтез AGENT 10 из product/strategy среза + аудитов `docs/audit/01–09`. Код `src/` не менялся. Уже зафиксировано и **не откатывать**: Core-only (`BACKEND='core'`), perf-волна watch (`warmLimit=0`, glow/ambient/danmaku OFF by default, engage defer, visibilityPoll), WAF Free ≤5, `docs/PERF_WATCH.md`.

---

## North-star и принципы

### Позиционирование
**AnimeLife** — русскоязычный сайт «смотреть + вести список + вместе», поверх открытого каталога Shikimori и мультибалансерного плеера (Kodik / Alloha / AniLibria / …), с собственным бэкендом **AnimeLife Core** на Cloudflare Worker (D1 + KV), без Appwrite как primary.

Не «ещё одна копия смотрелки» и не «замена Shikimori». Ценность: **быстрый путь find → watch → resume**, честный trust/legal слой, соц-слой без обязательного Paid realtime.

### ICP
1. **Онгоинг-зритель (primary):** 16–28, RU/СНГ, хочет серию в день выхода, выбор озвучки, продолжить с секунды, пуш/inbox «новые серии».
2. **Список-мигрант с Shikimori/MAL:** переносит rates, ждёт двусторонний sync без сюрпризов.
3. **Соц-хост «Вместе»:** зовёт 1–5 друзей по ссылке; не Discord-замена.
4. **Манга-читатель (secondary):** SFW MangaDex + мягкий adult-раздел; own-upload отложен (R2/billing РФ).

### North-star метрики
| Метрика | Определение | Цель ближайшего квартала |
|---|---|---|
| **NS1 Watch completion** | доля сессий `/watch`, где досмотр/≥80% или `onEnded` | ↑ vs baseline; трекинг через quality/analytics без heartbeat-спама |
| **NS2 Resume reliability** | доля возвратов Continue → play с той же секундой (Kodik/own) | ≥95% happy-path |
| **NS3 List sync trust** | ошибки merge/import/Shiki после connect → 0 критичных P1 | закрыть A4 P1 за спринт |
| **NS4 Platform uptime quota** | Worker invocations/day ≪ 100k; алерты 70k/90k редкие | median 7d < 40k при включённом WAF |
| **NS5 Trust honesty** | 0 ложных legal/JSON-LD/профильных метрик в прод-копии | privacy=Core; no fake AggregateRating; no fake /u stats |

Вспомогательные: LCP Home ≤2.5–3.5s / Catalog ≤4.5s / Watch soft ≤4.5s (`PERF_WATCH.md`); FPS watch ≥55 avg (Firefox 720p, glow OFF); Together create→second viewer %.

### Конкуренты (карта, не feature-parity)
| Игрок | Роль | AnimeLife vs |
|---|---|---|
| **Shikimori** | каталог, списки, оценки; **не** видео | партнёр данных + OAuth sync; не конкурируем каталогом |
| **AniLibria / AniLiberty** | своя озвучка + сайт | у нас — один из балансеров + чужие студии; не «только своя озвучка» |
| **Смотрелки** (AnimeGO/зеркала, Anime+, AniLife.fun и т.п.) | плеер + списки + иногда rooms | паритет по watch/list; дифференциал: Core на CF Free-дисциплине, SEO-витрина, Together, прозрачный trust |
| **Discord / TG** | соц | Together = лёгкая комната по ссылке, не замена |

### Принципы Free CF + Core
1. **Люди почти не тратят Worker** — `run_worker_first: false`, navigate → static SPA.
2. **Боты режутся до Worker** — WAF Free ≤5; `guard.js` — второй слой (вызов всё равно считается).
3. **Core-only** — auth/lists/UGC в D1/KV; Appwrite не возвращать.
4. **Paid ($5 / DO / R2) только с ROI** — RoomDO и object storage не must-have; poll и MangaDex-only допустимы.
5. **Perf defaults священны** — не включать glow/ambient/danmaku/warm iframe pool по умолчанию.
6. **Честность > витринный блеск** — нет fake ratings, fake online, Appwrite в privacy, «глав нет» когда MD не спросили adult.

---

## Текущее состояние

### Сильные стороны
- Полный продукт-контур: discovery → title → multi-balancer player → library → account → together/chat/clubs → manga → legal/moderation.
- Core заменил Appwrite на критическом пути; backup D1, WAF scripts, perf-волна watch задокументированы.
- SEO/Edge: landings, sitemaps, IndexNow, SSR для ботов на ключевых URL.
- Player happy-path зрелый (resume Kodik/own, skips, trailer fallback, engage defer).

### Критические щели (сводка аудитов)
| Кластер | Суть | Источник |
|---|---|---|
| **SEO integrity** | FAQ `useJsonLd` затирает TVSeries; fake AggregateRating | 02 |
| **Trust/legal** | `/privacy` всё ещё про Appwrite Frankfurt | 09 |
| **Platform SPOF** | Free 100k/day; WAF ensure не на schedule; shallow health | 08 |
| **Account trust** | скрытый профиль leak/crash; фейковые метрики /u | 05 |
| **Library sync** | import не двигает status; dual watched; autoSync молчит | 04 |
| **Adult paths** | `/hentai/watch` → `/watch`; reader без AgeGate; MD без `adult:true` | 03, 07 |
| **Social discover** | комнаты не public; InviteCard не авто-открывается | 06 |
| **Thin landings** | soft-200 voice/chronology/trope; voice grid не про озвучку | 02 |

### Уже сделано (якоря)
- Core-only · perf watch wave · WAF Free ≤5 · `PERF_WATCH.md` · `worker-limit.md` · RoomDO stub + Free poll · own manga OFF честно.
- **Волна 2026-11-10 (карта P0–P3 дешёвые):** privacy=Core; TitleFaq `@graph` / no fake AggregateRating; profile 404 + honest /u; library merge+autoSync+`effectiveWatched`; watchBase hentai; MD adult+AgeGate; Together public+Invite; Hero resume; Danmaku-on-only; soft-200→404 chronology/trope/voice **+ хабы `/chronology` `/trope`**; Chronology one `@graph`; voice disclaimer; og:image poster; FranchiseBridge→chronology; Landing related≤8; themes в Catalog; single failover (page-owned); resume honesty non-Kodik; Nav season/ongoing; Discover Together; Home ongoing dedupe; onboarding snooze 7d; TasteDuel share-URL; room chat report; 16+ UGC checkbox; hentai noindex + tags w/o shikiId hidden; manga copy honesty; deep `/health` D1+KV; hide `implemented[]`; KV rate-limit login/analytics; source-health→Core; backup `D1_BACKUP_PASSPHRASE`; WAF ensure weekly schedule; legal ban honesty; Admin mod-queue badge; SW `v5`; JSON import + Shiki on Library; `/my-list`→`/library`; FailoverPlayer deleted; spoiler wraps About.
- **Добивка автономная:** user-ban/unban + audit who/when; club mod tab; sessions list/revoke; profile slug; manga разворот; streak=onEnded; cold voice timer; BufferTrivia 5s; random open room; Recap/Quiz→Duel; news attribution; OAuth/email «не в этом году»; watchLog local-only; Worker quota note; restore drill в docs.
- **Полный переезд CF Free (без Paid):** выпилены `LEGACY_APPWRITE`/`functions/{community,social-login}`/appwrite workflows+deploy scripts; mangaOwn без Frankfurt URLs; telegram-news/menu только `TELEGRAM_BOT_TOKEN`+Core; README/docs/CI Core-only. RoomDO/R2 намеренно выкл. Остаток: часть Playwright ещё мокает Appwrite (smoke/design/legal уже Core); архивный decrypt-бэкап.

---

## P0 / P1 / P2 / P3

Приоритет = impact × trust/SEO/quota risk × effort. ID из аудитов сохранены для трассировки.

### P0 — сделать в первую очередь (дни, не недели)
| ID | Что | Effort | Audit |
|---|---|---|---|
| SEO-P0a | TitleFaq → `SeoMeta faq` / единый `@graph`; убрать конкурирующий `useJsonLd` | S | 02 |
| SEO-P0b | Убрать fake `ratingCount`/`reviewCount` / AggregateRating с клиента (как worker) | S | 02 |
| TRUST-P0 | Переписать `/privacy` (+ cookie/analytics) под Core D1/KV/`al_session`; согласовать delete с AccountData | S | 09 T09-01/02 |
| PLAT-P0 | Подтвердить WAF 1–4 enabled + schedule check drift; мониторинг invocations | S | 08 P8-01/02 — **ops** (правила уже в CI `ensure-waf-rules`; повторная сверка вручную в CF dashboard) |

### P1 — следующий спринт / две недели
**Trust & account**
- Profile hidden → 404 (не stub); safe defaults summary; убрать fake online/streak/genres (`A5-B01–03`).
- Ban UI / audit trail модерации — минимум who/when (`T09-03/04`) или явный downscope terms.

**Library**
- `mergeImported` обновляет status; tombstone policy; `autoSync` после OAuth; одна формула `effectiveWatched` Home↔Library (`04`).

**Player / adult**
- Единый `watchBase` `/watch` vs `/hentai/watch`; один failover-каскад (controlled: page `fallBack`); Danmaku fetch только при ON (`03`).
- MangaReader AgeGate; MD `{ adult: true }` после gate; HentaiCard prefixes (`07`).

**Discovery / title landings**
- Hero CTA → resume episode; themes в Catalog или честный SEO-only; BottomNav/NavMore: Season/ongoing (`01`).
- 404 на unknown chronology/trope/voice; Chronology один `@graph` (`02`).

**Social**
- Create: public prompt / default; auto-open InviteCard; Discover card Together (`06`).

**Platform**
- Deep `/health` (D1+KV); app rate-limit login/analytics; source-health без Appwrite; backup passphrase ≠ CF Global Key (`08`).

### P2 — квартал (после P0/P1)
- Voice landing на реальных titleIds или disclaimer + curated top-N; worker notFound + rich data share (`02`).
- og:image poster; spoiler mode v2; FranchiseBridge → chronology CTA (`02`).
- Resume honesty для non-Kodik; cold voice-switch UX без warm pool (`03`).
- JSON import; Shiki panel в Library; watchLog sync policy; `/my-list` → `/library` deep-links (`04`).
- Google/Yandex OAuth довести **или** явно «не в этом году»; email recovery ROI (`05`).
- Room chat automod/report; club mod tab; TasteDuel share-URL only UX (`06`/`09`).
- Hentai tags без shikiId — disable; noindex `/hentai*` decision; copy manga без «загруженные к нам» (`07`).
- Admin: Worker quota + mod queue counts; SW VERSION bump hygiene (`08`/`09`).
- Catalog related slice(8); Home dedupe Hero vs ongoing shelf; onboarding snooze (`01`).

### P3 — бэклог / opportunistically
- Unified «Что посмотреть» hub; curated trope lists; design debt Chronology/Trope inline styles (`01`/`02`).
- FailoverPlayer delete; BufferTrivia tune; matrix series×voice (`03`).
- Streak = onEnded; session list revoke; profile slug (`04`/`05`).
- Random open room; Recap→Duel bridges; dual-page manga reader (`06`/`07`).
- Hide `implemented[]` on health action; restore drill runbook polish (`08`).
- Together report; news attribution; 16+ UGC checkbox (`09`).

---

## Зрелость модулей

Шкала: **fragile** → **thin** → **ok** → **strong** (относительно ICP и Free-ограничений).

| Модуль | Зрелость | Комментарий |
|---|---|---|
| **discovery** | ok | Home/Catalog/SEO landings богатые; themes/season nav/Hero resume — дыры |
| **title** | strong UX / fragile SEO | Карточка сильная; JSON-LD FAQ+fake rating = P0; voice/chronology/trope thin |
| **player** | strong happy-path / fragile edges | Perf-дисциплина ок; dual failover + hentai path leak |
| **library** | ok hub / fragile sync | Unified `/library` верно; import/Shiki/watched split = P1 |
| **account** | ok auth / thin profile | VK/TG/Core export-delete ок; recovery dead; /u fake+leak |
| **social** | feature-rich / discovery-starved | Комната зрелая; public list + invite funnel сломаны продуктово |
| **manga** | ok SFW reader / fragile adult | Reader сильный; adult MD + gate bypass + path isolation |
| **platform** | ok Free architecture / fragile ops | Static+WAF+Core верно; quota SPOF, health, backup secrets |
| **trust** | thin→ok tooling / broken copy | Mod queues есть; privacy Appwrite; нет ban UI/audit/SLA tooling |

---

## Зависимости и порядок внедрения

```
[P0 SEO JSON-LD] ──┐
[P0 Privacy Core] ─┼──► Trust baseline ──► [P1 Profile 404/real stats]
[P0 WAF verify] ───┘         │
                             ├──► [P1 Library merge+autoSync+watched]
                             │         │
[P1 watchBase + failover] ◄──┘         ├──► Shiki sync trust (NS3)
[P1 adult gate+MD flag] ───────────────┤
[P1 Together public+invite] ───────────┼──► Social funnel metric
[P1 Hero resume + nav season] ─────────┘
                             │
                             ▼
            [P2 landings/voice data] [P2 platform deep health/rate limit]
                             │
                             ▼
            [P3 hubs / DO only if ROI] [R2/S3 own manga only if billing path]
```

**Merge-порядок для близких патчей:** SEO/legal copy → account profile → library sync → player path/failover → manga adult → social create UX → platform ops. Не смешивать с откатом perf defaults.

**Квартальный план (ориентир Q+1 от 2026-11-10)**

| Окно | Фокус | Exit criteria |
|---|---|---|
| **Недели 1–2** | P0 все + library P1 sync + watchBase/hentai + privacy | Rich Results не FAQ-only; privacy=Core; WAF green; import status ok |
| **Недели 3–4** | Profile honesty; adult MD+reader gate; Together invite funnel; Hero resume; single failover | Нет fake /u; adult read works; create→invite measurable |
| **Недели 5–8** | P2: landings 404/voice strategy; rate limits; mod audit/ban; catalog themes; Shiki panel in Library | Soft-200 landings gone; login flood protected; themes product or noindex plan |
| **Недели 9–12** | P2/P3 polish; e2e Core (legal/together/account); metrics dashboard; решение Paid DO / email / OAuth Google | NS4 stable; NS1/2 instrumented; backlog groomed |

---

## Метрики успеха

| Уровень | Метрика | Как смотреть |
|---|---|---|
| North-star | NS1–NS5 выше | AdminAnalytics + Search Console + CF Worker Metrics |
| Perf | FPS watch; LCP home/catalog/watch; 1 iframe | `PERF_WATCH.md` checklist |
| Funnel | Home→Title→Watch; Continue click→play; Catalog q→watch | analytics-track paths (без heartbeat) |
| Social | create → invite open → 2nd viewer; public rooms > 0 | rooms + client events |
| Sync | Shiki connect→pull success; import status match sample | logs / manual QA matrix |
| Trust | open reports; takedown age; privacy copy review date | `/moderation` + legal |
| Platform | invocations/day; WAF block ratio; backup freshness | source-health + CF |

Fail-closed для релиза: любой новый default-ON GPU эффект на `/watch`; Appwrite SDK на critical path; RoomDO enable без Paid+ROI; R2 enable без billing path вне РФ.

---

## Что НЕ делаем

1. **Не откатываем** warmLimit=0 / glow·ambient·danmaku defaults ON / Appwrite primary / `run_worker_first: true` «для простоты».
2. **Не включаем RoomDO / Workers Paid / R2** «на всякий» — только при повторных 70k+ alerts или явной продуктовой необходимости + оплачиваемый путь.
3. **Не гонимся за feature-parity** со всеми смотрелками (4K apps, XP grind, native TV) в ущерб sync/trust/quota.
4. **Не храним чужой AggregateRating** Shikimori в JSON-LD; не рисуем fake online/streak/жанры.
5. **Не обещаем** email recovery / Google OAuth / own manga upload в UI, пока нет SMTP/ключей/object storage.
6. **Не раздуваем** WAF за лимит Free 5 rules и не тащим тяжёлый JS animation stack.
7. **Не мержим вслепую** параллельные правки `player.css` / glow / vite CSS graph без порядка из `PERF_WATCH.md`.
8. **Не делаем** Together = Discord; adult hard-ID verification без legal mandate (soft gate ок, но без обхода reader).

---

## Ссылки на docs/audit/0N-*.md

| Файл | Зона | Влито в карту |
|---|---|---|
| [01-discovery.md](./audit/01-discovery.md) | Home/Catalog/Landing/Top/Random/Season | да — P1 Hero/nav/themes, P2 related/onboarding |
| [02-title.md](./audit/02-title.md) | Title/Similar/Chronology/Trope/Voice/Character | да — **P0 JSON-LD**, P1 soft-200/voice |
| [03-player.md](./audit/03-player.md) | Watch/balancers/failover/danmaku/glow | да — P1 path+failover, P2 resume UX |
| [04-library.md](./audit/04-library.md) | Library/MyList/Shiki/import/streak | да — P1 sync cluster |
| [05-account.md](./audit/05-account.md) | Account/OAuth/profile/recovery | да — P1 profile leak/fake, P2 OAuth/email |
| [06-social.md](./audit/06-social.md) | Together/chat/clubs/duel/quiz | да — P1 public+invite, P2 automod |
| [07-manga-adult.md](./audit/07-manga-adult.md) | Manga/reader/hentai/R2 | да — P1 adult MD+gate+paths |
| [08-platform.md](./audit/08-platform.md) | Worker/WAF/Core/ops/SW | да — **P0 quota/WAF**, P1 health/rate limit |
| [09-trust.md](./audit/09-trust.md) | Legal/moderation/age/takedown | да — **P0 privacy**, P1 audit/ban/SLA |
| [10-roadmap.md](./audit/10-roadmap.md) | Meta AGENT 10 | да — метод дедупа и open questions |

Дополнительно: [PERF_WATCH.md](./PERF_WATCH.md) · [worker-limit.md](./worker-limit.md) · [rooms-do.md](./rooms-do.md) · `worker/core/README.md`.
