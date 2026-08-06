# Form:at

Monorepo for Form:at — a techno collective based in Glasgow.
Live at [formatglasgow.com](https://formatglasgow.com)

## Apps & packages

| App/Package | Path | Purpose |
|-----|------|---------|
| web | `apps/web` | Public website + embedded audio player |
| admin | `apps/admin` | Internal analytics dashboard, deployed separately, Cloudflare Access-gated |
| ui | `packages/ui` | Shared design system — tokens, primitives, Storybook, Chromatic |
| data | `packages/data` | Shared sets catalogue + analytics query logic (consumed by web and admin) |

Future apps go in `apps/`. Each app picks its own framework; the default is TanStack Start.

## Architecture

### Audio player — the core feature
Sets must play on locked mobile screens. This is solved with the **Media Session API**. The player is a persistent fixed bottom bar rendered in `__root.tsx`, surviving all route changes.

Audio files live on **Cloudflare R2** (free egress), served via the `cdn.formatglasgow.com` custom domain — `AUDIO_HOST`/`AUDIO_ORIGIN` in `packages/data/src/sets.ts` are the single place that changes if the host moves. Each set's `src` comes from the D1 `sets` row (or the committed snapshot), not from a hand-edited array.

All audio logic lives in `apps/web/app/hooks/useAudioPlayer.ts` — track loading, spacebar/media key support, `sendBeacon` analytics, `beforeunload` position save, Media Session API. `Player.tsx` is layout only.

### Player state
Global state is managed by **Zustand** (`apps/web/app/store/`). The store is split into slices:

- `playerSlice.ts` — `nowPlaying`, `isPlaying`, `positions` (per-track resume map), and their setters
- `store/index.ts` — composes slices and persists a `partialize`d subset to localStorage via `zustand/middleware/persist`: `nowPlayingId`, `positions`, `peaksCache`, `durations`, and the PWA install booleans. `deferredPrompt` is deliberately omitted — it's a non-serializable event object

`MusicSet` objects are never stored in localStorage — only IDs are persisted and hydrated back via `getSet()` on load. This avoids migration risk if the shape changes.

The `isPlaying` flag in the store is the control surface for external components. `useAudioPlayer` has a bridge effect that watches it and calls `audio.pause()` / `audio.play()` accordingly.

### Navigation
`SwipeNavigator` (`apps/web/app/components/SwipeNavigator.tsx`) wraps the `<Outlet />` and provides horizontal swipe navigation between the four main routes (`/`, `/sets`, `/events`, `/djs`). Uses `@use-gesture/react` for real-time drag tracking. On swipe confirm, a `cloneNode` snapshot of the outgoing page animates out via direct DOM manipulation while the new page slides in via React state + double `requestAnimationFrame`.

A gold dot indicator sits above `BottomNav` on mobile, showing the current page position. It animates in real-time during drag via direct DOM style updates (no React re-renders).

### Analytics — play tracking
Listen events are tracked via `navigator.sendBeacon` (fire-and-forget, survives page close). `useAudioPlayer` calls `/api/signal` (`apps/web/app/routes/api/signal.ts`) on pause, track change, and tab close — ignoring plays under 3 seconds. Data lands in a **Cloudflare D1** SQLite database (`form-at-analytics`, table: `plays`).

Play counts are shown on the `/sets` page via a `createServerFn` loader that queries D1 at SSR time.

### Server entry and Cloudflare env
TanStack Start v1.167 uses pure Vite (no Nitro/Vinxi). The custom server entry at `apps/web/app/server.ts` handles Cloudflare's `fetch(request, env, ctx)` calling convention and forwards `env.DB` as `context.cloudflare.env`. This makes D1 accessible in both `server.handlers` route handlers and `createServerFn` handlers via `(context as unknown as Record<string, unknown>).cloudflare`.

**Without this entry, D1 is unreachable from any server-side code.**

### API routes
TanStack Start v1.167 does not have `createAPIFileRoute`. Use `createFileRoute` with a `server: { handlers }` option instead:

```ts
export const Route = createFileRoute("/api/example")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        // context.cloudflare?.env?.DB is available here
        return new Response(null, { status: 204 });
      },
    },
  },
});
```

Routes with only `server.handlers` and no `component` are pure API endpoints — TanStack Router will never try to render them.

### Deployment
Deployed to **Cloudflare Pages**. The D1 binding `DB` is configured in `wrangler.toml` and must also be added in the CF Pages dashboard under Settings → Functions → D1 database bindings.

Schema lives in `apps/web/schema.sql`. Apply to the remote DB with:
```bash
npx wrangler d1 execute form-at-analytics --remote --file=apps/web/schema.sql
```

**Cloudflare Web Analytics** is auto-injected for `formatglasgow.com` — no script tag needed.

### Auth (not yet built)
Community features will be gated behind **Better Auth** (self-hosted, open source). The player and sets pages stay fully public — no login required to listen.

### Admin dashboard — `apps/admin`
A separate TanStack Start app (not a route inside `apps/web`), deployed as its own Cloudflare Pages project at `admin.formatglasgow.com`, protected by **Cloudflare Access at the subdomain level** (Julian configures the Access application and Pages project himself — see "Manual Cloudflare setup" below; never attempt to create/modify Cloudflare resources on his behalf).

**No in-app authentication — deliberate.** Access gates the page load at the edge; the app itself has zero login/session code. **This only protects page loads, not individual server-function calls** — any future *mutating* admin endpoint (there are none today; the dashboard is pure read-only aggregate queries) must verify the Access identity server-side (the `Cf-Access-Jwt-Assertion` header) rather than assuming the page being gated is enough.

**Shares `packages/data` (`@form-at/data`) with `apps/web`**, not a duplicated copy: the static sets catalogue and `fetchSetStats` (the per-set trend query) have two real consumers — the public `/sets/$setId` page and this dashboard's per-set picker. `apps/web` imports `@form-at/data/sets` / `@form-at/data/set-stats` / `@form-at/data/webPush` directly (`TECH_DEBT.md` item 21's sweep). `apps/web/app/data/sets.ts` and `apps/web/app/data/set-stats.ts` still exist, but only for genuinely app-local code (this app's own D1-fallback wrapping, `fetchOverallStats`) — no re-export shims remain. `admin-stats.ts` (the dashboard's own aggregate queries — install funnel, app launches, plays, push subscribers, clicks) has only ever had one consumer, so it lives entirely in `apps/admin`, not the shared package.

