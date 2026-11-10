# AGENT 8 — Platform / Worker / Ops

**Зона:** `worker/*`, `src/api/core.ts`, guard/WAF, D1 backup CI, health, rate limits, SW, Cache-Control, secrets surface (без значений), AdminAnalytics/observability, RoomDO stub.  
**Ограничения аудита:** только этот файл; код `src/`/`worker/` не правился; уход с Cloudflare Free — только с явной ROI-пометкой.  
**Дата среза:** 2026-11-10.

---

## Scope

| В зоне | Вне зоны |
|---|---|
| Worker entry (`index.js`), `guard.js`, proxies, SEO Cache API | Продуктовый UX витрины/плеера/аккаунта (агенты 1–7) |
| Core router/auth/actions/analytics/rooms/RoomDO | Глубокий product Together UI (агент 6) |
| `src/api/core.ts`, `public/sw.js` | R2/manga billing deep-dive (агент 7) |
| WAF scripts + workflows, backup/source-health/CI secrets names | Содержимое секретов / значения ключей |
| AdminAnalytics + client beacons | Paid DO как must-have без ROI |

**Метод:** чтение кода + docs (`worker-limit.md`, `rooms-do.md`, `PERF_WATCH.md`) + workflows. Прод-метрики Worker за сегодня не снимались → гипотезы помечены `HYPOTHESIS`.

---

## Карта

```
Browser / bots
  ├─ CF static assets (run_worker_first:false) → люди navigate без Worker
  ├─ WAF custom rules 1–4 (ensure-waf-rules.mjs, Free ≤5) → до Worker
  └─ Worker anime
       ├─ guard.js (WELCOME / BLOCKED / JUNK / plain)
       ├─ /api/shiki|yummy|mangadex|sibnet proxies + Cache-Control
       ├─ /api/core/* (D1 DB + KV SESSIONS)
       │    ├─ /health (shallow ok)
       │    ├─ /auth/* cookie al_session
       │    ├─ /action → analytics/rooms/chat/… (единый POST)
       │    └─ /rooms/:code/ws → RoomDO (binding off → 501)
       ├─ SEO HTML Cache API (HIT всё равно = 1 invocation)
       ├─ cron 17 * * * * cleanup + push notify
       └─ export { RoomDO } (stub until Paid binding)

Ops
  ├─ source-health.yml hourly → TG + Worker 70k/90k alerts
  ├─ backup.yml daily D1 export → AES artifact 30d
  ├─ ensure-waf-rules.yml / cloudflare-status.yml → workflow_dispatch
  └─ AdminAnalytics (label admin) ← analytics-stats / error-list
```

| Компонент | Роль | Free-constraint |
|---|---|---|
| Worker `anime` | SEO bots + все `/api/*` + cron | **100k invocations/day** (hard SPOF; Error 1027) |
| D1 `anime_core` | Auth, lists, rooms, analytics | Single DB; backup = ops SPOF |
| KV `SESSIONS` | Session tokens | Binding required for Core |
| WAF Free ≤5 | Отсев до Worker | Rules drift if not re-applied |
| RoomDO | WS fan-out | Binding commented; needs Paid |
| SW `v4` | Shell/static/data/images | Stale shell/data on slow net |

---

## Баги / риски

