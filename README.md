# Form:at

Website for Form:at — a techno collective based in Glasgow.

Live at [formatglasgow.com](https://formatglasgow.com)

---

## Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start v1 (React, SSR) |
| Styling | Tailwind CSS v4 |
| State | Zustand with localStorage persistence |
| Audio | HTML5 Audio + Media Session API |
| PWA / offline | Workbox service worker — installable, offline audio via IndexedDB, background updates |
| Hosting | Cloudflare Pages |
| Audio files | Cloudflare R2, served via the custom domain `cdn.formatglasgow.com` |
| Analytics DB | Cloudflare D1 (SQLite) |
| Web analytics | Cloudflare Web Analytics (auto-injected) |

---

## Development

```bash
pnpm install       # install all workspaces
pnpm dev           # start dev server (generates routeTree.gen.ts on first run)
pnpm build         # production build
pnpm check         # Biome lint + format, auto-fixing, across the whole repo, then typecheck every workspace
pnpm lint          # Biome check only (reports, doesn't fix) — same check CI's `static` job runs per-workspace
pnpm tsc           # typecheck every workspace only, no lint/format
pnpm format        # Biome format only, auto-fixing, no lint rules or typecheck
pnpm knip          # find unused files/exports/dependencies across the monorepo
```

`lint`/`tsc`/`build`/`dev` are thin Turbo wrappers at the root — they fan
out to every workspace (`@form-at/web` today; future apps in `apps/` pick
this up for free). `check` is the one exception: it runs Biome directly
over the whole repo (not per-workspace) before calling `turbo tsc`. Run a
single workspace directly with `pnpm -C apps/web <script>` when you don't
want the others.

### Scripts (apps/web)

All of these run from `apps/web/` — either `cd apps/web` first, or prefix
each with `pnpm -C apps/web` from the repo root.

| Command | What it does |
|---|---|
| `start` | Serve the production build (port 4173) — the only way to test PWA/service-worker behaviour, see below |
| `send-push -- --title "..." --body "..."` | Send a push notification to subscribed devices |
| `optimize-images` | Convert `images-source/` originals into responsive AVIF/WebP |
| `og` | Generate social share banners (runs automatically in `pnpm build`) |
| `sitemap` | Generate `public/sitemap.xml` (runs automatically in `pnpm build`) |
| `screenshots` | Capture the two PWA install-prompt screenshots |
| `stats` | Print a play-analytics summary from production D1 |
| `deploy` | Build and deploy straight to Cloudflare Pages (bypasses CI — normally deploys happen via `deploy.yml` on push to `main`) |

Full explanations, setup steps, and every flag: **`apps/web/scripts/README.md`**.

### Tests

| Command                   | What it runs                                  |
|---------------------------|-----------------------------------------------|
| `pnpm -C apps/web test`         | Vitest watch — unit tests during development |
| `pnpm -C apps/web test:run`     | Vitest single run (used in CI)               |
| `pnpm -C apps/web test:ui`      | Vitest UI dashboard                          |
| `pnpm -C apps/web test:e2e`     | Playwright — boots dev server automatically  |
| `pnpm -C apps/web test:e2e:ui`  | Playwright UI mode (great for debugging)     |

Two layers, separate folders:

- **`apps/web/tests/unit`** — Vitest + jsdom + Testing Library. Pure logic: store actions, hooks, components, utilities.
- **`apps/web/tests/e2e`** — Playwright across Chromium + WebKit + mobile profiles. Real browser flows. Audio is mocked with a tiny silent MP3 fixture so tests don't hit R2.

First Playwright run also needs `pnpm exec playwright install` to fetch browser binaries.

See `apps/web/tests/README.md` for conventions and how to add tests.

**PWA / service worker testing is production-preview only.** The dev server
(`pnpm dev`, port 5173) never registers the service worker — Vite's dev
transform doesn't produce a `sw.js`. To test anything PWA-related (install
prompt, offline fallback, offline audio, the update-toast flow), build and
serve the production bundle instead:

```bash
pnpm --filter @form-at/web build
pnpm --filter @form-at/web start   # port 4173 — real SW, real Chrome
```

(The script is `start`, not `preview` — there is no `preview` script.) See
`PWA_PROGRESS.md` for the full offline/PWA test matrix.

### CI / CD

Two GitHub Actions workflows in `.github/workflows/`:

- **`ci.yml`** — runs on every push (except `main`) and every pull request. Three parallel jobs: `static` (biome + tsc), `unit` (vitest), `e2e` (playwright on Chromium and WebKit).
- **`deploy.yml`** — runs on push to `main`. Re-runs the same `static` / `unit` / `e2e` jobs as gates, then deploys to Cloudflare Pages only if all pass. Direct pushes to main can't bypass the test suite.

Required secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

---

## Architecture notes

### Audio player
The player is a persistent fixed bar rendered in the root layout — it survives route changes. Sets play on locked mobile screens via the **Media Session API**. Audio files are streamed from Cloudflare R2 (free egress).

All playback logic lives in `apps/web/app/hooks/useAudioPlayer.ts`. `Player.tsx` is layout only.

### Play tracking
Listen events fire via `navigator.sendBeacon` (fire-and-forget, survives page close — `useAudioPlayer.ts:50`). The `/api/signal` endpoint (`apps/web/app/routes/api/signal.ts`) inserts into **Cloudflare D1**. Plays under 3 seconds are ignored (`useAudioPlayer.ts:49`). Play counts appear on `/sets`.

