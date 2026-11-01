# Project: AnimeLife Full Autonomous Polish & Expansion

## Architecture
AnimeLife (`https://animelife.top`) is a high-performance modern anime streaming and community platform built with Preact, Vite, Tailwind/CSS custom design system, Cloudflare Workers (SSR, bot metadata, edge caching, stream proxying), and Appwrite Cloud (auth, profiles, community clubs, real-time chat, and social features).

### Core Components
1. **Frontend SPA (`src/`)**: Preact + Vite SPA with custom router, dynamic page imports, rich player controls, and Senku profile design system.
2. **Cloudflare Edge Worker (`worker/index.js`, `worker/sibnetProxy.js`)**: Edge SSR for search bots/crawlers, dynamic OpenGraph/Twitter cards, JSON-LD microdata, sitemap index, and Range-forwarded Sibnet stream proxy.
3. **Appwrite Cloud Backend (`functions/community/src/`)**: Serverless microservices for social feed, following, clubs, episode ratings, moderation, and community wall.
4. **Verification & Testing (`tests/`, `functions/community/test/`)**: Playwright E2E suite and Node test runner for community functions.

---

## Feature Inventory
Every feature identified during Phase 0 Survey mapped to its assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Rollup code-splitting for router | Split `@remix-run/router` and `react-router` into `router-*.js` to drop `index-*.js` from 45.7KB to < 30KB gzip | M1 | Survey 1 (R2) |
| 2 | Lazy-loading root Home page | Lazy-load `Home.tsx` in `src/App.tsx` to reduce initial index chunk to ~18KB gzip | M1 | Survey 1 (R2) |
| 3 | Page-specific CSS extraction | Extract TitlePage, Catalog, Account, Reviews styles from `styles.css` to drop `index-*.css` from 9.8KB to ~5.8KB gzip | M1 | Survey 1 (R2) |
| 4 | Automated size budget enforcement | Set `BUDGET_KB.main = 40` in `scripts/check-size.mjs` ensuring all JS chunks < 40KB gzip | M1 | Survey 1 (R2) |
| 5 | Mobile Top-3 Podium ordering | Fix inverted mobile podium in `profile-extras.css` so 1st place renders above 2nd place on screens < 860px | M2 | Survey 1 (R1) |
| 6 | Responsive ProfileWall scroll | Replace hardcoded `window.scrollTo({ top: 300 })` with ref-based `formRef.current?.scrollIntoView()` | M2 | Survey 1 (R1) |
| 7 | Layout listener thrashing fix | Add missing `[menuOpen]` dependency array to `useEffect` in `Layout.tsx:79` | M2 | Survey 1 (R1) |
| 8 | Mobile tap highlight polish | Add `-webkit-tap-highlight-color: transparent` to clickable cards and buttons | M2 | Survey 1 (R1) |
| 9 | Sticky header anchor scroll-margin | Ensure all targetable section anchors have `scroll-margin-top` to avoid header overlap | M2 | Survey 1 (R1) |
| 10 | Client-side OpenGraph synchronization | Update `usePageMeta` in `src/data/pageMeta.ts` to synchronize `og:*` and `twitter:*` meta tags on SPA navigation | M3 | Survey 2 (R3) |
| 11 | Client canonical URL consistency | Align `useCanonical` regex in `src/data/pageMeta.ts` with worker (`theme`, `best`, `studio`) | M3 | Survey 2 (R3) |
| 12 | Dynamic client JSON-LD helper | Add `useJsonLd` helper in `src/data/pageMeta.ts` for dynamic structured data injection | M3 | Survey 2 (R3) |
| 13 | Static sitemap fallback | Create `public/sitemap.xml` pointing to sitemap index and core sections | M3 | Survey 2 (R3) |
| 14 | Robots.txt route hardening | Disallow `/c/*/edit` and `/manga/*/upload` in `public/robots.txt` | M3 | Survey 2 (R3) |
| 15 | Appwrite ProfileWall backend persistence | Implement `profile_wall` collection and handlers in `functions/community/src/social.js` (`wall-post`, `wall-delete`, `wall-like`) | M4 | Survey 2 (R4) |
| 16 | ProfileWall client integration | Refactor `ProfileWall.tsx` to read/write from Appwrite with offline fallback, removing fake mock seed | M4 | Survey 2 (R4) |
| 17 | Community top-3 pedestal stat calculation | Fix `Community.tsx:155-164` to calculate weekly/monthly episodes from XP instead of showing lifetime episodes | M4 | Survey 2 (R4) |
| 18 | Senku Profile customizer live preview | Add dedicated visual preview card and validation in `ProfileExtras.tsx` | M4 | Survey 2 (R4) |
| 19 | VideoPlayer `isOwnProvider` type guard fix | Include `'dreamcast'` and `'sibnet'` in `isOwnProvider` (`VideoPlayer.tsx:149-150`) to mount native `<video>` | M5 | Survey 3 (R5) |
| 20 | Dream Cast voice registration | Wire `free.value.dreamCast` into `buildVoices` in `Player.tsx:89-99, 652-689` to make Dream Cast selectable in UI | M5 | Survey 3 (R5) |
| 21 | Sibnet Direct vs Embed resolution | Render native `<video>` when `embed && isSibnetUrl(embed.url)` instead of dual iframe + controls | M5 | Survey 3 (R5) |
| 22 | HLS error recovery & retry | Implement `Hls.Events.ERROR` recovery (`startLoad`, `recoverMediaError`) and add native player retry button | M5 | Survey 3 (R5) |
| 23 | Sibnet proxy OPTIONS preflight & HEAD | Add OPTIONS preflight (204) and HEAD optimization in `worker/sibnetProxy.js` | M5 | Survey 3 (R5) |
| 24 | Cloud-synced watch position resume | Sync recent episode playback positions in `SyncedPrefs` (`src/data/auth.ts`, `positions.ts`) for cross-device resume | M6 | Survey 3 (R6) |
| 25 | Player volume & navigation hotkeys | Add `ArrowUp` / `ArrowDown` volume control with HUD feedback and `P` / `Shift+N` for previous episode | M6 | Survey 3 (R6) |
| 26 | Long-running series episode quick-jump | Add quick episode number jump and "Jump to next unwatched" in `Player.tsx` | M6 | Survey 3 (R6) |
| 27 | E2E Testing Suite (Tiers 1-4) | Systematic test cases covering features, boundaries, combinations, and real-world workflows | M7 | E2E Track |
| 28 | Deployment pipeline & validation | Validate Cloudflare Worker and Appwrite deployment configurations for https://animelife.top | M8 | Survey 3 (R7) |
| 29 | Adversarial stress testing (Tier 5) | White-box adversarial testing, edge cases, and resilience validation | M9 | QA / Hardening |
| 30 | Forensic integrity audit | Code integrity verification, facade prevention, and full compliance audit | M10 | Audit |