| ID | Sev | Effort | Finding | Evidence |
|---|---|---|---|---|
| P8-01 | **P0** | M | **Квота Free 100k/day — единственный жёсткий SPOF платформы.** Исторический инцидент ~192k/сутки → Error 1027. Люди почти не жрут лимит (SPA static), но боты + `/api/core` + SEO HIT + together-poll остаются. | `docs/worker-limit.md`; `scripts/source-health.mjs` `WORKER_ALERTS=[70k,90k]`; `wrangler.animelife.jsonc` `run_worker_first:false` |
| P8-02 | **P1** | S | **WAF ensure только `workflow_dispatch`**, не schedule. Drift/удаление правил в CF UI не ловится автоматически; `cloudflare-status` тоже manual. Guard в Worker — второй слой, но **каждый отказ всё равно считается вызовом**. | `.github/workflows/ensure-waf-rules.yml`; `docs/worker-limit.md` §1; `worker/guard.js` |
| P8-03 | **P1** | M | **Нет application-level rate limit** на `/auth/login|register` и на публичные write-actions (`analytics-*`, `error-report`, room poll writes). Защита только edge WAF #4 (30 req / 10s / IP+colo) — если правило не стоит, brute/flood открыт. | `worker/core/auth.js` (нет 429/KV bucket); `worker/core/analytics.js` track без auth; `scripts/ensure-waf-rules.mjs` `RATE_RULE` |
| P8-04 | **P1** | S | **`GET /api/core/health` — shallow:** `{ ok:true, backend:'core' }` без ping D1/KV. При «bindings есть, D1 лежит» health зелёный, падение тихо до первого real query. | `worker/core/router.js` L46–47; `coreReady` только `!!(DB&&SESSIONS)` |
| P8-05 | **P1** | M | **Unauth analytics / quality / error-report → D1 write amplification + Worker spend.** Batch до 50 items; `error-report` при дубле тихо `{ok:true}`, при дневном cap `{ok:false}` без сигнала клиенту. Heartbeat отключён (хорошо), pageview beacon всё равно публичный. | `analytics.js` `analyticsTrack`/`analyticsBatch`/`errorReport`; `src/data/analytics.ts` `HEARTBEAT=0`, `.catch(()=>undefined)` |
| P8-06 | **P1** | S | **D1 backup: шифрование passphrase = Global CF API Key.** Ротация/компрометация одного секрета бьёт и деплой, и расшифровку бэкапов. Артефакт GH 30 дней, off-site копии в коде нет. R2/манга не входят (ок, честно). | `.github/workflows/backup.yml` |
| P8-07 | **P2** | S | **`source-health` всё ещё зависит от Appwrite** (keepalive check + admin chats через Appwrite API key). После Core-only это silent/ops debt: падение Appwrite ≠ падение сайта, но красный health / нет TG если нет `TELEGRAM_ADMIN_CHAT_ID`. **Не проверяет `/api/core/health` + D1.** | `scripts/source-health.mjs` CHECKS Appwrite; comments L4–6 |
| P8-08 | **P2** | L | **RoomDO stub debt:** код + export есть, binding закомментирован → `501` на WS. Клиент fallback на D1 poll (~4.5s rooms, ~3.75s voice) = **N зрителей × poll = Worker quota**. Документировано как Paid. | `roomDo.js`; `router.js` L56–61; `docs/rooms-do.md`; `rooms.ts` `ROOM_POLL_MS=4500`; `voice.ts` `CORE_POLL_MS=3750` |
| P8-09 | **P2** | S | **SEO Cache HIT всё равно тратит Worker invocation** (пропуск Shikimori, но счётчик +1). STALE-while-revalidate может отдать HTML до 2×TTL (title 1h → keep 2h). Для ботов ок; для «мониторинга вызовов» легко недооценить. | `seoCache.js`; `index.js` `cachedPage` `X-Page-Cache` |
| P8-10 | **P2** | S | **SW stale risk:** navigate `PAGE_WAIT=3500` → старый `index.html` shell; `/api/shiki` networkFirst `DATA_WAIT=4500` → устаревшие данные при медленной сети. `/api/core` сознательно bypass (хорошо). VERSION `v4` — смена логики требует bump. | `public/sw.js` |
| P8-11 | **P2** | S | **Silent failures в cron cleanup chat:** `.catch(() => undefined)` на DELETE community_chat*. `notifyEpisodes`/`notifyWeeklyDigests` логируют в console, без TG/метрики. | `worker/index.js` scheduled |
| P8-12 | **P2** | S | **Secrets surface (имена, не значения):** Global API Key (`ANIMELIFE_CF_*`) для deploy+WAF+backup+quota; `VITE_KODIK_TOKEN`/`VITE_ALLOHA_TOKEN` в клиентской сборке; `VAPID_PUBLIC` захардкожен fallback в `config.ts`; `IP_HASH_SALT` optional → пустая соль слабее; Appwrite key ещё в health/decrypt workflows. | `animelife.yml`, `backup.yml`, `src/api/config.ts`, `wrangler.core.example.jsonc` |
| P8-13 | **P3** | S | **`POST /action` `health` отдаёт полный список `implemented` actions** — лёгкая разведка поверхности. | `actions.js` L109–111 |
| P8-14 | **P3** | S | **`coreCacheHeaders` default `private`** на GET rooms/chat — ок для браузера; CDN shared cache не спасает Worker. Short max-age (1–30s) снижает повтор только на одном клиенте. | `router.js` `coreCacheHeaders`; rooms/chat/social GETs |
| P8-15 | **P3** | M | **AdminAnalytics observability gap:** stats только по кнопке/mount (хорошо для квоты); нет Worker-quota / WAF events / backup freshness / error burn-rate на том же экране. `analytics-stats` тянет тяжёлые SELECT LIMIT 12000. | `AdminAnalytics.tsx`; `analytics.js` `analyticsStats` |
| P8-16 | **P3** | — | **HYPOTHESIS:** при росте together + analytics + SEO bots суточный forecast может снова подойти к 70k+ без новой bot-волны. Нужен замер Metrics после WAF. | нет live GraphQL в этом аудите |

---

## UX (ops / admin)

| ID | Sev | Effort | Note |
|---|---|---|---|
| U8-01 | P2 | S | Admin без label `admin` видит отказ — ок. Нет объяснения «почему пусто / как выдать label» в UI. |
| U8-02 | P3 | S | Онлайн в админке ослаблен (`HEARTBEAT=0`) — честно для Free, но метрика «online» = last pageview window, не live presence. |
| U8-03 | P3 | M | Room WS 501 → пользователь остаётся на poll без явного «realtime недоступен на Free» в API message (есть 501 text). |

