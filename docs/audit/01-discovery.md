# AGENT 1 — Discovery

Аудит зоны витрины / discovery (Home, Catalog, Landing, Top, Random, Season, поиск, shelves/hero).  
Код не менялся. Prod: https://animelife.top. Дата среза: 2026-11-10.

Уже принято (не откатывать): Core only; warmLimit=0; glow/ambient/danmaku off defaults; watch layout lite; visibilityPoll; WAF Free 5; PERF_WATCH.md.

---

## Scope

**В зоне**
- Роуты: `/` (Home), `/catalog`, `/search`→catalog, `/ongoing`, `/genre/:slug`, `/theme/:slug`, `/best/:slug`, `/studio/:slug`, `/type/:kind`, `/year/:year[/:season]`, `/top`, `/random`, `/season`
- UI: Hero, ContinueWatching, Onboarding, HomeBento, SeasonShelf / MoreShelves / GenreTiles / Discover, Catalog + SearchHints, Landing + related chips
- Навигация к discovery: Navbar, BottomNav/MoreSheet, NavMoreDropdown, FooterLinks

**Вне зоны (только касания):** Title/Player, Library, Schedule как страница, Collections/Quiz/Duel/Trope (кроме ссылок с витрины), worker.

**Файлы-якоря**
- `src/App.tsx` — карта роутов
- `src/pages/Home.tsx`, `src/components/HomeShelves.tsx`
- `src/pages/Catalog.tsx`, `src/components/CatalogGrid.tsx`, `src/components/SearchHints.tsx`, `src/components/SearchBox.tsx`
- `src/pages/Landing.tsx`, `src/data/landings.ts`, `src/data/studios.ts`
- `src/pages/Top.tsx`, `src/pages/Random.tsx`, `src/pages/Season.tsx`
- `src/components/Onboarding.tsx`, `src/components/Recommendations.tsx`, `src/data/taste.ts`
- `src/components/Navbar.tsx`, `src/components/BottomNav.tsx`, `src/components/MoreSheet.tsx`, `src/components/NavMoreDropdown.tsx`, `src/components/FooterLinks.tsx`

---

## Карта зоны

```
/  Home
├── Hero (top-5 ongoing popularity) → /watch/:id/1 | /anime/:id
├── Continue + NewEpisodesShelf (если history/watching)
├── Onboarding → taste → Recommendations «Вам понравится»
├── HomeBento → /schedule | /library|/top | /random
├── UpcomingShelf → /schedule
├── Топ-10 онгоингов → /catalog?status=ongoing
├── Сезонная полка → /season
├── Recommendations
├── MoreShelves: anons | ranked score≥8 → /top | GenreTiles → /genre/* | Discover | 4 genre-shelves
└── CatalogSection → /catalog

/catalog          фильтры в URL, бесконечная сетка + Pager
/search?q=…       Navigate → /catalog?q=
/ongoing          Landing paged:false + CatalogSection ongoing
/genre|theme|best|studio|type|year…  Landing + CatalogGrid + related chips
/top?tab=&kind=   Топ-100 (2×50)
/random           mood/format/score барабан
/season?s=&f=     сезонный чарт (отдельно от /year/:y/:s)
```

**Happy-path новичка:** Home → Onboarding / GenreTiles / «Что посмотреть?» (/random) → тайтл → watch.  
**Happy-path с историей:** Continue → NewEpisodes → Recommendations → Catalog.  
**Поиск:** SearchBox → hints (≥2 символа) → `/anime/:id` или `/catalog?q=`.

---

## Баги