---

## Milestones

| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| M1 | Bundle Size & Code-Splitting | Features 1, 2, 3, 4 (`vite.config.ts`, `src/App.tsx`, `scripts/check-size.mjs`, CSS extraction) | none | DONE | `index-*.js` 26.5KB gzip (<40KB budget), `index-*.css` 8.9KB (<10KB) |
| M2 | UI Polish & Mobile Adaptivity | Features 5, 6, 7, 8, 9 (`profile-extras.css`, `Layout.tsx`, `ProfileWall.tsx`, `styles.css`) | M1 | DONE | Mobile podium CSS cascade order, smooth scroll, Layout effect cleanup, tap highlights |
| M3 | SEO & SMM Enhancements | Features 10, 11, 12, 13, 14 (`pageMeta.ts`, `robots.txt`, `public/sitemap.xml`) | none | DONE | SPA OG/Twitter sync, canonical regex parity, useJsonLd helper, static sitemap fallback |
| M4 | Social, Profile & Community | Features 15, 16, 17, 18 (`ProfileWall.tsx`, `Community.tsx`, `functions/community/src/social.js`) | none | DONE | ProfileWall Appwrite backend persistence, top-3 pedestal stat calculation fix, Senku preview card |
| M5 | Streaming & Player Resilience | Features 19, 20, 21, 22, 23 (`VideoPlayer.tsx`, `Player.tsx`, `worker/sibnetProxy.js`) | none | DONE | Dream Cast & Sibnet native player unblocked, HLS recovery, retry button, proxy preflight |
| M6 | New Features & UX Improvements | Features 24, 25, 26 (`auth.ts`, `positions.ts`, `PlayerControls.tsx`, `Player.tsx`) | M5 | DONE | Cloud-synced watch positions (top 20), volume HUD hotkeys, previous episode, quick jump |
| M7 | E2E Testing Track | Feature 27 (`TEST_INFRA.md`, `tests/e2e/`, `TEST_READY.md`) | none | DONE | 4-tier Playwright E2E suite (82 instances, 78 passed, 0 failed, TEST_READY.md) |
| M8 | Deployment Preparation | Feature 28 (Deploy verification scripts, CF worker & Appwrite deployment checks) | M1-M6 | DONE | Dream Cast test mocks, deployment-readiness.mjs passed 6/6 suites |
| M9 | Adversarial Stress Testing | Feature 29 (White-box adversarial tests, stream failover, load resilience) | M7, M8 | DONE | Tier 5 adversarial suite (20 specs, 17 passed, 0 failed), Challenger APPROVE |
| M10 | Forensic Integrity Audit | Feature 30 (Full forensic integrity audit, zero tolerance verification) | M9 | DONE | Auditor verdict CLEAN (0 violations, 0 facades, authentic implementations) |

