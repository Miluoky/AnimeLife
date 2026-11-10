# AGENT 7 — Манга / читалка / adult (hentai)

## Scope
- Роуты: `/manga`, `/manga/:id`, `/manga/:id/chapter/:chapter`, `/manga/:id/upload`, `/hentai`, `/hentai/:id`, `/hentai/watch/:id/:episode`, `/hentai-manga`, `/hentai-manga/:id`, `/hentai-manga/:id/chapter/:chapter` (+ редирект `/mangas/*`)
- UI: `MangaHome`, `MangaPage`, `MangaReader`, `MangaUpload`, `HentaiCatalog`, `HentaiMangaHome`, `HentaiCard`, `AgeGateModal`, `FranchiseBridge` (anime↔manga)
- API/data: `api/manga.ts`, `api/mangadex.ts`, `api/mangaOwn.ts`, `api/hentai.ts`, `api/hentaiManga.ts`, `data/adult.ts`, `data/hentaiGenres.ts`, `data/mangaProgress.ts`, `data/mangaOffline.ts`
- Worker: `worker/core/manga.js` (R2 `MANGA` отложен), `worker/mangadexProxy.js`; docs: `worker/core/README.md`
- Age gate также на `TitlePage` / `Player` (смежная зона AGENT 3) — здесь только пересечение с мангой/флагами
- Не предлагать «просто включить R2» без учёта billing constraint (карта вне РФ)

## Карта зоны
| URL / модуль | Компонент | Статус |
|---|---|---|
| `/manga` | `MangaHome` | ok (каталог + «Читаю»); copy про «загруженные к нам» — **нечестно** при `OWN_MANGA_ENABLED=false` |
| `/manga/:id` | `MangaPage` + AgeGate по жанру | ok / thin — AgeGate есть; MangaDex `adult:true` **не передаётся** |
| `/manga/:id/chapter/:…` | `MangaReader` | ok UX (лента/страницы/RTL/офлайн); **нет AgeGate**; hardcode `/manga/` |
| `/manga/:id/upload` | `MangaUpload` | **dead by design** — честный 503/экран «нет R2» |
| `/hentai` | `HentaiCatalog` + AgeGate | ok shell; теги без `shikiGenreId` — **мёртвые фильтры** |
| `/hentai/:id`, `/hentai/watch/…` | `TitlePage` / `Player` | thin isolation — карточки ведут на `/anime/…`, не `/hentai/…` |
| `/hentai-manga` | `HentaiMangaHome` + AgeGate | ok каталог; карточки → `/manga/:id` (роуты `/hentai-manga/:id` почти не используются) |
| `/hentai-manga/:id` (+ chapter) | те же `MangaPage` / `MangaReader` | **thin / broken path** — ссылки внутри снова на `/manga/…` |
| Age gate | `AgeGateModal` + `isAdultContent` | soft (localStorage); reader/deep-link **обход** |
| Own chapters / R2 | `mangaOwn` + `worker/core/manga.js` | **отложено** — binding `MANGA` нет → 503; клиент `OWN_MANGA_ENABLED=false` |
| Anime↔manga | `FranchiseBridge`, related на `TitlePage`/`MangaPage` | ok мост; «Продолжить» → chapter **минуя** AgeGate |