| ID | Severity | Effort | Проблема | Evidence |
|----|----------|--------|----------|----------|
| D-01 | P1 | S | Hero CTA «Смотреть» всегда ведёт на серию 1, даже если тайтл уже в Continue / watching | `Home.tsx` ~254: ``/watch/${anime.id}/1``; Continue корректно использует `h.episode` (~325). URL: `/` |
| D-02 | P1 | M | Темы Shikimori (исэкай, реинкарнация, …) есть как SEO `/theme/*`, но **нет фильтра в Catalog** и почти нет in-app входа | `Catalog.tsx` — только `genre`/`nogenre`; `landings.ts` THEMES; FooterLinks — жанры без themes. HYPOTHESIS: высокий intent «аниме про исекай» упирается в мёртвую витрину |
| D-03 | P1 | S | Bottom dock не подсвечивает «Ещё» на `/season` (и на SEO-лендингах genre/theme/year/…) | `BottomNav.tsx` `IN_MORE` — нет `season`, нет `genre|theme|best|studio|year|type`. URL: `/season` |
| D-04 | P2 | S | Desktop «Ещё» (`NavMoreDropdown`) **не содержит** Сезон / Онгоинги; мобильный `MoreSheet` — содержит. Рассинхрон discovery-навигации | `NavMoreDropdown.tsx` vs `MoreSheet.tsx` |
| D-05 | P2 | S | Дубль «онгоинги» на Home: Hero = top ongoing popularity; полка «Топ-10 онгоингов» = тот же `status:ongoing, order:popularity` | `Home.tsx` `ONGOING_TOP`; `HomeShelves.tsx` SeasonShelf ranked=10 |
| D-06 | P2 | M | Related на genre/theme — **все** остальные жанры/темы чипами (десятки ссылок); на studio — все студии. Перегруз UX, слабая «смотри также» | `landings.ts` ~230, ~246, ~326; `Landing.tsx` chips |
| D-07 | P2 | S | Полки genre в MoreShelves дублируют GenreTiles (music/sports/romance/mystery уже в плитках) + score≥7 может скрыть полку целиком → «дырявая» нижняя витрина | `HomeShelves.tsx` THEMES + GenreTiles |
| D-08 | P2 | S | `/ongoing` — thin landing: `paged:false`, без своей сетки-пейджера; контент = `CatalogSection`, «ещё» ведёт в `/catalog?status=ongoing`, а полки иногда шлют туда же вместо `/ongoing` | `landings.ts` ~329–345; `Landing.tsx` ~58; `HomeShelves.tsx` more=`/catalog?status=ongoing` |
| D-09 | P2 | S | Onboarding: «Не сейчас» навсегда ставит `taste.done=true`; без liked-тайтлов Recommendations не появятся → холодный старт без персонализации | `Onboarding.tsx` ~56–57, ~165; `taste.ts`; `Recommendations.tsx` `if (!seeds.length) return null` |
| D-10 | P2 | S | Random mood «Другой мир» = genre fantasy `10`, не theme isekai `130` — ожидание «попаданцы» ≠ выдача | `Random.tsx` moods; `landings.ts` THEMES isekai id 130 |
| D-11 | P3 | S | Continue progress-bar: `(h.episode / h.totalEpisodes) * 100` при `totalEpisodes===0` → NaN% | `Home.tsx` ~333 |
| D-12 | P3 | S | GenreTiles «Все жанры» → `/catalog` без якоря/подсветки жанров; темы в футере отсутствуют | `HomeShelves.tsx` ~449; `FooterLinks.tsx` |
| D-13 | P3 | M | Три «сезонных» поверхности без явной связи: `/season` (чарт), `/year/:y/:s` (landing popularity), Top tab «Этот сезон» | `Season.tsx`, `landings.ts`, `Top.tsx` |
| D-14 | P3 | S | Catalog: infinite scroll + URL `?page=` + Pager — двойная модель пагинации; deep-link `page=3` начинает с 3-й страницы Shikimori, 1–2 «пропущены» в сетке | `CatalogGrid.tsx`, `Catalog.tsx` |
| D-15 | P3 | S | SearchHints: пустое поле = recent или top-5 ongoing (тот же запрос, что Hero); нет shortcut на `/random` / жанры из hints | `SearchHints.tsx` `loadPopular` |
| D-16 | P3 | S | HYPOTHESIS: thin SEO-лендинги (`/genre/cars`, `/genre/gourmet`, редкие `/theme/*`, будущий `/year/{y+1}`) часто дают короткую/пустую первую страницу без enriched empty-state (в отличие от Catalog NothingFound) | `Landing.tsx` vs `Catalog.tsx` NothingFound |

---

## UX

1. **«Что посмотреть?» размазано:** bento, Discover, Catalog pills, More («Случайное»), footer — разный копирайт, один `/random`. Нет единого primary entry в top-nav.
2. **Новичок без клика Onboarding** видит Hero (популярные онгоинги) + bento + полки — ок, но персонализации нет; dismiss Onboarding закрывает путь навсегда.
3. **Каталог сильный** (раскладка, hide mine, chips order/status), но **темы genre_v2 недоступны** — разрыв SEO↔продукт.
4. **Сезон:** мощный чарт (`/season`), но спрятан в More (mobile) / отсутствует в desktop More; BottomNav на `/season` «слепой».
5. **Landing related** выглядит как SEO-свалка ссылок, не как curated «дальше смотреть».
6. **Top vs /best/\***: два «лучших по оценкам» без перекрёстных ссылок с Top на `/best/{year|genre}`.
7. Пустые полки корректно `return null` (`CatalogShelf`, Upcoming &lt;3) — хорошо против пустых рядов, плохо для стабильности layout (прыжки при загрузке). HYPOTHESIS: CLS на Home при cascade Suspense.