**Trend rows render real charts** (install funnel, app launches, per-set plays, push growth) from the arrays `admin-stats.ts` returns, drawn with `visx` (`@visx/axis`/`group`/`responsive`/`scale`/`tooltip`). `chart pending` is only the loading fallback, not the shipped state.

`TrendChart.tsx` wraps `TrendChartInner` in `ClientOnly` + `Suspense` behind a `lazy(() => import(...))`. **Keep the genuine dynamic `import()`** — `ClientOnly` is a render guard, not a code-splitting mechanism, so flattening it to a static top-level import would pull all of `visx` into `_worker.js` while still rendering correctly. See PWA_PROGRESS.md's "Phase C: tabbed layout, centred grid, real charts" entry for the before/after bundle measurement.

**Manual Cloudflare setup** (Julian does this, not Claude): create the `form-at-admin` Pages project (Direct Upload, matching `form-at-web`), add the `DB` D1 binding (Settings → Functions → D1 database bindings → `form-at-analytics`), add the `admin.formatglasgow.com` custom domain, and create a Cloudflare Access application (Zero Trust → Access → Applications → Self-hosted) gating that domain to the team's emails. Verify `CLOUDFLARE_API_TOKEN`'s scope covers the new project — CI deploys will 403 if it was scoped narrowly to `form-at-web` only.

