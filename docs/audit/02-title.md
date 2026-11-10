# Audit 02 — Title & related landings

**Agent:** 2/10  
**Repo:** `C:\Users\slava\.gemini\antigravity\scratch\AnimeLife`  
**Prod:** https://animelife.top  
**Дата:** 2026-11-10  
**Ограничения:** без правок `src/` (кроме этого файла); без коммита; без предложений glow-on-default / warm iframes (perf уже закрыт).

---

## Scope

| Зона | Файлы / маршруты |
|------|------------------|
| Карточка тайтла | `src/pages/TitlePage.tsx`, `src/pages/title.css`, `/anime/:id`, `/hentai/:id` |
| Похожие | `src/pages/SimilarPage.tsx`, `/similar/:id` |
| Хронология франшиз | `src/pages/ChronologyPage.tsx`, `src/data/franchises.ts`, `/chronology`, `/chronology/:id` |
| Тропы | `src/pages/TropeCollectionPage.tsx`, `src/data/animeTropes.ts`, `/trope`, `/trope/:slug` |
| Персонаж / персона | `src/pages/CharacterPage.tsx`, `src/pages/PersonPage.tsx`, `/character/:id`, `/person/:id` |
| Студия озвучки | `src/pages/VoiceStudioPage.tsx`, `src/components/VoiceoverFilter.tsx`, `/voice/:studio_slug` |
| Мост франшизы | `src/components/FranchiseBridge.tsx` (+ `WatchOrder.tsx` на тайтле) |
| FAQ / отзывы на тайтле | `src/components/TitleFaq.tsx`, lazy `Reviews`, `EpisodeComments` |
| SEO / мета | `src/data/pageMeta.ts`, `src/data/seoEngine.ts`, `src/components/SeoMeta.tsx`, `src/data/seo.ts`, зеркало в `worker/index.js` |

**Вне скоупа:** плеер/watch (кроме JSON-LD пересечений), каталог жанров, perf-glow.

---

## Карта

```
/anime/:id(-slug)
  ├─ SeoMeta → TVSeries|Movie + BreadcrumbList + AggregateRating  (app-jsonld)
  ├─ usePageMeta(titlePageTitle/Description)  — без poster в og:image
  ├─ hero: banner / poster / facts / StickyWatch / About
  ├─ FranchiseBridge → первая манга из related (не ранобэ)
  ├─ серии + «Без спойлеров» (только episode-cards)
  ├─ aside: legal links, staff→/person, SiteVoices, scores
  └─ DeferNear: characters, videos, shots, WatchOrder, BestEpisodes,
                ThemeSongs, TitleFaq(+useJsonLd FAQ), Comments, Reviews,
                Связанное, Похожее→/similar

/similar/:id     — сетка Shikimori, 404 если < SIMILAR_MIN(6); client без JSON-LD
/chronology/:id  — curated FRANCHISES; unknown → Fate; 2× useJsonLd
/trope/:slug     — curated TROPES + CatalogGrid(proxy genre/search); unknown → 1-й троп
/voice/:slug     — bio + CatalogGrid БЕЗ фильтра по озвучке; unknown → fake studio
/character/:id   — описание со spoiler-details; client без JSON-LD (worker Person)
/person/:id      — роли/работы; client без JSON-LD (worker Person)
```

**Worker vs SPA:** боты получают HTML из `worker/index.js`. Для `/voice|/chronology|/trope` worker отдаёт **тонкие stubs** (h1 + 1 абзац + placeholder ItemList). Для `/anime|/similar|/character|/person` — полноценный SSR-текст. SPA после гидрации переписывает DOM и JSON-LD своим путём.

---

## Баги

### P0 — TitleFaq `useJsonLd` затирает TVSeries/Movie `@graph`

- **Sev:** P0 · **Effort:** S  
- **Evidence:** `TitlePage` монтирует `SeoMeta` (`SCRIPT_ID = app-jsonld`, registry). `TitleFaq` (lazy, после `DeferNear`) вызывает `useJsonLd(faqSchema)` из `pageMeta.ts`, который **перезаписывает `textContent` того же `#app-jsonld`**. Observer в `SeoMeta` **не восстанавливает** payload, если `dataset.managedBySeoMeta` уже стоит (ветка characterData требует `!managedBySeoMeta`). Итог в SPA после появления FAQ: в head остаётся только `FAQPage`, без `TVSeries`/`Movie`/`BreadcrumbList`.  
- **Fix direction:** FAQ через `SeoMeta` `faq=` / общий `@graph`, не через `useJsonLd`.

### P0 — Client AggregateRating против политики Google + фейковые счётчики

- **Sev:** P0 · **Effort:** S  
- **Evidence:** Worker явно **не** ставит `aggregateRating` («оценки с Shikimori, Google запрещает»). Client `TitlePage` передаёт в `buildJsonLdSeries/Movie` `ratingCount: scores?.votes || 1000` и `reviewCount: … || 100` — выдуманные числа при отсутствии scores. Rich Results risk / manual action.  
- **Fix direction:** убрать rating из client JSON-LD (как worker) или только реальные `scores.votes` без fallback/reviewCount.