---

## Техдолг

- Дублирование season-code логики: `HomeShelves.currentSeason`, `Top.season()`, `api/season.currentSeason` — риск расхождения декабря/зимы.
- `CATALOG.related` в `landings.ts` огромный, но Catalog page его **не рендерит** — мёртвые данные для UI (используются, HYPOTHESIS, в worker/sitemap).
- Home: много независимых `loadCatalog`/`loadSchedule` через lazy shelves — уже частично с IO; всё ещё риск параллельных Shikimori hit на cold home (Free WAF 5).
- Onboarding `candidates` — до 3 параллельных catalog-запросов при смене жанров.
- Emoji в Discover / Random / empty-states — против общего visual direction продукта (не блокер).

---

## Идеи функций

1. **Taste-onboarding v2:** mood chips → сразу `/random` spin или shelf; возможность reopen из Account; genres-only finish.
2. **Themes в Catalog:** MultiPick «Темы» → `themeId` / `genre_v2`; плитки «Исэкай / Реинкарнация» на Home рядом с GenreTiles.
3. **Unified «Что посмотреть» hub:** `/random` + deep-links moods + top collections + «продолжи сезон» в одном entry из Navbar.
4. **Hero smart CTA:** resume episode / «след. серия» для watching; иначе ep.1.
5. **Landing empty kit:** как Catalog NothingFound — random / top / соседний genre при &lt;N результатов.
6. **Curated related:** 6–8 соседних (не весь GENRES dump); studio: «похожие студии» вручную.
7. **Cross-link сезон:** с `/season` → `/year/{y}/{s}` и наоборот; Top tab season → `/season`.
8. **Search empty shortcuts:** «Подобрать по настроению», топ жанров, недавние фильтры catalog.
9. **Home dedupe:** Hero = editorial/spotlight; полка ongoing — ranked или «новые серии», не тот же popularity slice.
10. **Dock:** включить `/season` (+ опционально landing-префиксы) в `IN_MORE`.

---

## Быстрые победы

| # | Effort | Действие |
|---|--------|----------|
| 1 | S | Hero CTA: ep из history/myList или 1 (`Home.tsx`) |
| 2 | S | Добавить `season` (+ `genre|theme|…`) в `BottomNav` `IN_MORE` |
| 3 | S | Добавить Сезон / Онгоинги в `NavMoreDropdown` |
| 4 | S | Related: `.slice(0, 8)` для genre/theme/studio |
| 5 | S | Полки MoreShelves: убрать пересечение с GenreTiles или заменить на themes (isekai…) |
| 6 | S | Ongoing shelf `more` → `/ongoing` единообразно |
| 7 | S | Random mood «Другой мир» → theme isekai (или два mood) |
| 8 | S | Continue bar: guard `totalEpisodes > 0` |
| 9 | M | Theme filter в Catalog + 4–6 theme tiles на Home |
| 10 | S | Onboarding: «Не сейчас» = snooze (7д), не hard done; или кнопка «Настроить вкус» в Account |

---

## Не трогать

- Core-only API / warmLimit=0 / glow·ambient·danmaku defaults / watch lite / visibilityPoll / WAF Free 5 / `docs/PERF_WATCH.md` — как зафиксировано.
- `src/worker` (вне scope аудита; не править).
- SEO-тексты `GENRE_INTROS` / `THEMES.intro` / studio intros — не выкидывать ради «thin»; чинить UX related/empty, не удалять лендинги оптом.
- Рабочий swap-layout поиска и Catalog hide-mine — оставить.
- Сезонный чарт `/season` как отдельный продукт — не сливать вслепую с `/year/...`.

---

## Вопросы

1. Hero — это «маркетинговый баннер онгоингов» или «продолжить / актуальное для меня»? От этого зависит D-01/D-05.
2. Нужны ли `/theme/*` как product surface или только SEO? Если product — D-02 в приоритете P0/P1.
3. Ок ли сократить related chips (SEO internal links) до 6–8 curated, остальное оставить в sitemap?
4. Onboarding: snooze vs permanent dismiss — продуктовое решение.
5. Стоит ли вынести «Что посмотреть?» в primary Navbar (вместо прятать в Ещё)?
6. HYPOTHESIS для проверки на prod: доля входов на `/theme/isekai` vs конверсия в watch; bounce на `/genre/cars` и future year; % пользователей с `taste.done && liked.length===0`.