### Design system — `packages/ui`
Generic, presentational primitives live in `@form-at/ui` (`packages/ui/src/`), not in `apps/web`. Each component gets its own folder (e.g. `src/Button/Button.tsx`, `Button.stories.tsx`, `Button.test.tsx`) — except `icons/`, which stays a flat directory of pure SVG components. The package has **no build step**: it ships raw `.tsx`/`.css` source (same precedent as `packages/tsconfig`), consumed directly by `apps/web`'s Vite build and by Storybook via the pnpm workspace symlink.

**What lives here:** `Text` family (`Text`/`Heading`/`Label`/`Body`/`Muted`/`PageTitle`), `BracketLabel`, `Button`, `TextButton`, `TerminalRow`, `Card`, `Modal`, `ToastShell`, the icon set, and the design tokens. Components that are app-specific (asset URL conventions, Zustand-store-coupled, TanStack Router-coupled nav) stay in `apps/web/app/components/` — `packages/ui` only holds things with zero framework/app coupling.

**Design tokens — single source of truth:** `packages/ui/src/tokens.css` (the `@theme` block, keyframes, and `t-*` typography utilities) and `packages/ui/src/tokens.ts` (the JS colour mirror for canvas use, e.g. `Waveform.tsx`). A Vitest test (`tokens.test.ts`) parses both and asserts the colours match — this is a structural assertion, not a snapshot, so it fits the repo's "no snapshot tests" rule. `apps/web/app/styles/global.css` imports `@form-at/ui/tokens.css` and keeps only genuinely app-local CSS (the two keyframes used by non-migrated components, and the base heading reset).

**Tailwind v4 cross-package class detection:** Tailwind's automatic source scanning excludes `node_modules`, and `packages/ui` only reaches `apps/web` via a pnpm workspace symlink — so an explicit `@source "../../../../packages/ui/src";` directive in `global.css` is required for Tailwind to see class names used inside `packages/ui/src/*.tsx`. Don't remove it.

**Storybook + Chromatic:**
- `pnpm --filter @form-at/ui storybook` — dev server (port 6006). `pnpm --filter @form-at/ui build-storybook` — static build (what CI/Chromatic runs).
- Interaction tests use Storybook's **Portable Stories API** (`composeStories`) run through plain Vitest + jsdom — deliberately *not* `@storybook/addon-vitest`/test-runner, both of which need a real Playwright/WebdriverIO browser. Given this repo's Playwright-cache-collision history (see CI/CD below), a second browser-install surface is an avoidable failure mode.
- **Don't mix `vi.fn()` with Storybook's `fn()`.** `storybook/test`'s `fn()` bundles its own `@vitest/spy`, which is a structurally different `Mock` type from the workspace's own `vitest`. Passing a locally-created `vi.fn()` as a prop override on a composed story will fail `tsc` with a confusing type error. Instead, assert against the mock the story already created: `composeStories(stories).Secondary.args.onClick`.
- Chromatic renders in its own cloud browsers — it cannot collide with the Playwright browser cache (see CI/CD).

## Principles

- **Top-notch quality is the priority.** This is meant to be a polished, professional app — not a quick prototype or hobby project. When a trade-off comes up between speed and quality, default to quality. Choose the cleaner abstraction over the cheapest one, the correct pattern over the shortcut, the proper UX over "good enough." Don't be cheap with engineering time, refactors, or polish: invest the effort to do things properly the first time. If a suggestion sounds "easier but worse," flag it and propose the better path.
- **This is a portfolio project as well as a live product.** It's meant to demonstrate professional developer experience and production standards to anyone who reads the repo, not just to ship features. That raises the bar specifically on: documented, tested component APIs (Storybook stories + interaction/a11y coverage for anything in `packages/ui`, not just "it renders"), clean package boundaries (no app-specific imports leaking into a shared package), and CI that actually gates on all of it. When choosing between a quick inline fix and a properly abstracted/documented one in a shared package, default to the latter.
- **Keep it simple.** Within the quality bar above, prefer the simplest implementation that does the job well. Don't add abstractions until there's a clear need. Three similar lines beats a premature helper — but two coexisting half-built abstractions is *not* simple, it's debt. Simple ≠ shortcut.
- **No comments that explain what the code does** — names do that. Only comment the non-obvious *why*.
- **Comments are present-tense facts about the code, never a changelog.** A comment describes how the code *is*, not what happened to it. See "Comment register" below for the full rule — it's the one convention most likely to be reintroduced by accident.
- **Biome only** — no Prettier, no ESLint. Run `pnpm check` to lint and format everything.
- **Shared config in `packages/`** — each app extends `@form-at/tsconfig` via `workspace:*`.