---

## Техдолг

1. **Core-only ops incomplete:** Appwrite checks/workflows (`appwrite*.yml` RETIRED stubs vs live `source-health` Appwrite probe).
2. **RoomDO готов в коде, не в bindings** — классический «полу-shipped»; риск случайного enable без Paid / без миграции.
3. **Единый `/api/core/action` god-endpoint** — удобно, но усложняет edge rate-limit granularity и аудит опасных actions.
4. **README Core** прямо пишет «на проде лучше Workers Paid $5» — это ops-opinion, не измеренный ROI (см. Идеи).
5. **Двойная защита bot (WAF + guard)** — правильно, но нет CI assert «правила 1–4 enabled» на schedule.
6. **Backup ≠ restore drill** — экспорт есть, runbook restore/test в зоне не найден.

---

## Идеи

| ID | ROI | Idea |
|---|---|---|
| I8-01 | High / Free | Schedule `ensure-waf-rules.mjs --dry-run` или check + alert если expression drift / disabled. |
| I8-02 | High / Free | Deep health: `SELECT 1` D1 + KV get/put probe; отдельный synthetic в `source-health`. |
| I8-03 | High / Free | App-level KV rate limit: login 5/min/IP, analytics-batch soft cap per IP/session (дополняет WAF #4). |
| I8-04 | Med / Free | Backup passphrase = отдельный `D1_BACKUP_PASSPHRASE` secret; weekly copy вне GH artifacts. |
| I8-05 | Med / Free | Убрать Appwrite из `source-health`; admin chat только `TELEGRAM_ADMIN_CHAT_ID`. |
| I8-06 | Med / Free | AdminAnalytics: блок «Worker invocations today / WAF top ASNs» через уже существующий GraphQL status script (read-only). |
| I8-07 | Med / Free | Together: агрессивнее poll backoff когда один зритель / нет voice (ещё меньше квоты). |
| I8-08 | **ROI Paid?** | Workers Paid $5 / 10M — **только если** (a) 70k+ alerts повторяются при включённом WAF, или (b) RoomDO WS нужен продуктово и poll UX неприемлем. Иначе Free + WAF дешевле. |
| I8-09 | Low / Free | Не отдавать полный `implemented[]` с public health action. |
| I8-10 | Low / Free | SW: не кэшировать shell дольше одного release; bump VERSION на каждый deploy автоматически. |

---

## Быстрые победы

1. **S:** Добавить в `source-health` check `GET /api/core/health` + простой authenticated/ cron D1 ping; убрать Appwrite check.  
2. **S:** Cron/schedule weekly `ensure-waf-rules` `--check` (fail job → GH mail).  
3. **S:** Отдельный secret для backup encryption (не CF Global Key).  
4. **S:** `health` response: `{ ok, d1, kv, time }` без списка actions.  
5. **M:** KV rate-limit на login/register + analytics-batch.  
6. **S:** Документировать restore drill из `animelife-d1-backup-*.sql.enc` (1 страница runbook).

---

## Не трогать

- `run_worker_first: false` + SPA static navigate — основа экономии квоты.  
- WAF Free ≤5 rules budget (не раздувать до Paid Security).  
- `HEARTBEAT=0` analytics — сознательный anti-quota.  
- `visibilityPoll` pause-on-hidden — не возвращать тики на idle watch.  
- RoomDO binding **не** включать «на всякий» без Paid + ROI.  
- Не предлагать откат на Appwrite как primary backend.  
- Perf-волну (warmLimit=0, glow off) — вне этой зоны, не ломать.

---

## Вопросы

1. WAF rules 1–4 **сейчас** enabled на `animelife.top`? (нужен один прогон `ensure-waf-rules --dry-run` / CF dashboard.)  
2. Типичный суточный Worker count после Core + WAF (7d median)? Есть ли повтор 70k alerts?  
3. Есть ли off-site копия D1 backup кроме GH Artifacts 30d?  
4. Нужен ли RoomDO в ближайший квартал продуктово, или poll 4.5s acceptable?  
5. `TELEGRAM_ADMIN_CHAT_ID` задан, или алерты всё ещё через Appwrite admin lookup?  
6. Планируется ли restore-учение D1 в Q ближайший?

---

## Вердикт (для сводки)

Платформа **осознанно заточена под Free**: static-first, WAF-before-Worker, guard, analytics heartbeat off, RoomDO stub. Главный риск — не «архитектура плохая», а **операционный SPOF квоты 100k** + **shallow health/monitoring** + **отсутствие app rate-limit** при возможном drift WAF. Paid имеет смысл только при повторных quota-alerts или жёстком realtime Together (ROI).