## Баги и недочёты
| ID | Sev | Что | Evidence | Effort |
|---|---|---|---|---|
| A7-B01 | P1 | **Хентай-манга не находит pornographic на MangaDex.** `findMangadex` / `mergeChapters` / `fetchChapters` вызываются **без** `{ adult: true }`, хотя API явно: без флага `contentRating` = safe/suggestive/erotica только. Итог: у 18+ тайтлов блок «Читать» часто «Глав нет», хотя на MD главы есть. | `MangaPage.tsx` ReadBlock ~58, 68; `MangaReader.tsx` ~105–111; `mangadex.ts` 86–91, 104–118 | S |
| A7-B02 | P1 | **AgeGate обходится deep-link’ом в читалку.** `MangaReader` не проверяет `isAdultContent` / `isAgeVerified`. Пути: полка «Читаю», `FranchiseBridge` «Продолжить», шаринг URL `/manga/:id/chapter/…`, закладки. Страница манги гейтит, глава — нет. | `MangaReader.tsx` (нет импорта AgeGate); `MangaHome` Reading ~88; `FranchiseBridge.tsx` 38–39 | S |
| A7-B03 | P1 | **«Изоляция» `/hentai-manga/*` фиктивна.** Роуты есть, но `HentaiCard` (`isManga`) ведёт на `/manga/${id}`; `chapterUrl` / reader back / nav всегда `/manga/…`. Пользователь уходит из 18+ раздела после первого клика. | `HentaiCard.tsx` 14; `MangaPage.tsx` 51; `MangaReader.tsx` 135, 259–269; `App.tsx` 133–135 | S–M |
| A7-B04 | P2 | **Теги хентай-каталога без `shikiGenreId` не фильтруют.** `genreParam = selectedTagObj?.shikiGenreId ?? 12` → vanilla / uncensored / milf / tentacles / incest / bdsm / … визуально «активны», запрос тот же genre=12. | `hentaiGenres.ts` 8–33; `HentaiCatalog.tsx` 31–38 | M (нужна модель тегов Shiki/алиасы или убрать) |
| A7-B05 | P2 | **Хентай-аниме карточки не держат `/hentai/` prefix.** `HentaiCard` → `/anime/:id` (и далее обычный watch). AgeGate на Title/Player спасает контент, но «изолированный раздел» в URL/навигации теряется; back stack путает. | `HentaiCard.tsx` 14; `App.tsx` 130–132 | S |
| A7-B06 | P2 | **`isAdultContent` для манги только по жанру.** `MangaPage` / `fetchManga` **не** мапят `rating`; проверка = `rx` **или** жанр `/^хентай$/i`/`hentai`. Эротика / doujin без жанра «Хентай», MD `erotica` в обычном поиске MD — без gate. | `adult.ts`; `api/manga.ts` 7–95 (нет rating) | S–M |
| A7-B07 | P2 | **Fallback-каталоги 18+ врут при сбое API.** `FALLBACK_HENTAI` / `FALLBACK_HENTAI_MANGA` — захардкоженные тайтлы (есть явные title/original mismatches, напр. «Инуясики» vs `Raimu-iro Senkitan`). После AgeGate юзер видит «живой» грид, которого нет. | `api/hentai.ts` 11–76, 95–101; `api/hentaiManga.ts` 7–77 | S |
| A7-B08 | P2 | **Copy на `/manga` обещает свои загрузки.** «Переводы команд с MangaDex и загруженные к нам» при `OWN_MANGA_ENABLED=false` и скрытой ссылке upload. Upload по прямому URL честен; витрина — нет. | `MangaHome.tsx` 172; `mangaOwn.ts` 12–13; `MangaUpload.tsx` 51–59 | S |
| A7-B09 | P3 | **robots.txt не ограничивает `/hentai*`.** `Allow: /manga`, Disallow только `upload`; `/hentai`, `/hentai-manga` индексируемы ботами по умолчанию. | `public/robots.txt` | S |
| A7-B10 | P3 | **AgeGate = self-attest в `localStorage`**, ключ общий на весь сайт; нет TTL, нет привязки к аккаунту, легко сбросить/подставить. Для RU/доверительной модели — только UX-барьер. | `AgeGateModal.tsx` 4–37 | M (продукт/legal) |
| A7-B11 | P3 | **SEO meta до/поверх gate.** `usePageMeta` на MangaPage/Hentai* ставит adult title до подтверждения; каталоги рендерят 18+ header под модалкой (контент сетки скрыт — ок). | `MangaPage.tsx` 167–185; `HentaiCatalog` header vs shell | S |

## UX / продукт
| ID | Sev | Боль | Кому больно | Идея |
|---|---|---|---|---|
| A7-U01 | P1 | Раздел «Хентай Манга» выглядит рабочим, читать часто нельзя (B01) | adult-читатели | После AgeGate вызывать MD с `adult:true`; empty-state: «MD не отдал / нет перевода», не «глав нет» в общем виде |
| A7-U02 | P1 | Несовершеннолетний / случайный deep-link в главу 18+ без модалки | trust & safety | Gate в `MangaReader` (и опционально до paint страниц) |
| A7-U03 | P2 | Читалка сильная (лента/страницы/RTL/saver/offline), бар плотный на мобайле | мобильные | Свернуть secondary controls в меню «⋯»; оставить back + chapter + page mode |
| A7-U04 | P2 | Нет поиска/видов на `/hentai-manga` (только sort) vs богатый `/manga` | adult-манга | Минимум: search + kind (manga/doujin); не тащить весь MangaHome |
| A7-U05 | P2 | Anime↔manga мост хорош, но «Продолжить» прыгает в главу без контекста 18+ | франшизы с rx | Если `isAdultContent` — сначала `/manga/:id` (gate), потом continue |
| A7-U06 | P2 | Upload dead-end честный, но путь `/manga/:id/upload` всё ещё в sitemap-исключениях/ожиданиях переводчиков | translator teams | Одна ссылка в More/Changelog: «свои главы — когда будет object storage вне billing-блока РФ»; не обещать дату |
| A7-U07 | P3 | Офлайн-скачивание главы без UI управления хранилищем / квоты | power users | Экран «Скачанные главы» + удаление; сейчас только per-chapter toggle |
| A7-U08 | P3 | Пагинация hentai «Дальше» при ровно 24 — ок; нет номера страницы | browse | Показать «Стр. N» |

