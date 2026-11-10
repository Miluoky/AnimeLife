# AGENT 10 — Meta / Roadmap synthesis

**Дата:** 2026-11-10  
**Артефакт:** [`docs/DEVELOPMENT_MAP.md`](../DEVELOPMENT_MAP.md)  
**Ограничения:** `src/` не правился; коммита нет; audit 01–09 прочитаны целиком и дедуплицированы.

---

## Scope
- Product/strategy срез: позиционирование, ICP, north-star, конкуренты, Free CF + Core.
- Слияние находок AGENT 1–9 в единые P0–P3, зрелость модулей, зависимости, метрики, «не делаем».
- Не дублировать полные таблицы багов — только кластеры и трассировка ID.

---

## Метод дедупликации

| Кластер в карте | Слили из |
|---|---|
| SEO JSON-LD integrity | 02 P0 FAQ/rating; пересечение worker vs SPA |
| Legal Core honesty | 09 T09-01/02; 05 export/delete подтверждение |
| Quota / WAF SPOF | 08 P8-01/02; 07 T07 Worker MD; PERF_WATCH |
| Adult path isolation | 03 hentai watchBase; 07 hentai-manga prefixes + reader gate |
| List sync trust | 04 merge/autoSync/watched; 05 Shiki OAuth edge |
| Social funnel empty | 06 public+invite; 01 Discover без Together |
| Soft-200 landings | 02 chronology/trope/voice; SEO thin |
| Fake social proof | 05 /u metrics; 02 AggregateRating fallbacks |
| Age gate soft + bypass | 07 reader; 03/09 soft attest — один принцип: gate до контента |
| RoomDO / Paid | 06 + 08 + rooms-do — **optional ROI only** |
| Appwrite leftovers | 05/08/09 tests, privacy, source-health — чистить, не revive |

Конфликты severity разруливались вверх (trust/SEO/quota > polish). Effort оставлен как в исходных аудитах (S/M/L).

---

## Независимый product вердикт (AGENT 10)

AnimeLife уже **шире MVP смотрелки**: есть витрина, плеер, библиотека, Core, SEO, Together, манга, модерация. Узкое место роста — не «нехватка фич», а **дыры честности и воронок**: JSON-LD/privacy врут или ломаются; список/Shiki рассинхрон; adult/social URL-воронки протекают; Free Worker остаётся единственным жёстким потолком.

Стратегия на квартал: **Trust + Sync + Funnel на Free**, затем optional Paid/R2.

---

## Open questions (сведены; продукту решить)

1. Themes `/theme/*` — product filter или SEO-only?  
2. Adult URL: жёсткий `/hentai*` prefix везде или gate на общих путях?  
3. Together public default on vs opt-in?  
4. Email recovery / Google·Yandex — этот квартал или явный «нет»?  
5. Shiki delete rates при локальном удалении?  
6. Streak = open vs onEnded?  
7. AggregateRating когда-либо по своим отзывам?  
8. Workers Paid / RoomDO — только после 7d median invocations post-WAF?  
9. Own manga: ждать CF billing вне РФ vs внешний S3 vs навсегда MD-only?  
10. `/hentai*` index vs noindex?

---

## Что влито / покрытие

| Audit | Влит |
|---|---|
| 01–09 | да, полностью |
| PERF_WATCH / worker-limit / rooms-do / Core README | да, как constraints |
| PENDING | нет — все 01–09 были на диске к моменту синтеза |

---

## Не трогать (meta)

- Core-only, perf watch defaults, WAF ≤5 budget, RoomDO commented, OWN_MANGA off.  
- Не раздувать DEVELOPMENT_MAP повторными полными bug-tables — детали остаются в 01–09.
