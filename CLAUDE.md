# CLAUDE.md — working agreement for agents in this repo

Form:at is a PWA for a Glasgow techno collective. Live at
[formatglasgow.com](https://formatglasgow.com). The defining constraint: sets
are 90-minute mixes (100–220MB) that must be saveable and playable with no
signal, which is what most of the architecture exists to serve. Read `README.md`
for the engineering narrative; this file is the operating rules.

| Workspace | Path | Purpose |
|---|---|---|
| web | `apps/web` | Public site + audio player → `formatglasgow.com` |
| admin | `apps/admin` | Internal dashboard → `admin.formatglasgow.com`, Cloudflare Access-gated |
| ui | `packages/ui` | Design system — tokens, primitives, Storybook, Chromatic |
| data | `packages/data` | Shared catalogue, D1 queries, push sending |
| tsconfig | `packages/tsconfig` | Shared TS config, consumed via `workspace:*` |

**Apps never import each other** — only `packages/*` are shared. New apps go in
`apps/`; each picks its own framework, default TanStack Start.

---

## 1. Hard constraints

Ordered by blast radius. The first five are the ones to absorb if you read
nothing else.

### Never claim something is verified without having run it
This repo's recurring failure mode, and the reason the rest of this list exists.
Docs here get trusted by sessions that can't re-check them, so a confident wrong
claim propagates. Every item below was originally documented wrong by someone who
hadn't checked — including the `schema.sql` line directly beneath this one, which
would have failed against production. If you didn't run the command, read the
file, or see the test pass, say which one you didn't do.

### Never gate the offline-set purge on `catalogueReady` — it must be `catalogueConfirmed`
**The only thing in this repo that can silently destroy user data.**
`reconcileFromIdb` (`apps/web/app/store/offlineSlice.ts`) purges a downloaded set
— 100–220MB the user chose to save — when its id isn't in the catalogue. The two
flags are not interchangeable (`apps/web/app/store/catalogueSlice.ts`):

- `catalogueReady` — the boot fetch **settled**: succeeded, failed, *or* timed out.
- `catalogueConfirmed` — the boot fetch **succeeded**.

Gate the membership purge on `catalogueReady` and a single failed fetch reads as
"the catalogue no longer lists any of your sets", and every saved set is deleted.
`catalogueReady` gates only `reconcileFromIdb`'s cheap first pass; the
membership purge in its second pass checks `catalogueConfirmed`
separately. **Never collapse the two flags into
one**, and never let a "simplification" route the purge through the wrong one. It
took two review rounds to get right and there is no test that fails loudly if you
merge them — the damage happens on a user's device, offline.

### Never remove or weaken `apps/admin`'s host guard
Cloudflare Access can only gate hostnames in a zone we own — it **cannot** gate
Cloudflare's own `*.pages.dev`. So the same admin deployment is reachable at
`form-at-admin.pages.dev` and at every per-deployment preview URL
(`cd9a05fe.form-at-admin.pages.dev`). `apps/admin/app/utils/hostGuard.ts`'s `isAllowedHost`, plus
its enforcement in `apps/admin/app/server.ts` — a plain 404 for any host that
isn't `admin.formatglasgow.com` (localhost exempted for dev and e2e) — **is the
only thing keeping the dashboard off the public internet on those hosts.** It
runs before routing and before any D1 access, and returns 404 rather than a
redirect so it doesn't advertise the real hostname. It is not redundant with
Access; deleting it makes the dashboard public.

### Never apply `schema.sql` with `--file` against a database that already exists
It holds **5 `ALTER TABLE`s that are not idempotent** — re-running them fails
with a duplicate-column error. `ADD COLUMN IF NOT EXISTS` is not an option: D1
rejects it (`near "EXISTS": syntax error … SQLITE_ERROR`), unlike vanilla SQLite
≥3.35. `schema.sql` is the reference definition and what a *fresh* database needs
once. Migrate an existing database one statement at a time and verify:

```bash
npx wrangler d1 execute form-at-analytics --remote --command "ALTER TABLE plays ADD COLUMN <col> <type>"
npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(plays)"
```

`schema.sql`'s own comments record which statements are already applied to
production. Read them before running anything.

### Never delete `apps/web/app/server.ts` or `apps/admin/app/server.ts`
These custom entries handle Cloudflare's `fetch(request, env, ctx)` convention
and forward `env.DB` as `context.cloudflare.env`. **Without them D1 is
unreachable from every piece of server-side code** — both `server.handlers`
routes and `createServerFn` handlers. They look like boilerplate a framework
should own. It doesn't.

### Never add `self.skipWaiting()` to `apps/web/app/sw.ts`
An immediately-activating service worker prunes the previous build's hashed
chunks from the precache **while old clients are still running them**, so the
next lazy route-load in an open session 404s — Cloudflare Pages only serves the
latest deployment. A broken route, not a stale cache. New builds are meant to sit
in `waiting` and take over on the next cold start.

### Never rebuild the `Request` in `sw.ts`'s audio route — always forward the original
Two independent breakages. `new Request(url, {...})` defaults `mode` to `cors`,
which makes the browser block R2's response to `<audio>`'s natively no-cors
request. And even a rebuild that copies `mode` explicitly **silently drops the
`Range` header**, because a `Headers` object under the Fetch spec's
request-no-cors guard discards anything not no-CORS-safelisted — so seeks return
200 full-body instead of 206 and re-download 100MB+ from byte 0. Node's undici
doesn't implement that guard, so **no unit test can catch this**; it only appears
in a real browser.

### Every mutating admin endpoint must call `verifyAccessJwt`
Cloudflare Access gates page loads at the edge, not individual endpoint calls, so
each writer verifies the Access identity server-side via
`apps/admin/app/utils/verifyAccessJwt.ts`. All four current ones do —
`routes/api/sets.ts` (upload), `routes/api/sets-presign.ts` (R2 presigned URLs),
`routes/api/sets/restore.ts`, `routes/api/send-push.ts`. Add nothing that skips
it; only the read-only aggregate queries may. There is deliberately no dev-mode
bypass. Paired with the host-guard rule above — Access covers neither the
`*.pages.dev` hostname nor individual endpoint calls.

### Never substitute `0` for a metric that failed to load
`AdminDashboardStats.edgeTraffic` is `null` on every failure path — missing
credentials, 403, a GraphQL `errors` array inside a 200 body, timeout, empty
window. `0` states "no traffic"; `null` states "we couldn't read it". Rendering
the first for the second is a wrong fact, not a missing one, and it's
indistinguishable to whoever reads the dashboard. Same reasoning as
`conversionRate`/`acceptedRate` being nullable rather than 0. The
`// edge_traffic` card's empty state is the reference example.

### Never remove the `@source` directive from `apps/web/app/styles/global.css`
Tailwind v4's automatic source scanning excludes `node_modules`, and
`packages/ui` reaches `apps/web` only through a pnpm workspace symlink. Without
`@source "../../../../packages/ui/src";` Tailwind never sees class names used
inside the design system and **silently strips them from the bundle** — the
components render unstyled, with no build error.

### Never flatten `TrendChart`'s `lazy(() => import(...))` into a static import
`ClientOnly` is a render guard, not a code-splitting mechanism. A static
top-level import still renders correctly while pulling all of `visx` into
`_worker.js`. Silent bundle regression, no test failure.

### Keep these pairs in step
- `WIDTHS` in `apps/web/scripts/optimize-images.ts` ↔ `apps/web/app/components/Image.tsx`.
  They're `[640, 1080]`. Add a width to one only and the srcset requests variants
  that were never generated.
- `packages/ui/src/tokens.css` ↔ `packages/ui/src/tokens.ts` (the JS colour
  mirror for canvas use). `tokens.test.ts` parses both and asserts they match, so
  this one fails loudly — but fix both, don't weaken the test.

### Never make `apps/web/vitest.config.ts` extend `vite.config.ts`
It is standalone deliberately: the `tanstackStart` plugin sets up SSR routing
that conflicts with isolated test rendering.

### Never let `ci.yml` and `deploy.yml` share a Playwright browser cache key
Caches live at `~/.cache/ms-playwright`, keyed on **browser set + `pnpm-lock.yaml`
hash**. The workflows install different sets (ci: chromium+webkit, deploy:
chromium only). Sharing a key means first-writer-wins poisoning — the second
workflow finds a cache hit for browsers it doesn't have.

### Never hand-roll a `[ label ]` bracket button
Use `<Button variant="secondary">label</Button>`, or `BracketLabel` on non-button
surfaces (`Link`, `<a>`, Toast, NavLinks). The design system owns the bracket
colouring, and `BracketLabel` owns its own `whitespace-nowrap`.

---

## 2. Workflow

**Commits belong to the repo owner.** They review the staged diff before each
commit; an auto-commit removes that checkpoint.

- **Read-only git, freely** — `git status`, `git diff`, `git log`, `git show`.
- **Staging:** `git add <named paths>` when explicitly asked. Otherwise say which
  files to stage. **Never `git add -A` or `git add .`** — it sweeps up unrelated
  work in progress.
- **Never** `git commit` (any variant, including `--amend`) or `git push`.
- **When a unit of work is done:** stop, say what changed and in which files,
  hand off.

**Cloudflare resources — Pages projects, D1 databases, R2 buckets, Access
applications — are provisioned manually by the repo owner.** Don't create or
modify them from a session, and don't assume a resource exists because the config
references it.

**Before handing off, run these two by default** — they're fast and they catch
most of what CI would:

```bash
pnpm check      # Biome lint + format, then turbo tsc across all workspaces
pnpm test       # unit tests, all workspaces
```

Add `pnpm knip` when you changed exports or dependencies.

**`pnpm test:e2e` and production builds (`pnpm build`) are slow — minutes, not
seconds.** Run them when the change actually touches what they cover: routes,
navigation, the player, service-worker behaviour, or CI config. A docs-only or
comment-only change doesn't need either. **Ask before running them** if local
instructions impose a time or cost constraint (see `CLAUDE.local.md`, which loads
on top of this file) — offer the cheaper check instead of running the expensive
one silently.

Report failures with their output, and say plainly which checks you didn't run.
Never describe a change as verified on the strength of a check you skipped.

### Leave the docs true

Before handing off, re-read the docs the change could have **invalidated**, and
fix what's now wrong. The test is *"does an existing doc now say something false
or incomplete?"* — not *"did I add a feature?"*. Padding a doc because something
shipped is churn; leaving a stale claim standing is the failure this guards
against, and it has happened repeatedly here.

Per §1, read what each doc currently says rather than assuming — the point is to
catch the sentence that quietly became untrue, which you can't do from memory.

| Doc | Re-read it when |
|---|---|
| `README.md` | the stack, the architecture, or any claim about how something works changed. The doc an outside reader trusts first, so a stale line here misleads furthest. |
| `CLAUDE.md` | there's a new constraint, convention, or architecture area — §1 for something that breaks silently, §3 for a convention, §4's map for a new area to edit. |
| `PWA_PROGRESS.md` | a decision was made whose reasoning is worth preserving, **including what was tried and rejected**. |
| `TECH_DEBT.md` | a known gap was accepted rather than fixed, or an existing item's premise changed. |
| `IMPROVEMENTS.md` | something shipped, or was deliberately dropped and shouldn't be re-proposed. |
| `apps/web/scripts/README.md` | a script, flag or setup step changed. |
| `apps/web/tests/README.md` | test layout or conventions changed. |
| `apps/web/images-source/README.md` | the image pipeline changed. |

**A change that touches none of these needs no doc edit — say so.** Most
bug fixes and refactors qualify. "No doc changes needed, nothing above became
untrue" is a complete and correct answer.

---

## 3. Code standards

### Comment register

A comment states a **present-tense fact about the code**, not an event that
happened to it. History lives in git and `PWA_PROGRESS.md`, which carry it better
and don't rot. This is the convention most likely to be reintroduced by accident.

**Never write into a comment:**
- PR or review references — `(PR4)`, `PR6 review item 5`, `Post-review fix:`, `caught one review pass later`.
- Dates and dated verification — `(2026-08-02)`, `verified against MDN, 2026-07-21`, `CDP-reproduced`.
- Internal shorthand indices — `M1`, `H2`, `chunk 3b`, `Phase 1/2/3/4`, `Step 5`. Pure pointers with no content: a reader can't even guess what `(M1)` meant.
- Feature-provenance tags — `Set-upload feature (PR4) — …`. These age in one direction: code gets reused, the tag doesn't, so a util serving three features still claims to belong to one. Eventually not noise but **wrong**. Apply uniformly — per-file judgement leaves a repo where nobody can infer the convention.
- Arguing with a past reviewer or a deleted comment.
- Speculative future phases — "Phase 2 will shrink the player".

**The rewrite rule.** "PR4 review found X was wrong, so we now do Y" becomes "Y,
because X would otherwise happen." Same information, no dependency on knowing
what PR4 was. Prefer imperatives for traps: *never gitignore this*, *don't
tighten this match*, *keep these two in step*.

**Always keep:**
- Anything that stops a plausible wrong edit — every "don't remove this", "deliberately NOT", and named failure-mode-if-you-change-this. `apps/admin/app/utils/hostGuard.ts` and `dashboard.tsx`'s no-in-app-auth block are the reference examples; both exist solely to stop someone "fixing" a security control.
- Concrete specifics — `2 ÷ 2`, `~300 rows`, `220MB`, `iPhone SE 375px`. Specificity is the point; don't homogenise into blandness.
- Value-by-value references for a discriminated union, and file headers orienting a reader to a module's purpose. That's API documentation, not volume.
- Pointers **into** `PWA_PROGRESS.md` / `TECH_DEBT.md` by section. Verify the section exists first — a pointer to nothing is worse than no pointer.

**Proportionality.** Comment length scales with how easy it is to break the thing
by editing that line. A subtle guard with a silent failure mode earns its
paragraph; a bytes formatter does not. Never restate what the code plainly says,
and never quote another file's source inline — that copy will rot.

**When deleting a label,** grep for it first: other files may cross-reference it
by name.

### Where code lives
- Extract a component when the same UI or behaviour appears twice, or when a file gets hard to scan.
- **Generic, presentational, framework-agnostic → `packages/ui/src/`.** Anything Zustand-coupled, TanStack-Router-coupled, or tied to an app convention (e.g. the R2 image URL scheme) stays in `apps/web/app/components/`.
- Name components for what they *are*, not where they're used (`TrackRow`, not `SetsPageTrackRow`).
- Keep props minimal and typed. Explicit prop interfaces over spreading unknown objects.
- Route files own their loader, server functions and component. Extract past ~150 lines or on second use.
- Custom hooks in `apps/web/app/hooks/`.
- File names: `kebab-case` for routes and utilities, `PascalCase` for components.

### Naming a metric for what it measures
Where two sources count different things, the label says which. `edge_traffic`
(`requests`/`page_views`) is Cloudflare edge requests **including bots** — never
"visitors" or "people", because Cloudflare Web Analytics counts real browsers
and excludes bots, so the two disagree substantially and a shared label makes
the smaller number look like a bug. Same reasoning behind `install_to_push`
being captioned an approximation and `avg_engaged_listening` saying it's
cumulative. Reasoning per metric lives with the code — `data/cf-analytics.ts`'s
header for this one.

### Patterns
- **TypeScript strict.** No `any` without a documented reason (CF env casting is the standing one). Use `unknown` + narrowing.
- **`const` over `let`**, arrow callbacks, destructuring over repeated property access.
- **`createServerFn` for data fetching** — no raw `fetch` to internal API routes from client code.
- **`useCallback`/`useMemo` only** for a measurable win or a required stable reference. Not pre-emptively.
- Prefer native Web APIs (`fetch`, `URL`, `Request`, `Response`) over wrappers for simple cases.
- **Biome only** — no Prettier, no ESLint.
- **Simplest implementation that does the job well.** Don't abstract before there's a second caller. Three similar lines beat a premature helper — but two coexisting half-built abstractions is debt, not simplicity. When the choice is a quick inline fix versus a properly placed one in a shared package, take the latter and expect it to be tested and documented (Storybook story + interaction coverage for anything in `packages/ui`, not just "it renders").

### Readable JSX
JSX describes **what** the UI is, not **how** it's computed. Hoist anything that
needs a mental parser:
- **Nested ternaries → named consts** above the `return`. Name for the value produced (`playButtonLabel`), not the condition (`isPlayingAndLoaded`).
- **Inline math / string-building → named const or util.** A one-off `Math.floor(t/60)` is fine; a repeated `M:SS` formatter belongs in `~/utils/fmt.ts`. Reach for the util the second time.
- **Conditional fragments and conditional callback args → named consts**, so the handler reads as the verb it is.
- **Threshold:** no value in the markup should take more than ~5 seconds to understand.

### Styling
- Tailwind utilities only — no inline `style` except genuinely dynamic values (animation offsets).
- Tokens: `packages/ui/src/tokens.css` (Tailwind `@theme`, keyframes, `t-*` typography) and `packages/ui/src/tokens.ts` (JS mirror for canvas, e.g. `Waveform.tsx`).
- Brand colours: `bg-black` `#161615`, `text-gold` `#c58538`, `text-purple` `#43437a`, `text-grey` `#cbcbcb`, `font-mono` Space Mono.
- **Edges — sharp by default.** Terminal rows, player bar, headers, status pills, CTA buttons and structural borders stay square. `rounded-card` (the single `--radius-card: 4px` token in `packages/ui/src/tokens.css`) is only for content surfaces the user taps into: list cards, artwork, flyers. `rounded-full` only for genuinely circular elements. **Never** the freeform scale (`rounded-md`/`lg`/`xl`).
- **Bracket labels never wrap mid-bracket.** An orphaned `]` on the next line reads as a layout bug. `BracketLabel` owns `whitespace-nowrap` so this is structural rather than a per-caller convention — that's deliberate, because it bit three times before the fix moved into the component (a banner `[ × ]`, a `[ share_set ]` / `[ save_for_offline ]` row, and a missed case in `AddToCalendarButton`). If nowrap forces overflow at 375px (iPhone SE is the test case), **shorten the label** — never let the bracket split.

---

## 4. Architecture context

**The narrative lives in `README.md` — it isn't repeated here.** This section is
a map: where to edit, and where the reasoning is written down. Below it, only the
things you need *at the moment of editing* that no section heading can give you.

| Area | Edit here | Why it's built this way |
|---|---|---|
| Audio player | `apps/web/app/hooks/useAudioPlayer.ts` (all playback logic; `Player.tsx` is layout only) | Sets must play on locked screens — Media Session API. Persistent bar in `__root.tsx` survives route changes. |
| Offline audio | `apps/web/app/data/offline-audio.ts`, `store/offlineSlice.ts`, the audio route in `app/sw.ts` | README → *"220MB of audio has to survive with no signal"* (IDB over Cache Storage, quota pre-flight, Range) |
| Web/app divide | `apps/web/app/utils/appContext.ts` — the `?ctx=app` marker | README → *"Browser tabs never read the offline library"*. A product invariant, not an accident: don't make tabs read IDB. |
| Catalogue | `packages/data/src/sets.ts` (+ `sets.generated.ts`, `apps/web/app/data/sets.ts` for the app's fallback wrapping) | README → *"The catalogue is in a database, but the app is offline-first"* (live-wins `mergeSets`, committed snapshot) |
| Set upload | `apps/admin/app/routes/api/sets-presign.ts`, `utils/uploadWithProgress.ts` | README → *"A 220MB upload can't go through a Worker"* |
| Waveform peaks | `scripts/generate-peaks.mjs` (root, needs `ffmpeg` on PATH) | README → *"Waveform peaks are computed with ffmpeg, not in the browser"* |
| Push sending | `packages/data/src/webPush.ts` | README → *"The standard Web Push library doesn't run on Workers"* |
| Admin + auth | `apps/admin/app/routes/`, `utils/verifyAccessJwt.ts` | README → *"Admin auth: no auth code, then auth code anyway"*. The enforcement rule is §1. |
| Edge traffic | `apps/admin/app/data/cf-analytics.ts` — the app's only network call, deferred in `routes/dashboard.tsx`'s loader | That file's header: what it measures, why it's never "visitors", retention handling, and why every failure is `null`. Naming rule in §3. |
| Service worker build | `buildServiceWorker` in `apps/web/vite.config.ts` (owns the precache allowlist and revision derivation) | README → *"Technology choices"*, Workbox entry. `vite-plugin-pwa` is **not** a dependency. |
| Design system | `packages/ui/src/` — one folder per component, `icons/` flat | README → *"Monorepo structure"* (late extraction, no build step) |
| Navigation | `apps/web/app/components/SwipeNavigator.tsx` — wraps `<Outlet />`, swipes across `ROUTES = ["/", "/sets", "/events", "/djs"]` | Outgoing page animates via a `cloneNode` snapshot + direct DOM writes; the gold dot indicator likewise. Deliberately not React re-renders. |
| Analytics | `apps/web/app/routes/api/signal.ts`, `hooks/useTrackEvent.ts` | `navigator.sendBeacon` on pause, track change and tab close; plays under 3s ignored. Lands in D1 `plays`. Cloudflare Web Analytics is auto-injected — no script tag. |
| Server entry | `apps/web/app/server.ts`, `apps/admin/app/server.ts` | Forwards `env.DB` as `context.cloudflare.env`. See §1 — deleting either breaks all D1 access. |

### Store slice map — `apps/web/app/store/`

Zustand, composed in `index.ts`:

| Slice | Owns |
|---|---|
| `playerSlice` | playback state, per-track resume `positions`, `peaksCache`, `durations`, `hasError`/`playbackBlockedReason`, and the offline playback gate (`canFetchPlaybackBytes`, `wasServedFromIdb`) |
| `offlineSlice` | downloads, `activeDownloadId`, IDB-backed saved-set state, failure classification |
| `catalogueSlice` | live catalogue fetched over the static snapshot |
| `uiSlice` | transient UI state |

`index.ts` persists a `partialize`d subset to localStorage: `nowPlayingId`,
`positions`, `peaksCache`, `durations`, PWA install booleans. **Never persist
`MusicSet` objects** — only IDs, rehydrated via
`getCatalogueSet(catalogueSets, id) ?? getSet(id)`. A persisted object is a
migration hazard the moment the shape changes; an ID isn't. `deferredPrompt` is
excluded deliberately — non-serializable event object.

`isPlaying` is the control surface for external components; `useAudioPlayer`
bridges it to `audio.play()`/`audio.pause()`.

### API route shape

TanStack Start v1.167 has no `createAPIFileRoute`. Use `createFileRoute` with a
`server: { handlers }` option:

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

A route with only `server.handlers` and no `component` is a pure endpoint — the
router never tries to render it.

### Two editing traps in `packages/ui`

- **Don't mix `vi.fn()` with Storybook's `fn()`.** `storybook/test`'s `fn()` bundles its own `@vitest/spy` — a structurally different `Mock` type from the workspace's `vitest` — so passing a local `vi.fn()` as a prop override on a composed story fails `tsc` confusingly. Assert against the mock the story already made: `composeStories(stories).Secondary.args.onClick`.
- Interaction tests run stories through plain Vitest + jsdom via `composeStories`, **not** the Storybook test-runner or `addon-vitest` — both need a real browser, and a second browser-install surface is an avoidable failure mode in this repo (see the Playwright cache rule in §1).

## 5. Commands

```bash
pnpm install                      # all workspaces
pnpm dev                          # both apps — web :5173, admin :5174
pnpm dev:web / dev:admin          # one app
pnpm build / build:web / build:admin
pnpm start / start:web / start:admin   # serve production build — web :4173, admin :4174
pnpm test                         # unit, all workspaces
pnpm test:web / test:admin / test:design-system
pnpm test:e2e / test:e2e:web / test:e2e:admin
pnpm check                        # Biome (whole repo) then turbo tsc
pnpm lint / pnpm tsc / pnpm knip
pnpm storybook                    # packages/ui Storybook, :6006
```

Everything except `check`/`format`/`knip` is a thin Turbo wrapper; `:web`/`:admin`
variants add a `--filter`. For a workspace's own scripts: `pnpm -C apps/web <script>`.

`apps/web` scripts — `send-push`, `optimize-images`, `og`, `sitemap`,
`screenshots`, `stats`, `deploy` — are documented with every flag in
`apps/web/scripts/README.md`. `og`, `sitemap` and `optimize-images` run
automatically inside `pnpm build`.

**Service-worker behaviour is testable only against a production build.** The dev
server never registers a SW (Vite's dev transform emits no `sw.js`):

```bash
pnpm build:web && pnpm start:web   # :4173, real service worker
```

### Tests
- `apps/web/tests/unit/` — Vitest + jsdom, one folder per concern: `store/`, `hooks/`, `components/`, `utils/`, `data/`, `routes/`, `scripts/`.
- `apps/web/tests/e2e/` — Playwright, four projects (chromium, webkit, mobile-chrome, mobile-safari). Mocks `*.mp3` with a silent fixture.
- `apps/web/tests/setup.ts` — jest-dom matchers + `HTMLMediaElement` stubs (jsdom doesn't decode audio).
- `playwright.config.ts` uses `workers: 1` — Vite's dev server races on parallel route loads.
- Click handlers calling `playTrack` rely on the module-level `audioEl` ref in `playerSlice.ts`; register a fake element with `registerAudioElement()` in `beforeEach`.
- Conventions and how to add one: `apps/web/tests/README.md`.
- `packages/ui/vitest.setup.ts` wires jest-dom and calls `installDialogPolyfill()` — the polyfill itself is `packages/ui/src/domPolyfills.ts` (jsdom implements no `HTMLDialogElement.showModal()`).

### CI/CD
- **`ci.yml`** on push (non-main) + PR. Jobs: `static` (per-workspace Biome lint for `apps/web`, `apps/admin`, `packages/ui`, `packages/data`, plus `turbo tsc` across all four, plus a Vite build of both apps), `knip`, `unit` (all four workspaces), `chromatic` (visual regression for `packages/ui`), `e2e` (Playwright on chromium + webkit for both apps).
- **`deploy.yml`** on push to `main`, plus manual `workflow_dispatch`. Re-runs `static`/`unit`/`e2e`, then `deploy` and `deploy-admin` only if all pass — a direct push to `main` can't skip the suite. Deliberately **not** `chromatic`, which stays PR-only to avoid roughly doubling snapshot quota.
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CHROMATIC_PROJECT_TOKEN`.

### First run
`pnpm dev` generates `apps/web/app/routeTree.gen.ts` (TanStack Router code-gen).
Gitignored; regenerates on every dev start.

---

## 6. Other docs

- **`README.md`** — project overview and the engineering narrative. What an outside reader sees first.
- **`PWA_PROGRESS.md`** — decision log for phased work. Records what was tried and **rejected**, with on-device verification steps. Check when resuming multi-session work. Dated entries describe the state at that time and are correct as history — don't "fix" them to match the present.
- **`TECH_DEBT.md`** — debt tracker with open / **❌ invalid** / deferred / resolved status. `❌ invalid` means the premise turned out wrong on investigation. Check before working in an area that may already have a logged caveat.
- **`IMPROVEMENTS.md`** — product backlog, shipped vs. open, including features deliberately removed and not to be re-proposed.
- **`apps/web/scripts/README.md`** — every build/ops script and flag.
- **`apps/web/tests/README.md`** — test conventions.
- **`apps/web/images-source/README.md`** — the image pipeline; what to drop where and what gets committed.
- **`AGENTS.md`** — a pointer here for agents that don't read `CLAUDE.md`.
