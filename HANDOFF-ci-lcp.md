# Handoff: CI / LCP / сезон / прод (ноя 2026)

Контекст для следующего агента (в т.ч. Grok Bot). Репозиторий: AnimeLife (`animelife.top`), Preact + Vite + Cloudflare Pages/Worker + Playwright e2e.

## Цель волны

1. Дожать CI — зелёный e2e на актуальном `main`.
2. Замерить LCP lab после постера на герое: `/`, `/catalog`, `/watch`.
3. Одна фича — сезонная сетка прогресс/план (не пуши «Смотрю»).
4. Пауза на метрики пользователей — только лёгкий skim прода/robots, без GSC-спама и новой волны агентов.

## Сделано

### CI (зелёный)

- `cad337c` — e2e под новый UI, сетка сезона, LCP героя без кадров на телефоне.
- `47983af` — добивка красных после `cad337c`:
  - Together: `role="listitem"` на `<Link>` ломал `getByRole('link')` → обёртка `div[role=listitem]` + Link внутри; в `mockRoom` мок `/api/time`.
  - Catalog phone: чип «По алфавиту» в overflow-x → клик через `evaluate`.
  - tier1 catalog: assert `getByRole('img')` (OptimizedImage fallback без `<img>`).
  - Community clubs: текст «Войдите, чтобы создать клуб».
  - Episode jump: `getByRole('searchbox', { name: 'Найти серию' })`.
  - Player hosts: `getByRole('group', { name: 'Плеер', exact: true })`.
  - robots: ожидать `Googlebot`, не запрещать его.
  - round4 screenshots: валидный 1×1 GIF вместо пустого webp.
- CI run: https://github.com/Miluoky/AnimeLife/actions/runs/42398838087 — success (сборка, Lighthouse job, браузерные тесты, деплой).

### LCP lab (mobile, prod, после постера на герое)

Было ~6.4 с на `/`. После волны (локальный Lighthouse на prod):

| URL | LCP | perf score |
|-----|-----|------------|
| `/` | ~4.8 с | ~0.56 |
| `/catalog` | ~4.6 с | ~0.58 |
| `/watch/1/1` | ~4.7 с | ~0.57 |

Артефакты локально: `.tmp-lh-*-3.json` (не коммитить).

### Фича

Сезонная сетка: `SeasonPlanBar` в `src/pages/Season.tsx` + `seasonPlan` data — прогресс серий, % бар, чипы плана. Уже в `main` с `cad337c`.

### Прод / SEO

- `robots.txt` на prod отдаётся, Googlebot/Yandex/AI-disallow на месте.
- Деплой Pages + animelife.top на `47983af` успешен.
- GSC / Indexing API не трогали в этой волне.

## Не коммитить

- `.tmp-lh-*.json`, `.tmp-pw-out.txt` — локальные замеры.

## Возможные следующие задачи для агента

Приоритет низкий (волна закрыта); если брать работу:

1. LCP `/` ещё ниже 4 с (hero poster / font / JS) — точечно, с новым lab-замером.
2. Flaky `network.spec` offline → «Нет интернета» на phone (иногда проходит с retry).
3. Пуши «Смотрю» end-to-end — отдельная фича, не начата.
4. Не запускать массовую SEO/GSC-волну без явного запроса.

## Ключевые пути

- Together list UI: `src/pages/TogetherHome.tsx`
- e2e: `tests/together.spec.ts`, `tests/catalog.spec.ts`, `tests/e2e/*`, `tests/player.spec.ts`, `tests/proxy.spec.ts`, `tests/round4.spec.ts`
- Season plan: `src/pages/Season.tsx`, `src/data/seasonPlan.ts`
- Hero LCP: `src/pages/Home.tsx`, `src/components/OptimizedImage.tsx`
