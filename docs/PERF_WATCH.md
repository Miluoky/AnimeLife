# Perf: watch + витрина (AnimeLife)

Цель волны: плеер **~20 FPS → стабильные ~60** на `/watch` (Firefox, Kodik 720p), без ухода с Cloudflare Free и без отката уже сделанных фиксов.

## Уже сделано (не ломать)

| Фикс | Где | Зачем |
|---|---|---|
| `warmLimit() = 0` | `VideoPlayer.tsx` | Нет параллельного декода скрытых Kodik iframe |
| Glow default OFF (`glow === true` only) | `PlayerGlow` / appearance | Canvas + blur вокруг кадра — главный GPU killer |
| Ambient OFF на `/watch` | `Player.tsx` → `useAmbient(undefined)` | Двойной blur (ambient + glow) ронял FPS |
| `danmakuStore` v2 default `false` | `Danmaku.tsx` | DOM-анимации поверх видео |
| `emitPlayerTime` ~250 ms throttle | `playerTime.ts` | Kodik `time_update` слишком частый |
| HoverCards / tilt OFF на `/watch` | `Layout.tsx`, `tilt.ts` | Pointer + layer churn во время playback |
| WAF Free ≤5 rules | Cloudflare zone | Боты не жрут Worker до лимита 100k/сутки |

---

## Perf budget (целевые)

Бюджеты — **mobile / mid laptop**, Lighthouse или WebPageTest (cold, 4G Fast / cable).  
База из локальных `.tmp-lh-*.json` (до полной волны FPS): home LCP ~3.3 s; catalog ~5.6 s; watch LCP ~7–8 s (embed + постер) — **не путать с FPS плеера**.

### `/watch` (playback, не только Lighthouse)

| Метрика | Budget | Fail если |
|---|---|---|
| FPS во время playback (Firefox, 720p Kodik, glow OFF) | ≥55 avg, dips <45 редкие | стабильно <40 или stutter каждые 1–2 s |
| Живых `<iframe>` в слоте плеера | **1** (warmLimit=0) | ≥2 Kodik/video iframe одновременно |
| `.vp-glow` / canvas glow | отсутствует в DOM пока glow OFF | монтируется без opt-in |
| `.ambient img` на `/watch` | нет | есть фоновый blur-слой |
| Main-thread long tasks (>50 ms) во время play | редко; TBT cold load ≤300 ms | частые long tasks от poll/analytics |
| Poll chat/rooms/inbox без открытой панели | не чаще visibility-aware backoff; ideally paused | тики каждые ≤2 s на idle watch |
| LCP (cold, poster/LCP image) | ≤4.5 s soft / ≤6 s hard | >6 s после волны |
| CLS | ≤0.1 | >0.25 (скачок слота/engage) |

### `/` (Home)

| Метрика | Budget | Fail |
|---|---|---|
| LCP | ≤2.5 s soft / ≤3.5 s hard | >3.5 s (сейчас ~3.3 s — на грани soft) |
| TBT | ≤200 ms | >300 ms |
| CLS | ≤0.05 | >0.1 |
| Hero timers / ambient blur | pause on `document.hidden`; blur ≤24 px | бесконечные анимации + blur>24 px |

### `/anime/:id` (Title)

| Метрика | Budget | Fail |
|---|---|---|
| LCP (poster) | ≤3.0 s soft / ≤4.0 s hard | >4 s |
| TBT | ≤200 ms | >300 ms |
| CLS | ≤0.1 | >0.15 |
| Below-fold widgets | lazy / idle / intersection | всё грузится eager с hero |

### `/catalog`

| Метрика | Budget | Fail |
|---|---|---|
| LCP | ≤3.5 s soft / ≤4.5 s hard | >5 s (база ~5.6 s — цель волны) |
| TBT | ≤200 ms | >300 ms |
| CLS | ≤0.05 | >0.1 |
| Images | 1 LCP eager; rest lazy | сетка eager |

---

## Чеклист ручной проверки (Firefox)

Окружение: **Firefox** (тот же профиль, где жаловались на лаги), окно ~1280×720 или ноутбук, VPN как обычно / отдельно контрольный прогон без VPN.