---

## Interface Contracts & Shared Data

### ProfileWall Appwrite Contract
```ts
interface ProfileWallRow {
  $id?: string
  profileId: string      // User ID whose wall this belongs to
  authorId: string       // User ID who authored the comment
  authorName: string     // Display nickname
  avatarUrl?: string     // Custom avatar or Shikimori avatar
  frame?: string         // Senku frame ID
  text: string           // Sanitized comment text (max 500 chars)
  at: string             // ISO timestamp
  likes: number          // Like count
  replyTo?: string       // Optional parent comment ID or author name
  hidden?: boolean       // Moderation hidden flag
}
```

### Video Player Stream Contract
```ts
export type OwnProvider = 'anilibria' | 'animevost' | 'dreamcast' | 'sibnet'
export function isOwnProvider(provider: Provider | undefined): provider is OwnProvider {
  return provider === 'anilibria' || provider === 'animevost' || provider === 'dreamcast' || provider === 'sibnet'
}
```

### Cloud Watch Positions Contract
```ts
interface SyncedPlaybackPosition {
  animeId: number
  episode: number
  t: number              // Current time in seconds
  d: number              // Duration in seconds
  at: number             // Updated timestamp (ms)
}
// Merged into SyncedPrefs.positions in src/data/auth.ts (max 20 most recent entries)
```

---

## Code Layout & Write Boundaries

To guarantee zero file conflicts during parallel worker execution:
- **M1 (Optimization)**: Owns `vite.config.ts`, `scripts/check-size.mjs`, `src/App.tsx`, `src/pages/title.css`, `src/pages/catalog.css`, `src/pages/account.css`, `src/components/reviews.css`.
- **M2 (UI Polish)**: Owns `src/components/profile-extras.css`, `src/components/Layout.tsx`, `src/styles.css` (only responsive fixes and utility classes).
- **M3 (SEO & SMM)**: Owns `src/data/pageMeta.ts`, `public/robots.txt`, `public/sitemap.xml`.
- **M4 (Social & Community)**: Owns `src/components/ProfileWall.tsx`, `src/data/profileWall.ts`, `src/pages/Community.tsx`, `src/components/ProfileExtras.tsx`, `functions/community/src/social.js`, `functions/community/test/wall.test.js`.
- **M5 (Streaming & Player)**: Owns `src/components/VideoPlayer.tsx`, `src/pages/Player.tsx` (player stream wiring), `worker/sibnetProxy.js`.
- **M6 (New Features)**: Owns `src/data/positions.ts`, `src/data/auth.ts` (positions sync), `src/components/PlayerControls.tsx` (hotkeys & volume HUD).
- **M7 (E2E Testing)**: Owns `TEST_INFRA.md`, `tests/e2e/**`, `TEST_READY.md`.
- **M8 (Deployment)**: Owns deployment validation scripts and wrangler / Appwrite checks.
- **M9 & M10 (Challenger & Auditor)**: Owns verification harnesses and audit reports in `.agents/teamwork/`.