## Git workflow

The user owns commits — you do not create them. The user is the repo owner and wants to review the staged diff before each commit; auto-commits remove that checkpoint.

- **Read-only git is fine, freely.** `git status`, `git diff`, `git log`, `git show` for diagnosis or to surface what's staged / changed.
- **Staging:** you MAY `git add <specific files>` when explicitly asked. Otherwise default to *telling the user which files to stage* rather than staging silently. Never `git add -A` or `git add .` — only named paths.
- **Never** run `git commit` (or any variant — `-am`, `--amend`, `commit -m`, etc.) or `git push`. No exceptions.
- **When a unit of work is complete and tests pass:** stop, summarise what changed and which files, and hand off. The user makes the commit themselves.

## Code standards

### Reusable components
- Extract a component when the same UI or behaviour appears in more than one place, or when a single file is getting hard to scan.
- **Generic, presentational, framework-agnostic components go in `packages/ui/src/` (`@form-at/ui`)** — see "Design system" above. Anything Zustand-store-coupled, TanStack-Router-coupled, or tied to an app-specific convention (e.g. the R2 image URL scheme) stays in `apps/web/app/components/`.
- App-specific components live in `apps/web/app/components/`. Name them after what they *are*, not where they're used (`TrackRow`, not `SetsPageTrackRow`).
- Keep props minimal and typed. Prefer explicit prop interfaces over spreading unknown objects.
- **Bracket buttons live in `@form-at/ui`'s `Button` (variants: `primary` / `secondary` / `fail`); bracket rendering itself lives in `BracketLabel` for non-button surfaces (`Link`, `<a>`, Toast, NavLinks).** Never hand-roll a `[ label ]` button with inline classes — use `<Button variant="secondary">label</Button>` and let the design system own the bracket colouring. `BracketLabel` owns its own `whitespace-nowrap` (a single wrapping `<span>`) — callers don't need to add it themselves.

### Comment register

A comment states a **present-tense fact about the code**, not an event that happened to it. History lives in git and `PWA_PROGRESS.md`, which carry it better and don't rot.

**Never write into a comment:**
- PR or review references — `(PR4)`, `PR6 review item 5`, `Post-review fix:`, `caught one review pass later`, `this was explicitly asked for in review`.
- Dates and dated verification — `(2026-08-02)`, `verified against MDN, 2026-07-21`, `field bug 2026-07-03`, `CDP-reproduced`.
- Internal shorthand indices — `M1`, `M3`, `H2`, `N1`, `chunk 3b`, `Phase 1/2/3/4`, `Step 5`. These are pure pointers with no content: a reader can't even guess what `(M1)` meant.
- Feature-provenance tags — `Set-upload feature (PR4) — …`. These age badly in one direction: code gets reused, the tag doesn't get updated, so a util serving three features still claims to belong to one. Eventually it isn't noise, it's **wrong**. Reasoning comments have no equivalent failure mode. Apply this uniformly — per-file judgement leaves a repo where nobody can infer the convention.
- Arguing with a past reviewer or a deleted comment — "the removed call's comment claimed X", "no fallback-writing path was removed by this change".
- Speculative future phases — "Phase 2 will shrink the player", "safe to change now, before this PR".

**The rewrite rule.** "PR4 review found X was wrong, so we now do Y" becomes "Y, because X would otherwise happen." Same information, no dependency on knowing what PR4 was. Prefer imperatives for traps: *never gitignore this*, *don't tighten this match*, *keep these two in step*.