### Подготовка

1. Hard refresh на `/watch/...` (Ctrl+F5).
2. В настройках сайта: **Подсветка плеера (glow) = ВЫКЛ**, danmaku = ВЫКЛ, «Экономия»/lite если есть — выкл для «worst clean» и отдельно вкл для lite.
3. Качество в Kodik: **720p** (как реальный кейс).
4. Закрыть лишние вкладки (особенно YouTube live) для baseline; потом повторить с ними — см. «вне сайта».

### DevTools → Performance

1. Performance → запись 10–15 с во время **играющего** видео (не на паузе).
2. Смотреть: FPS graph, Main thread, long tasks, GC.
3. Pass: FPS ≈60, нет регулярных красных long tasks от нашего JS (poll/store).
4. Fail: пила 15–30 FPS + main busy даже при glow off.

### DevTools → Layers (или about:layers / Inspector → 3-dot → Layers)

1. Убедиться, что iframe плеера — один крупный слой, без лишних blurred layers вокруг.
2. Pass: нет огромных layers с `filter`/`backdrop-filter` поверх кадра.
3. Fail: несколько full-viewport blur layers + glow canvas.

### Сколько iframe

В Console:

```js
[...document.querySelectorAll('iframe')].map(f => f.src || f.className)
```

Pass: **один** видео/Kodik iframe в player slot (допускаются мелкие third-party, не дубли Kodik).  
Fail: `player-warm` / второй Kodik src одновременно.

### Glow / ambient sanity

```js
({
  glowDom: !!document.querySelector('.vp-glow'),
  ambientImg: !!document.querySelector('.ambient img'),
  hoverCards: !!document.querySelector('[data-hover-cards], .hover-card'),
})
```

Pass на `/watch`: `glowDom=false` (без opt-in), `ambientImg=false`.

### Быстрый A/B

| Шаг | Ожидание |
|---|---|
| Glow ON → OFF | FPS заметно растёт |
| Danmaku ON → OFF | меньше композитинга |
| Смена озвучки | не оставляет 2 iframe >1–2 с |

---

## Если всё ещё лагает — вне сайта

Сначала зафиксировать baseline на чистом профиле Firefox (без расширений). Если на сайте glow/ambient/warm уже OFF, а FPS низкий — проверить окружение:

1. **VPN / TUN** — шифрование + рероутинг режет decode/network; тест без VPN или split-tunnel.
2. **YouTube Live / другая вкладка с видео** — второй аппаратный декодер; закрыть или mute+unload.
3. **Discord overlay** — инжект в GPU/window; выкл Overlay в Discord → Games.
4. **Steam overlay** — то же; выкл в Steam → In-Game.
5. **NVIDIA/AMD overlay, MSI Afterburner / RTSS, Xbox Game Bar** — снять OSD.
6. **Аппаратное ускорение Firefox** — `about:preferences` → Performance; сравнить ON/OFF (иногда драйвер виноват).
7. **Расширения** (adblock cosmetic на iframe, privacy badger, dark reader) — тест в `about:profiles` чистый.
8. **Энергосбережение Windows / hybrid GPU** — ноут на батарее форсит iGPU; тест от сети + High performance.
9. **Высокий DPI + масштаб 150%** — больше пикселей на композит; сравнить 100%.
10. **Другой плеер/качество** — 480p vs 720p vs 1080p: если только 1080p лагает, это decode, не React.

Если clean Firefox + glow off + 1 iframe + без overlay всё ещё ~20 FPS — тогда баг сайта (логировать Layers + Performance profile).

---

## Зоны агентов 1–9 и конфликты merge