## Техдолг
| ID | Sev | Что | Где |
|---|---|---|---|
| A7-T01 | P1 | Флаг `adult` в mangadex API есть, UI его не прокидывает — мёртвый контракт | `mangadex.ts` ↔ MangaPage/Reader |
| A7-T02 | P2 | Dual path `/manga` vs `/hentai-manga` без `basename`/context — дубли роутов, hardcode prefix | `App.tsx`, reader/page links |
| A7-T03 | P2 | Own-manga стек полный (D1 schema + upload UI + worker), выключен флагом — риск «включить клиент без R2» | `OWN_MANGA_ENABLED` + `env.MANGA` |
| A7-T04 | P2 | Legacy Appwrite page URLs (`legacyMangaPageUrl`) рядом с Core `pageUrl` | `mangaOwn.ts` |
| A7-T05 | P3 | Hentai tag taxonomy декоративна (много slug без Shiki id) | `hentaiGenres.ts` |
| A7-T06 | P3 | E2E читалки/манги не покрывают adult/`adult:true`/AgeGate bypass | `tests/manga.spec.ts`, `manga-reader.spec.ts` |
| A7-T07 | P3 | MangaDex proxy = Worker cost (РФ блок) — adult-трафик удваивает риск квоты Free | `docs/worker-limit.md`; зона AGENT 8 |

## Идеи новых функций (зона)
| ID | Value | Зачем | Зависимости | Effort | Риск |
|---|---|---|---|---|---|
| A7-I01 | Высокий | Прокинуть `adult:true` после AgeGate + empty-states | только клиент | S | случайно открыть pornographic в обычном `/manga` без gate — нужен жёсткий порядок gate→fetch |
| A7-I02 | Высокий | Единый `useAdultGate(entity)` для Page/Reader/Player/Title | рефактор | M | регрессии watch |
| A7-I03 | Средний | Prefixed adult URLs сквозь карточку/читалку (`/hentai-manga/...`) | HentaiCard + basePath helper | M | дубль canonical SEO |
| A7-I04 | Средний | Object storage **не через CF R2 из РФ**: S3-совместимый хост с оплатой вне РФ / партнёрский CDN; Core уже умеет ключи страниц | billing, ToS, WAF | L | **не** «включить R2 на Paid в РФ»; отдельное ROI |
| A7-I05 | Средний | Library shelf «Читаю мангу» рядом с watching | Library AGENT 4 | M | prefs size |
| A7-I06 | Средний | Честный upload waitlist (mailto уже есть) + статус «R2 отложен» в Account для translator | labels | S | support load |
| A7-I07 | Низкий | Reader progress % / dual-page spread | UX polish | M | layout debt |
| A7-I08 | Низкий | `noindex` для `/hentai*` пока нет legal review | robots + meta | S | organic adult traffic ↓ |

## Быстрые победы (≤1–2 дня)
- **A7-B01:** в ReadBlock/Reader после `isAdultContent(m)` / AgeGate передавать `{ adult: true }` в `findMangadex` + `mergeChapters`.
- **A7-B02:** AgeGate в `MangaReader` (те же `isAdultContent` + `isAgeVerified`); страницы не грузить до unlock.
- **A7-B08:** убрать из copy `/manga` фразу про «загруженные к нам»; оставить MangaDex (+ «свои главы — позже»).
- **A7-B05/B03 (минимум):** `HentaiCard` → `/hentai/:id` и `/hentai-manga/:id`; helper `mangaBase(path)`.
- **A7-B07:** при ошибке API — error panel как на MangaHome, **без** FALLBACK грида (или явный «демо, API недоступен»).
- **A7-B04 (минимум):** теги без `shikiGenreId` не рендерить / disabled + title «скоро», чтобы не врать.
- **A7-U05:** FranchiseBridge continue → сначала title page, если adult.

## Не трогать / уже ок
- `OWN_MANGA_ENABLED = false` + Upload-экран про billing/R2 вне РФ — **честный** dead-end; не «чинить» включением R2 вслепую.
- Worker `env.MANGA` отсутствует → 503 на `/api/core/manga*` — согласовано с README.
- Основной каталог `/manga` с `censored: 'true'` и MD ratings без pornographic по умолчанию — правильный default для SFW витрины.
- Читалка: лента / по страницам / RTL / traffic saver / offline IDB / retry fallback на uploads.mangadex.org — сильный core UX.
- AgeGate на `MangaPage` / Hentai catalogs (сетка не грузится до unlock) — changelog-фиксы сохранены.
- FranchiseBridge anime↔manga как паттерн навигации — оставлять, чинить только adult continue.
- Не предлагать возврат Appwrite Storage как прод-путь для новых глав.
- Не предлагать Workers Paid / R2 «просто так» без ROI и решения billing-из-РФ.

## Вопросы к продакту
1. **Приоритет adult-манги:** чинить MD `adult:true` + gate в reader сейчас, или раздел `/hentai-manga` временно пометить «каталог карточек, чтение MD 18+ в разработке»?
2. **Изоляция URL:** жёстко держать `/hentai` и `/hentai-manga` prefixes везде, или достаточно AgeGate на общих `/anime`/`/manga`?
3. **R2 / own chapters:** ждём возможность оплатить CF вне РФ, ищем альтернативный S3, или навсегда MangaDex-only + честный copy?
4. **Индексация 18+:** `noindex`/`Disallow` для `/hentai*` или наоборот SEO-трафик?
5. **Теги без Shiki id:** выпилить, маппить на студии/ключевые слова локально, или ждать другой источник метаданных?
6. **AgeGate strength:** оставляем self-attest, или нужен более жёсткий legal UX (повторный ask раз в N дней, копирайт 152-ФЗ/информации для родителей)?