**Always keep:**
- Anything that stops a plausible wrong edit — every "don't remove this", "deliberately NOT", and named failure-mode-if-you-change-this. `apps/admin/app/utils/hostGuard.ts` and `apps/admin/app/routes/dashboard.tsx`'s no-in-app-auth block are the reference examples; both exist solely to stop someone "fixing" a security control.
- Concrete specifics — `2 ÷ 2`, `~300 rows`, `220MB`, `iPhone SE 375px`. Specificity is the point; don't homogenise into blandness.
- Value-by-value references for a discriminated union, and file headers that orient a reader to a module's purpose. Those are API documentation, not volume.
- Pointers **into** `PWA_PROGRESS.md` / `TECH_DEBT.md` by section — `see PWA_PROGRESS.md's PR3 entry`, `TECH_DEBT.md item 15`. Those are the correct home for long-form rationale. Verify the section exists before pointing at it; a pointer to nothing is worse than no pointer.

**Proportionality.** Comment length scales with how easy it is to break the thing by editing that line. A subtle guard with a silent failure mode earns its paragraph; a bytes formatter does not. Long-form design rationale belongs in `PWA_PROGRESS.md` — the code needs only what prevents a wrong edit *at that exact line*, plus a pointer. Never restate what the code plainly says (enumerating an SVG's own stroke attributes, quoting another file's source inline — that copy will rot).

**When deleting a label,** grep for it first: other files may cross-reference it by name, and removing it silently breaks those references.

### Modern patterns
- **TypeScript strict mode** — no `any` unless there is a documented reason (e.g. CF env casting). Use `unknown` + narrowing instead.
- **`const` over `let`**, arrow functions for callbacks, destructuring over repeated property access.
- **Server functions** via `createServerFn` for all data fetching — no raw `fetch` calls to internal API routes from client code.
- **`useCallback` / `useMemo`** only when there is a measurable performance reason or a dependency array requires a stable reference. Don't add them pre-emptively.
- Prefer native Web APIs (`fetch`, `URL`, `Request`, `Response`) over wrapper libraries for simple cases.

### Readable JSX
JSX should describe **what** the UI is, not **how** it's computed. When an inline expression starts demanding a mental parser, hoist it.

- **Nested ternaries in JSX → named consts.** If you'd need to re-indent a ternary chain to read it, extract it above the `return`. Name it for the value it produces (`playButtonLabel`, `statusIndicator`), not the condition (`isPlayingAndLoaded`).
- **Inline math / string-building → named const or shared util.** A one-off `Math.floor(t/60)` is fine; a repeated `M:SS` formatter belongs in `~/utils/fmt.ts`. Reach for the util the second time you write the same expression.
- **Conditional JSX fragments → named consts.** `isPlaying ? <span className="text-gold">[ live ]</span> : <span>[ ready ]</span>` reads better as a `statusIndicator` const.
- **Conditional callback args → named consts.** `onClick={() => playTrack(set, a && b ? { startTime: t } : undefined)}` becomes `onClick={() => playTrack(set, playTrackOptions)}` with the options computed above. The handler then reads as the verb it is.
- **Threshold: ~one screen of JSX, no value in the markup should require >5 seconds to understand.** If you'd have to stop reading to evaluate a ternary, it doesn't belong there.

### File and naming conventions
- File names: `kebab-case` for routes and utilities, `PascalCase` for component files (`Player.tsx`, `Header.tsx`).
- One component or one logical unit per file. Co-locate the types it needs unless they're shared.
- Route files own their loader, server functions, and page component. Only extract when a file exceeds ~150 lines or a piece is reused elsewhere.
- Custom hooks live in `apps/web/app/hooks/`.