### P1 — Chronology: два `useJsonLd` → второй убивает первый

- **Sev:** P1 · **Effort:** S  
- **Evidence:** `ChronologyPage.tsx` L40–80 `useJsonLd(WebPage+ItemList)`, L99 `useJsonLd(faqSchema)`. Один `#app-jsonld`: остаётся FAQ или `null` (скрипт удаляется, если FAQ нет).  
- **Fix direction:** один вызов / `@graph` WebPage+FAQ+ItemList.

### P1 — Soft-200 на неизвестных `/chronology/:id`, `/trope/:slug`, `/voice/:slug`

- **Sev:** P1 · **Effort:** M  
- **Evidence:**  
  - Client: `getFranchiseById ?? ANIME_FRANCHISES[0]`, `getTropeBySlug ?? ANIME_TROPES[0]`, `getVoiceStudioBySlug` → **синтетическая** студия со stats `releases:100`, `rating:'4.8/5'`.  
  - Worker prod: `https://animelife.top/chronology/nonexistent-franchise-xyz` → **200**, title «Nonexistent Franchise Xyz», thin body.  
  - `/studio/nope` в тестах → 404; voice/chronology/trope — нет.  
- **Fix direction:** 404 (client `NotFound` + worker `notFound()`), sitemap только whitelist.

### P1 — `/voice/:slug` не фильтрует каталог по озвучке

- **Sev:** P1 · **Effort:** L  
- **Evidence:** `VoiceStudioPage` `catalogQuery` = genre/status/order/search; `CatalogGrid` без voice-параметра. H1/meta обещают «аниме в озвучке X», сетка — общий Shikimori popularity. Worker stub ещё тоньше.  
- **Impact:** thin / misleading landing, риск mismatch query↔content.

### P1 — Worker chronology JSON-LD с фейковым ItemList

- **Sev:** P1 · **Effort:** M  
- **Evidence:** `worker/index.js` `chronologyPage`: `itemListElement` из 2 placeholder (`#part-1`, `#part-2`), не из `franchises.ts`.  
- **Fix direction:** шарить данные франшиз worker↔app или не отдавать ItemList до реальных URL.

### P2 — Client title без `og:image` постера

- **Sev:** P2 · **Effort:** S  
- **Evidence:** `usePageMeta(info && title…, info && desc…)` — 3–4 args image/type не передаются; дефолт `/og-image.png`. Worker для ботов ставит poster (Frieren OK). SPA/некоторые превью — нет.

### P2 — TitleFaq: шаблонные ответы ≠ факты тайтла

- **Sev:** P2 · **Effort:** M  
- **Evidence:** ответ «в какой озвучке» хардкодит AniLibria/Studio Band/… независимо от `SiteVoices`/`anixart`. Для фильма формулировка «N серий / релиз завершен» кривая. FAQPage в разметке усиливает риск.

### P2 — «Без спойлеров» только на episode-cards

- **Sev:** P2 · **Effort:** M  
- **Evidence:** `noSpoilers` + CSS blur на `.episode-card--hidden`. Не закрывает: галерею кадров, YouTube (трейлеры/OP), shelf персонажей, `BestEpisodes`, описание, related titles. Fallback-кадры серий = ротация `screenshots` тайтла (могут спойлерить даже под blur при scale).

### P2 — Similar/Character/Person: SPA без JSON-LD / крошек UI

- **Sev:** P2 · **Effort:** M  
- **Evidence:** Worker отдаёт ItemList/Person; client `SimilarPage`/`CharacterPage`/`PersonPage` только `usePageMeta`, без `useJsonLd`/`SeoMeta`, без breadcrumb nav (similar — есть). После SPA-навигации schema может пропасть до следующего hard load.

### P2 — FranchiseBridge берёт «первую попавшуюся» мангу

- **Sev:** P2 · **Effort:** S  
- **Evidence:** `related.find(r => r.href && kind !== Ранобэ/Новелла)` — не приоритет `adaptation`/`source`. Мост к curated `/chronology/:id` отсутствует, хотя `WatchOrder` (Shikimori franchise) живёт отдельно от `ANIME_FRANCHISES`.

### P3 — Дубли / шум schema на тайтле

- **Sev:** P3 · **Effort:** S  
- **Evidence:** `SeoMeta` кладёт `aggregateRating` и в entity, и отдельным узлом `@graph`. Character worker `@type: Person` вместо fictional Character. Chronology breadcrumb «Хронологии» → `/chronology/fate` (не индекс). ShareButton path `/anime/${id}` без slug.

### P3 — Trope grid ≈ proxy catalog

- **Sev:** P3 · **Effort:** L  
- **Evidence:** `suggestedCatalogQuery` (genre/search) + `CatalogGrid` — не curated list; popularTitles только кнопки `q=`. Часть выдачи не про троп → soft thin.

---

## UX