Schema: `apps/web/schema.sql`. Apply to remote DB:
```bash
npx wrangler d1 execute form-at-analytics --remote --file=apps/web/schema.sql
```

### Cloudflare Web Analytics

Privacy-first analytics — no cookies, no fingerprinting, GDPR-compliant. Auto-injected by Cloudflare for `formatglasgow.com`, no script tag needed.

Dashboard: **Cloudflare → Analytics & Logs → Web Analytics → formatglasgow.com**

**What it tracks**
- Visits and page views per route
- Core Web Vitals (LCP, INP, CLS) from real visitors
- Top pages, referrers, countries, devices, browsers
- Operating system and browser breakdown

**What it doesn't track**
- Individual user sessions or journeys (aggregate only)
- Anything requiring a cookie consent banner — that's the privacy trade-off

**Core Web Vitals — what they mean for a music site**

| Metric | What it measures | Why it matters here |
|---|---|---|
| LCP | How fast the largest visible element loads | The page should feel instant before audio starts |
| INP | Responsiveness to taps and clicks | Play button must feel immediate on mobile |
| CLS | Layout shift while loading | Player bar animating in shouldn't push content |

Good targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. CF highlights these in green/amber/red.

**Filters worth using**

- **Filter by page** — compare `/sets` vs `/djs` vs `/events` to see which sections get the most attention
- **Filter by country** — useful once you start promoting to specific cities or booking international acts
- **Filter by device type** — expect heavy mobile skew; if desktop spikes after a social post, that post drove it
- **Filter by referrer** — tells you which Instagram posts, SoundCloud links, or Google searches are sending people

**Using it alongside D1 play data**

| CF Analytics tells you | D1 plays tells you |
|---|---|
| Who visited `/sets` | Who actually hit play |
| Which DJ pages get views | Which sets get listened to |
| Where traffic came from | How long people listened |
| Peak traffic times | Most replayed sets |

Patterns to watch for:
- High `/sets` visits but low play count → people are browsing but not committing. Could be slow audio load or no artwork to draw them in.
- A DJ page spikes after an event → the gig drove people to check the archive. Good signal for which artists to book again.
- High mobile traffic + poor INP → the player controls are too small or slow to respond; worth investigating.
- Traffic spike with an unknown referrer → probably a group chat or private share (shows as "direct").

---

## Roadmap

### Pending

- **Analytics query UI** — D1 has `started_at` and `listened_seconds` indexed but there's no internal dashboard page to query plays by date range or top tracks over time.

### Longer term

- **Better Auth** — community features gated behind login. Player and sets pages stay fully public.

### Shipped since this list was last written

- **Artwork on sets** — every set in `sets.ts` carries an `artwork` path (e.g. `"sets/002"`, verified against all four current entries); wired into the Media Session lock-screen display and the card/detail UI.
- **Mobile player track info** — the mobile mini-player shows `artist · title · date` inline (`components/player/MobileMiniPlayer.tsx:97-109`), truncating or marqueeing on overflow. Not hidden.
- **Service Worker / PWA** — installable app, offline audio playback from IndexedDB, offline page fallback, and a user-consented update flow. See `PWA_PROGRESS.md` for the full design history and `TECH_DEBT.md` for open follow-ups.
- **Social share image** — this list previously said `og:image` "currently uses the square F icon," which was already stale: `scripts/generate-og.ts` composes a proper 1200×630 branded banner (wordmark + tagline) as the site-wide default (`__root.tsx`), plus a fully bespoke per-entity banner (photo/artwork/flyer + name/title/date) for every set (`/sets/$setId`), DJ (`/djs/$djId`), and event (`/events/$eventId`) detail page — verified both by reading each route's `head()` and by checking the generated files exist under `public/og/{sets,djs,events}/`. Listing pages and home keep the generic banner deliberately (no single entity to feature). The only fallback path is a genuinely-missing source image (a DJ with no `photo`, a set with no `artwork`, an event with no `flyer`) — the script skips and logs a warning rather than crash, which is correct degradation, not a gap.

---

## Performance audit (completed 2026-05-08)

A one-time pass (commit `d6e5a03`); kept here as a record of what was found and fixed, not an active checklist.

- **🔴 Image bloat** — `wordmark.png` / `logo.png` were 9449×9449px (~360KB each, ~89M decoded pixels on every load) despite rendering at 310×44 / 32×32. Fixed: resized + converted to WebP/AVIF.
- **🟠 Waveform redraws on every `timeupdate`** — the paint effect depended on `[peaks, currentTime, duration]`, so every ~4×/sec tick reassigned canvas dimensions (clearing it) and repainted every bar just to move the progress line. Fixed: split into a bars-on-`[peaks]`-change effect and a progress-only overlay.
- **🟡 `/sets` loader had no `staleTime`** — every navigation re-ran the D1 play-count query. Fixed: added `staleTime: 60_000`.
- **🟡 `onTimeUpdate` re-rendered the whole Player ~4×/sec** — isolated the time-dependent UI so the rest of the bar reads static state.
- **🟢 `pnpm check` didn't run TypeScript** — Biome catches lint/format only. Fixed: added a typecheck step.
- **🟢 No bundle analyzer** — added `rollup-plugin-visualizer` to surface unexpectedly heavy deps before they ship.