### Styling
- Tailwind utility classes only — no inline `style` props except for dynamic values (e.g. animation offsets).
- Design tokens are in `packages/ui/src/tokens.ts` (JS/canvas use) and `packages/ui/src/tokens.css` (the `@theme` block, Tailwind use) — see "Design system" above. A Vitest test keeps them in sync; don't hand-edit one without the other.
- Brand colours: `bg-black` (`#161615`), `text-gold` (`#c58538`), `text-purple` (`#43437a`), `text-grey` (`#cbcbcb`), `font-mono` (Space Mono).
- **Edges.** Sharp by default — terminal rows, the player bar, headers, status pills, CTA buttons, and structural borders (`border-t`, `border-l`) stay square. Use `rounded-card` (single 4px token, defined in `global.css`) only for **content surfaces the user taps into**: list cards, content images (artwork, flyers). Use `rounded-full` only for genuinely circular elements (e.g. the play button). Never use the freeform Tailwind radius scale (`rounded-md`, `rounded-lg`, `rounded-xl`) — only the two tokens above.
- **Bracket labels never wrap mid-bracket.** Terminal-style `[ label ]` buttons must keep the whole bracket pair on one line — an orphaned `]` on the next line breaks the visual convention and reads as a layout bug. `BracketLabel` (in `@form-at/ui`) owns `whitespace-nowrap` on itself, so this is now structural rather than a per-caller convention to remember. If a label is long enough that nowrap forces overflow at narrow viewports (iPhone SE 375px is the test case), shorten the label — never let the bracket split. This has bitten us repeatedly (Phase 2 banner `[ × ]`, Phase 3 `[ share_set ]` / `[ save_for_offline ]` row, and a missed case in `AddToCalendarButton`); the fix was moved into the component specifically so it can't be forgotten again.

## Commands

```bash
pnpm install          # install all workspaces
pnpm dev              # run all apps in dev mode (also generates routeTree.gen.ts on first run)
pnpm build            # build all apps via Turbo
pnpm check            # Biome lint + format across the whole repo
```

### Tests (in `apps/web/`)

```bash
pnpm test             # vitest watch
pnpm test:run         # vitest single run (CI)
pnpm test:ui          # vitest UI
pnpm test:e2e         # playwright (boots dev server itself)
pnpm test:e2e:ui      # playwright UI mode
```

