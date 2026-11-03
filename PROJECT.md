# Project: AnimeLife 2.0 Autonomous Engineering

## Architecture
AnimeLife 2.0 is an enterprise anime streaming, SEO, and community ecosystem built on Preact, Vite, modular CSS design system, Cloudflare Workers (Edge SSR, modular sitemaps, Yandex Turbo RSS, stream proxies), and Appwrite Cloud.

The AnimeLife 2.0 release is structured into 4 operational divisions + QA:
1. **Division I: SEO Dominance & LF/MF Key Intent Matrix (Agents 01–04)**:
   Dynamic matrix of low-frequency and mid-frequency keywords, landing pages for voice dubbing studios (`/voice/:studio_slug`), interactive franchise watch order timeline (`/chronology/:id`), and 150+ categorized anime tropes (`/trope/:slug`).
2. **Division II: Indexing Automation, Cloudflare Edge & Schema.org (Agents 05–07)**:
   Unified Schema.org JSON-LD `@graph` (`SeoMeta.tsx` covering `TVSeries`, `TVEpisode`, `VideoObject`, `BreadcrumbList`, `FAQPage`, `AggregateRating`), automated Google Indexing API + Yandex IndexNow (10,000 URLs/day batching), and Cloudflare Worker Edge SSR and modular sitemaps.
3. **Division III: Unified Design System, Responsive Ergonomics & Media (Agents 08–12)**:
   Harmonized Dark Anime design tokens in pure CSS (<10KB gzip budget; zero heavy JS animation libraries), mobile ergonomics (360px–430px, tap targets ≥44px, safe-area iOS, sheet swipe gestures, 0 horizontal scroll), desktop/4K grids (3 to 7 columns), GPU-composited CSS transitions, and `OptimizedImage.tsx` (WebP, blur-up, styled fallback).
4. **Division IV: Resilient Player, Retention & Social Sharing (Agents 13–14)**:
   Fast 3.5s auto-fallback ladder (Kodik -> Alloha -> AniLibria -> AnimeVost -> DreamCast -> Sibnet), exact playback second resume in LocalStorage, auto-skip intro, `ShareModal.tsx` (Telegram & VK cards, QR code), `WatchStreak.tsx`, and season watch progress.
5. **Division V / QA: Quality Control, Bundle Budget & Production Release (Agent 15)**:
   Bundle enforcement (<40KB JS chunks, <10KB CSS), zero TypeScript errors (`tsc -b`), 71/71 community tests, `.gitignore` secret protection, and production build readiness.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | LF/MF Key Intent Matrix | Pure functions for dynamic title, description, H1-H3, breadcrumbs with strict length truncation in `src/utils/seoTemplates.ts` | M1 | Survey Div I |
