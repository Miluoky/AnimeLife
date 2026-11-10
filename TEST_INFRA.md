# AnimeLife E2E Testing Infrastructure (Tier 1–4)

## 1. Overview & Architecture

The AnimeLife end-to-end testing infrastructure is built with **Playwright Test** (`@playwright/test`), executing hermetic, requirement-driven opaque-box browser tests against the Vite production preview build (`npm run preview`).

### Key Architectural Tenets
1. **Zero External Flakiness**: External services (Shikimori, AnimeLife Core `/api/core`, AniLibria, stream CDNs, analytics) are intercepted via Playwright `page.route` and fixtures (`tests/mocks.ts`, `tests/fixtures/`). Legacy Appwrite URLs are guarded to fail fast if touched.
2. **Dual Viewport Target Matrices**:
   - **Desktop**: Chromium Desktop (`Desktop Chrome`, 1280×720 viewport, mouse/keyboard events).
   - **Mobile**: Mobile Chrome (`Pixel 7`, 393×851 viewport, touch-enabled, mobile bottom dock and sheets).
3. **Port Isolation**: Configured with `PW_PORT` (default `4173`), enabling concurrent isolated runs across independent agent runners and CI pipelines.
4. **Realistic Media Playback**: HTML5 Media capabilities are mocked using local webm video fixtures (`tests/fixtures/clip.webm`) simulating native HLS/MP4 playback without external video CDN bandwidth dependencies.

---

## 2. 4-Tier Test Design Methodology

The E2E suite follows the systematic 4-tier testing hierarchy specified in the project governance requirements:

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 4: Real-World Scenarios (Full Visitor Journeys)        │
├─────────────────────────────────────────────────────────────┤
│ Tier 3: Cross-Feature Combinations & State Transitions      │
├─────────────────────────────────────────────────────────────┤
│ Tier 2: Boundary Conditions, Extremes & Resilience          │
├─────────────────────────────────────────────────────────────┤
│ Tier 1: Feature Coverage (5 Primary Feature Areas)          │
└─────────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage (>= 5 test cases per area)
- **UI Navigation (`tier1-ui-navigation.spec.ts`)**:
  - `desktop header primary navigation routes (Home, Catalog, Schedule, Community, MyList)`
  - `mobile bottom dock navigation and more sheet drawer interaction`
  - `search shortcut Ctrl+K focuses search on desktop or opens search drawer on mobile`
  - `sticky header hides on scroll down and reveals on scroll up`
  - `404 not found page renders friendly error and returns home`
  - `theme and accent customization persists in storage and across reload`
- **Player Controls (`tier1-player-controls.spec.ts`)**:
  - `video player mounts native video element with AniLibria stream`
  - `episode navigation highlights active episode and switches episode on click`
  - `playback controls toggle play and pause state`
  - `playback speed menu alters video playbackRate and displays HUD feedback`
  - `keyboard hotkeys toggle play/pause, mute, and speed step`
  - `playback time position persists across navigation`
- **Search & Catalog (`tier1-search-catalog.spec.ts`)**:
  - `catalog search query updates page title and heading`
  - `search redirect /search?q=query normalizes to /catalog?q=query`
  - `catalog sorting filter selection updates URL query parameter`
  - `reset search button clears active query and restores default catalog`
  - `catalog card grid renders responsive cards with titles and links to title pages`
  - `status filter chips select status and update URL parameter`
- **Profile & Community (`tier1-profile-community.spec.ts`)**:
  - `community top-3 podium renders viewer rankings with calculated stats and leader crown`
  - `community section navigation tabs switch panels and update URL query`
  - `profile customizer frame and appearance styling configuration`
  - `profile wall renders comments with author details and timestamps`
  - `profile wall allows submitting a new comment and toggling like`
  - `unauthenticated guest sees sign-in encouragement on community feed`
- **SEO & Meta (`tier1-seo-meta.spec.ts`)**:
  - `document title updates dynamically across SPA navigation`
  - `meta description tag exists and synchronizes with current route`
  - `canonical link element reflects absolute canonical URL`
  - `OpenGraph metadata tags are present in DOM`
  - `Twitter card meta tag is correctly defined`
  - `robots meta directive specifies search crawler parameters`

### Tier 2: Boundary & Corner Cases (`tier2-boundary-corner.spec.ts`)
- `empty search results show helpful suggestions without crashing`
- `invalid and out-of-bound page parameters normalize safely`
- `narrow mobile viewport (320px) maintains layout integrity with zero horizontal scroll`
- `stream failover when episode is unavailable displays notice and trailer fallback`
- `adversarial input strings in search input are escaped properly without XSS execution`

### Tier 3: Cross-Feature Combinations (`tier3-cross-feature.spec.ts`)
- `catalog search -> select anime -> view title details -> open episode in player`
- `profile customization -> navigate to community -> verify style and podium cards`
- `add to watchlist on title page -> verify in MyList -> launch directly from MyList`
- `search redirect -> catalog filter -> navigation to collections`

### Tier 4: Real-World Scenarios (`tier4-real-world.spec.ts`)
- `end-to-end visitor journey: home hero -> catalog discovery -> title details -> player experience`
- `community and social journey: leaderboard podium -> profile wall -> clubs -> chat`

---

## 3. File Inventory & Test Layout

All new M7 E2E tests reside under `tests/e2e/`:

| File | Tier | Coverage Scope | Test Count |
|---|---|---|---|
| `tests/e2e/tier1-ui-navigation.spec.ts` | Tier 1 | Header, dock, 404, sticky header, theme | 6 |
| `tests/e2e/tier1-player-controls.spec.ts` | Tier 1 | Video element, episodes, controls, speed, hotkeys, position | 6 |
| `tests/e2e/tier1-search-catalog.spec.ts` | Tier 1 | Query, redirect, sort, reset, card grid, status | 6 |
| `tests/e2e/tier1-profile-community.spec.ts` | Tier 1 | Podium, tabs, customizer, wall comments, likes, guest notice | 6 |
| `tests/e2e/tier1-seo-meta.spec.ts` | Tier 1 | Title, description, canonical link, OpenGraph, Twitter, robots | 6 |
| `tests/e2e/tier2-boundary-corner.spec.ts` | Tier 2 | Empty query, page bounds, 320px viewport, stream fallback, XSS safety | 5 |
| `tests/e2e/tier3-cross-feature.spec.ts` | Tier 3 | Multi-step user flows across modules | 4 |
| `tests/e2e/tier4-real-world.spec.ts` | Tier 4 | Complete visitor and social journeys | 2 |

Total Test Cases: **41 distinct test specifications** across desktop and mobile profiles (**82 test instances**).

---

## 4. Runner Commands & Verification

### Running the E2E Test Suite
Ensure the preview build is compiled:
```bash
npm run build
```

Run all E2E tests:
```bash
npx playwright test tests/e2e/
```

Run a specific tier or spec:
```bash
npx playwright test tests/e2e/tier1-ui-navigation.spec.ts
npx playwright test tests/e2e/tier2-boundary-corner.spec.ts
```

Run tests on a specific browser project:
```bash
# Desktop only:
npx playwright test tests/e2e/ --project=desktop

# Phone (Pixel 7) only:
npx playwright test tests/e2e/ --project=phone
```

Run with interactive UI:
```bash
npx playwright test tests/e2e/ --ui
```

Debug mode:
```bash
npx playwright test tests/e2e/ --debug
```