Test layout:
- `apps/web/tests/unit/` — Vitest + jsdom. One folder per concern: `store/`, `hooks/`, `components/`, `utils/`, `data/`, `routes/`, `scripts/`.
- `apps/web/tests/e2e/` — Playwright. Real browser flows; mocks `*.mp3` requests with a silent fixture.
- `apps/web/tests/setup.ts` — jest-dom matchers + `HTMLMediaElement` stubs (jsdom doesn't decode audio).
- `apps/web/tests/README.md` — conventions for adding tests.

Notes:
- Vitest config (`apps/web/vitest.config.ts`) is **standalone** — it does NOT extend `vite.config.ts`, because the `tanstackStart` plugin sets up SSR routing that conflicts with isolated test rendering.
- Playwright config (`apps/web/playwright.config.ts`) uses `workers: 1` because Vite's dev server races on parallel route loads.
- Click handlers that call `playTrack` rely on the module-level `audioEl` ref in `playerSlice.ts`. Tests register a fake audio element via `registerAudioElement()` in `beforeEach`.

### Design system (in `packages/ui/`)

```bash
pnpm --filter @form-at/ui storybook          # Storybook dev server, port 6006
pnpm --filter @form-at/ui build-storybook    # static build (what CI/Chromatic runs)
pnpm --filter @form-at/ui test               # vitest — portable-stories interaction tests + tokens sync test
pnpm --filter @form-at/ui lint               # biome check src
pnpm --filter @form-at/ui tsc                # tsc --noEmit
```

Every component gets a co-located `.stories.tsx` (variants + interaction `play` functions + `@storybook/addon-a11y` coverage) and, where there's real behaviour to lock, a `.test.tsx` that runs those stories through Vitest via `composeStories`.

## CI / CD

Two GitHub Actions workflows in `.github/workflows/`:

- **`ci.yml`** — runs on push (non-main) + pull_request. Jobs: `static` (biome lint + `turbo tsc`, covers both `apps/web` and `packages/ui`), `knip`, `unit` (vitest for both `apps/web` and `packages/ui`), `chromatic` (Storybook visual regression for `packages/ui`), `e2e` (playwright on Chromium + WebKit).
- **`deploy.yml`** — runs on push to `main`. Re-runs `static`/`unit`/`e2e` as gates (deliberately **not** `chromatic` — see below), then `deploy` runs only after all pass. A direct push to `main` cannot bypass the test suite.

Both workflows use `pnpm/action-setup` pinned to the version in the root `package.json` `packageManager` field, plus `actions/setup-node` with pnpm cache. Playwright browsers are cached at `~/.cache/ms-playwright`, keyed on the **browser set + `pnpm-lock.yaml` hash** — the two workflows install different browser sets (ci: chromium+webkit, deploy: chromium-only) and must never share a cache key (first-writer-wins poisoning, PR #2 2026-07-02). The `chromatic` job never installs a Playwright browser (Chromatic renders in its own cloud browsers), so it cannot collide with this cache — deliberately kept PR-only (not duplicated into `deploy.yml`) to avoid roughly doubling Chromatic's snapshot quota consumption for a repo this size.

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CHROMATIC_PROJECT_TOKEN`.

## First run

After `pnpm install`, running `pnpm dev` will auto-generate `apps/web/app/routeTree.gen.ts` (TanStack Router code-gen). This file is gitignored — it regenerates on every dev start.

## Structure reference

- Root `package.json` is a thin Turbo wrapper — no app code here
- Shared configs live in `packages/`, consumed via `workspace:*`
- Each app's `tsconfig.json` extends the shared base
- Biome config at the root covers all workspaces
- `apps/web/app/server.ts` — custom Cloudflare server entry (do not delete)
- `apps/web/app/store/` — Zustand store (playerSlice + persist middleware)
- `apps/web/app/hooks/` — custom hooks (useAudioPlayer)
- `apps/web/vitest.config.ts` / `apps/web/playwright.config.ts` — test configs
- `apps/web/tests/` — unit + e2e tests, plus README on conventions
- `apps/admin/app/server.ts` — same Cloudflare entry pattern as `apps/web`'s, minus audio/CSP specifics
- `apps/admin/wrangler.toml` — own Pages project (`form-at-admin`), same `form-at-analytics` D1 binding as the root config
- `packages/ui/src/` — design system components, one folder per component (`icons/` stays flat), `tokens.css`/`tokens.ts`
- `packages/ui/.storybook/` — Storybook config; `packages/ui/vitest.setup.ts` — jsdom `<dialog>` polyfill + jest-dom matchers
- `packages/data/src/` — `sets.ts` (catalogue types, D1 queries, `mergeSets`, `AUDIO_HOST`/`AUDIO_ORIGIN`), `sets.generated.ts` (committed build-time D1 snapshot — the offline fallback), `set-stats.ts` (`fetchSetStats` + trend-bucketing helpers), `webPush.ts` (push signing/sending, shared by both apps)
- `.github/workflows/ci.yml` / `deploy.yml` — CI pipeline + gated deploy (both apps, `deploy.yml` has a separate `deploy-admin` job)
- `wrangler.toml` — at repo root, configures `form-at-web`'s Cloudflare Pages + D1 binding (`apps/admin/wrangler.toml` is the second app's own config)

## Docs to check

Besides this file, a few other docs carry context that isn't derivable from the code — check them when relevant, don't assume they're stale:

- **`PWA_PROGRESS.md`** (root) — engineering session-resumption log for phased work (currently PWA/offline). Check when resuming multi-session feature work to see what's already landed vs. in progress.
- **`TECH_DEBT.md`** (root) — engineering-only tech-debt tracker with an open/invalid/deferred/resolved status table. Check before starting work in an area that might have a known caveat already logged.
- **`IMPROVEMENTS.md`** (root) — product/feature backlog (checklist of shipped vs. pending ideas). Check when scoping a new feature, so you don't propose something already considered/rejected/planned.
- **`README.md`** (root) — project overview, stack table, dev commands. The first thing a new contributor (or portfolio reviewer) reads.