| 2 | Semantic Clusters & Cross-linking | Cluster mesh mapping anime genres, themes, and studios to high-converting search queries in `src/data/semanticClusters.ts` | M1 | Survey Div I |
| 3 | Voiceover Studio Landing Pages | Filterable catalog and dedicated landing page at `/voice/:studio_slug` in `src/pages/VoiceStudioPage.tsx` and `src/components/VoiceoverFilter.tsx` | M1 | Survey Div I |
| 4 | Franchise Chronology Timeline | Curated watch order for complex anime franchises in `src/data/franchises.ts`, interactive timeline in `src/components/FranchiseTimeline.tsx`, and `/chronology/:id` page in `src/pages/ChronologyPage.tsx` | M1 | Survey Div I |
| 5 | 150+ Tropes & Micro-genres | Comprehensive dataset of 150+ anime tropes in `src/data/animeTropes.ts` and catalog page with canonical URLs in `src/pages/TropeCollectionPage.tsx` | M1 | Survey Div I |
| 6 | Dynamic Route Registration | Lazy route definitions in `src/App.tsx` and prefetch chunks in `src/api/prefetch.ts` ensuring code-splitting under 40KB | M1 | Survey Div I |
| 7 | Unified Schema.org Component | Multi-schema `@graph` manager in `src/components/SeoMeta.tsx` managing `TVSeries`, `Movie`, `TVEpisode`, `VideoObject`, `BreadcrumbList`, `FAQPage`, `AggregateRating` without script collisions | M2 | Survey Div II |
| 8 | Structured Data Integration | Integrate `SeoMeta.tsx` into `src/pages/TitlePage.tsx` and `src/pages/Player.tsx` providing complete search engine rich snippets | M2 | Survey Div II |
| 9 | Yandex IndexNow 10,000 Batching | Upgrade `scripts/seo_ops/yandex_indexnow_push.py` to collect up to 10,000 URLs across catalog, tropes, studios, and chronologies | M2 | Survey Div II |
| 10 | CI/CD Secret Deployment | Update `.github/workflows/seo-daily-indexing.yml` to safely unpack `.yandex_token` from GitHub repository secrets without exposing keys | M2 | Survey Div II |
| 11 | Cloudflare Edge SSR Expansion | Update `ROUTES` and `metaFor` in `worker/index.js` to render OpenGraph/Twitter cards for `/voice/*`, `/chronology/*`, `/trope/*` | M2 | Survey Div II |
| 12 | Modular Sitemaps & Turbo RSS | Add `sitemap-voices.xml`, `sitemap-chronology.xml`, `sitemap-tropes.xml` to `worker/index.js` and add Yandex Turbo RSS namespace | M2 | Survey Div II |
| 13 | Dark Anime Design System Tokens | Harmonize design tokens (`--radius-*`, `--glass-*`, color scales) in `src/styles.css` without adding heavy Tailwind dependencies | M3 | Survey Div III |
| 14 | Mobile Ergonomics (360px–430px) | Expand touch targets (`.btn--small`, `.chip`, `.pill`) to ≥44px, add iOS safe-area handling, and set `overflow-x: clip` for 0 horizontal scroll | M3 | Survey Div III |
| 15 | Native Sheet Swipe Gesture | Add touch drag / swipe-to-dismiss gesture handling in `src/components/MoreSheet.tsx` | M3 | Survey Div III |
| 16 | Desktop/4K Grids & Sticky Sidebars | Add 1920px and 2560px media queries scaling poster grids from 3 to 7 columns, ensure sticky sidebars maintain CLS = 0 | M3 | Survey Div III |
| 17 | Pure CSS GPU Micro-Animations | Upgrade skeleton shimmer to GPU `transform: translateX()`, card hover to `scale(1.03)` + glow shadow, active episode chip continuous pulse/glow | M3 | Survey Div III |
| 18 | Optimized Image Component | Create `src/components/OptimizedImage.tsx` with WebP `<picture>`, blur-up preview, and styled SVG fallback for broken posters | M3 | Survey Div III |
| 19 | Harmonized Buffering Experience | Refactor `src/components/BufferTrivia.tsx` to use design tokens and ensure smooth display during player buffering | M3 | Survey Div III |
| 20 | 3.5s Multi-Balancer Fallback Ladder | Unify failover timeout to 3.5s across iframe and native streams in `VideoPlayer.tsx` and `Player.tsx` following Kodik -> Alloha -> AniLibria -> AnimeVost -> DreamCast -> Sibnet | M4 | Survey Div IV |
| 21 | Exact Playback Second Continuity | Ensure exact second persistence in LocalStorage (`anime.positions.v1` / `carry` ref) and instant resume upon provider switch or direct timestamp link | M4 | Survey Div IV |
| 22 | Telegram & VK Social Share Modal | Create `src/components/ShareModal.tsx` using existing `qrcode-generator` with instant Telegram and VK sharing links and timestamp copy | M4 | Survey Div IV |
| 23 | Watch Streak & Season Progress | Create `src/components/WatchStreak.tsx` displaying real viewing streaks and add aggregated season episode watching progress | M4 | Survey Div IV |
| 24 | Quality Control & Bundle Budget | Verify all JS chunks < 40KB gzip, all CSS files < 10KB gzip (`npm run size`), zero TypeScript errors (`tsc -b`), 71/71 tests passing | M5 | QA / Agent 15 |
| 25 | Git Secret Protection & Build | Ensure `service_account.json`, `.yandex_token`, `.env*` and Appwrite keys are strictly in `.gitignore`, and validate `npm run build` exits 0 | M5 | QA / Agent 15 |
| 26 | Adversarial Stress Verification | Adversarial stress testing (Tier 5) on stream failover, mobile swipe, and Edge sitemaps | M6 | Challenger |
| 27 | Forensic Integrity Audit | Static and runtime code integrity audit verifying zero hardcoded test facades, authentic logic, and rule compliance | M6 | Auditor |