| Agent | Зона | Риск пересечения |
|---|---|---|
| **1** | `VideoPlayer.tsx`; `player.css` (`.player-iframe`, `.player-warm`, spinner) | vs **3** (`player.css`), **9** (CSS graph / lazy player) |
| **2** | `PlayerGlow.tsx`, `ambient*`, `styles.css` `.ambient`, `player.css` `.vp-glow`, glow checkbox | vs **3** (`.vp-glow` / `player.css`), **5**/`Layout` ambient mount, **6**/`Home`+**7**/`Title` через ambient API, **9** `styles.css` |
| **3** | `player.css`, `danmaku.css` (не усиливать `.vp-glow` если патчит 2) | vs **1**, **2**, **9** |
| **4** | `Player.tsx`, `watchModes.ts`, lazy engage imports | vs **1**/`VideoPlayer` wiring, **2** glow mount, **5** layout shell; не лезть в internals 1/2 |
| **5** | `Layout.tsx`, Navbar/BottomNav, `tilt.ts`, HoverCards, scroll, `analytics.ts` | vs **6** poster hover (Layout wiring), **9** route shell; header CSS может пересечься с глобальными стилями |
| **6** | `Home*`, hero, `Catalog*`, shelves, poster-card CSS/TSX | vs **5** (tilt/hover на карточках), **2** ambient на Home, **9** CSS imports |
| **7** | Title/Random/Schedule/Season + css; Together **UI only** | vs **2** ambient на Title, **9** `together.css` wiring, не трогать WebRTC |
| **8** | `src/api/core.ts`, pollers rooms/chat/inbox, SW, fetch helpers | почти изолирован; осторожно с SW vs **9** assets |
| **9** | vite config, lazy routes, CSS import graph (`styles.css`, `player.css`, `together.css`) | **высокий** конфликт с **1–3, 6–7** если двигает те же CSS entry |
| **10** | `docs/PERF_WATCH.md` only | нет кода |

### Нельзя слепо мержить вместе (cherry-pick / параллельные патчи)

1. **`player.css`:** не мержить **1 + 3 + 9** одним коммитом без ручного разбора hunks. Порядок: сначала семантика **1** (iframe/warm), потом эффекты **3**, в конце только import/split **9**.
2. **`.vp-glow`:** **2 побеждает** визуал/немонтирование; **3** не должен откатывать/усиливать blur. Не принимать оба правки одних и тех же правил вслепую.
3. **`styles.css`:** **2** (`.ambient`) vs **9** (graph) — мержить по секциям; **9** не режет ambient selectors.
4. **`Layout.tsx` + Home/Catalog posters:** **5** владеет wiring HoverCards/tilt; **6** — стили/карточки. Не дублировать `startTilt` / hover mount.
5. **`Player.tsx` (4) + VideoPlayer (1) + Glow (2):** 4 только откладывает mount/engage; не принимать рефактор пропсов плеера от 4, если 1 меняет API слотов.
6. **Together:** **7** UI vs **9** `together.css` import — UI сначала, split потом.
7. **Service Worker (8) vs vite assets (9):** не ломать precache hashed names.

### Рекомендуемый merge order

```
8 (poll/core/SW)           ← изолирован, меньше FPS-шума на main
1 (VideoPlayer / warm iframe CSS slices)
2 (Glow + ambient cost)
3 (player/danmaku CSS effects)   ← после 2, чтобы .vp-glow не конфликтовал
4 (Player.tsx engage defer)
5 (Layout / tilt / analytics pause)
6 (Home / Catalog / posters)
7 (Title / Season / Together UI)
9 (vite + lazy routes + CSS graph)  ← последним: меньше rebase боли
10 (этот документ)                  ← когда угодно; лучше вместе с итогом волны
```

Правило: **после каждого шага** — `npm run build` + смоук `/watch` (1 iframe, glow off).  
Не поднимать `warmLimit` и не включать glow/ambient/danmaku по умолчанию в любом агенте.

---

## Смоук после деплоя (60 с)

1. `/watch` → play 720p → FPS ок, 1 iframe, glow/ambient off.
2. `/` → LCP постер/hero без вечного blur thrash.
3. `/anime/:id` → постер LCP, ниже fold не блокирует.
4. `/catalog` → сетка lazy, скролл гладкий.
5. Вместе (если трогали 7/9) — комната открывается, voice не регрессит.

## Связанные доки

- `docs/worker-limit.md` — Free Worker 100k/сутки, WAF до Worker.
- `docs/rooms-do.md` — RoomDO (Paid); не путать с Free poll throttle.