| Находка | Sev | Effort | Notes |
|---------|-----|--------|-------|
| StickyWatch + серии/диапазоны — сильная модель для длинных сериалов | — | — | Сохранить |
| SiteVoices → choosePlayerVoice — хороший deep-link в плеер | — | — | |
| Soft-fallback Fate/первый троп/fake voice — пользователь думает, что URL валиден | P1 | M | Нужен 404 + «похожие хронологии» |
| Voice landing: bio красивый, сетка не про студию — ожидание ломается | P1 | L | |
| WatchOrder vs Chronology — два UX порядка без связи | P2 | M | CTA «гид по франшизе» когда id в `ANIME_FRANCHISES` |
| Character spoiler `<details>` — хорошо; на тайтле нет аналога для description/shots | P2 | M | |
| Reviews пустой / failed — секция всё равно есть (ок), но без FAQ-связки | P3 | S | |
| Inline styles на Chronology/Trope/Voice — визуально «другое приложение» vs title.css | P3 | L | Design debt, не perf-glow |

---

## Техдолг

1. **Два контура JSON-LD:** `SeoMeta` registry vs `useJsonLd` single-script — конфликт уже на Title+FAQ и Chronology.  
2. **Worker stubs vs rich SPA** для voice/chronology/trope — боты индексируют thin; люди видят другое.  
3. **Нет единого source of truth** franchise/trope/voice данных между `src/data/*` и `worker/index.js` (имена через slug-format).  
4. **`seoEngine.ts`** богат, но TitlePage использует узкий subset + локальные fake rating defaults.  
5. **Canonical keep-page** для `/voice|/trope` в `getCanonicalUrl`/`PAGED` — ок; filter query strip → дубли фильтров на одном canonical (осознанно, но контент сетки меняется).

---

## Идеи

1. **Единый `@graph` на тайтле:** Series/Movie + Breadcrumbs + FAQ (+ Review, если свои отзывы) через один `SeoMeta`.  
2. **Мост Title → Chronology:** если anime id ∈ franchise items → chip «Порядок просмотра франшизы» рядом с WatchOrder.  
3. **Voice landings на реальных данных:** индекс Anixart/Kodik «titleIds by studio» или честный disclaimer + ручные top-N, пока нет API.  
4. **Spoiler mode v2:** опция «скрыть кадры/видео/имена серий в BestEpisodes» + не подставлять gallery shots как episode frames.  
5. **Curated trope lists:** 12–24 явных anime id на троп вместо proxy search (меньше thin).  
6. **Character/Person client schema + crumbs** паритет с worker.  
7. **FAQ из фактов страницы:** серии/онгоинг/реальные голоса/`ageLabel`/mangaRel.  
8. **404 + «похожие»** для битых chronology/trope/voice URL.  
9. **og:image = poster** в `usePageMeta` на Title/Similar/Character.  
10. **Similar ItemList** на клиенте (как worker) для SPA-share.

---

## Быстрые победы

| # | Что | Sev | Effort |
|---|-----|-----|--------|
| 1 | TitleFaq → `SeoMeta faq` / убрать `useJsonLd` | P0 | S |
| 2 | Убрать fake `ratingCount:1000` / `reviewCount` (или весь AggregateRating с клиента) | P0 | S |
| 3 | Chronology: один `useJsonLd` с `@graph` | P1 | S |
| 4 | `NotFound` на unknown franchise/trope/voice slug (client) | P1 | S |
| 5 | `usePageMeta(..., anime.posterUrl, video.tv_show\|movie)` | P2 | S |
| 6 | FranchiseBridge: prefer relation adaptation/source | P2 | S |
| 7 | Worker `notFound()` на unknown chronology/trope/voice | P1 | S |

---

## Не трогать

- Lazy/DeferNear для Reviews/FAQ/Lightbox — правильный perf-контур.  
- Worker отказ от AggregateRating на тайтле — правильная SEO-политика.  
- Similar 404 при `< SIMILAR_MIN` — защита от thin pages.  
- Canonical slug-redirect `/anime/6` → `/anime/6-trigun`.  
- Character spoiler `<details>` парсинг.  
- SiteVoices «Ещё»/Kodik-Yummy lazy load.  
- StickyWatch / episode ranges / spoiler toggle UX-модель (расширять, не ломать).  
- Glow-on-default / warm iframes — вне скоупа (perf).

---

## Вопросы

1. Есть ли (или планируется) источник «тайтлы студии озвучки X», или voice-страницы временно маркетинговые?  
2. Нужен ли AggregateRating когда-нибудь по **своим** отзывам AnimeLife, или держим запрет как worker?  
3. Схлопывать ли WatchOrder (Shikimori) и curated Chronology в один UX?  
4. Индексировать ли `/trope/*` при proxy-catalog, или noindex до curated lists?  
5. Должен ли soft-fallback Fate остаться для `/chronology` без id, а для битого id — только 404?

---

## Вердикт (кратко)

Карточка тайтла по UX/контенту сильная (серии, голоса, related/similar, WatchOrder), SSR тайтла/similar/character/person у worker зрелый. Главный риск зоны — **ломаный/противоречивый JSON-LD в SPA** (FAQ vs Series, fake ratings) и **thin/misleading landings** voice/chronology/trope (stubs + soft-200 + сетка не про озвучку). Спойлер-режим дырявый за пределами episode grid. Быстрые S-фиксы закрывают оба P0 без тяжёлой инфраструктуры.