---

## Milestones

| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| M1 | Division I: SEO Dominance & LF/MF Key Intent Matrix | Features 1, 2, 3, 4, 5, 6 (`seoTemplates.ts`, `semanticClusters.ts`, `VoiceStudioPage.tsx`, `VoiceoverFilter.tsx`, `FranchiseTimeline.tsx`, `franchises.ts`, `ChronologyPage.tsx`, `animeTropes.ts`, `TropeCollectionPage.tsx`, `App.tsx`) | none | COMPLETED | SEO templates, studio landings, chronology timeline, 150+ tropes, lazy routes |
| M2 | Division II: Indexing, Cloudflare Edge & Microdata | Features 7, 8, 9, 10, 11, 12 (`SeoMeta.tsx`, `TitlePage.tsx`, `Player.tsx`, `yandex_indexnow_push.py`, `seo-daily-indexing.yml`, `worker/index.js`) | none | COMPLETED | SeoMeta @graph, 10k IndexNow push, GitHub secrets, Edge SSR for new routes, sitemaps, Turbo RSS |
| M3 | Division III: Design, Ergonomics, CSS Animations & Media | Features 13, 14, 15, 16, 17, 18, 19 (`styles.css`, `MoreSheet.tsx`, `OptimizedImage.tsx`, `BufferTrivia.tsx`, hover/pulse/shimmer CSS) | none | COMPLETED | Dark Anime tokens, ≥44px touch targets, sheet swipe, 4K 7-col grid, GPU animations, OptimizedImage |
| M4 | Division IV: Player, Retention & Social Sharing | Features 20, 21, 22, 23 (`VideoPlayer.tsx`, `Player.tsx`, `ShareModal.tsx`, `WatchStreak.tsx`, season progress) | none | COMPLETED | 3.5s auto-fallback ladder, exact second resume, ShareModal (TG/VK/QR), WatchStreak |
| M5 | Division V: QA Control, Bundle Budget & Production Build | Features 24, 25 (`npm run size`, `tsc -b`, `npm run test:community`, `.gitignore`, `npm run build`) | M1-M4 | COMPLETED | All JS <40KB, CSS <10KB, 0 TS errors, 71/71 tests, clean secrets, validated prod build |
| M6 | Adversarial Hardening & Forensic Integrity Audit | Features 26, 27 (Challenger stress suite, Auditor zero-tolerance integrity check) | M5 | COMPLETED | Challenger APPROVE, Auditor CLEAN |

---

## Code Layout

- `src/utils/`: Utility functions (e.g., `seoTemplates.ts`).
- `src/data/`: Data models, static datasets (`semanticClusters.ts`, `franchises.ts`, `animeTropes.ts`).
- `src/components/`: Modular UI components (`SeoMeta.tsx`, `VoiceoverFilter.tsx`, `FranchiseTimeline.tsx`, `OptimizedImage.tsx`, `ShareModal.tsx`, `WatchStreak.tsx`).
- `src/pages/`: Code-split page components (`VoiceStudioPage.tsx`, `ChronologyPage.tsx`, `TropeCollectionPage.tsx`).
- `scripts/seo_ops/`: Daily indexing scripts (`daily_quota_indexer.py`, `yandex_indexnow_push.py`).
- `.github/workflows/`: CI/CD automation (`seo-daily-indexing.yml`).
- `worker/`: Cloudflare Worker Edge code (`index.js`).
