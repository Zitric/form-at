# Phase 4 — PWA / Offline progress

Session-resumption note. If a session breaks mid-implementation, read this +
the relevant TECH_DEBT entries + the last commit on
`transform-the-web-app-in-a-pwa` and you have everything needed to continue.

Authoritative reference for design decisions: `IMPROVEMENTS.md` (product),
this file (engineering state), `TECH_DEBT.md` (engineering follow-ups —
status-at-a-glance section at the top of that file).

---

## Branch status — core PWA + offline work is COMPLETE

All planned Phase 4 chunks are committed and verified through the real UI.
The branch is ready for an eventual PR to `main`; what's left is lower-
priority polish + the deploy gate, not feature work.

| Chunk | Status | Commit | Notes |
|-------|--------|--------|-------|
| 1 — SWR navigations + offline fallback | ✅ committed | `1d76211` | `pages-v1` SWR + `offline.html` + activate cache-clear |
| 1.5 — Offline navigation (loader fallback + route-data SWR) | ✅ committed | `10811a4` | Layer A: `defer(fetchOverallStats().catch(() => null))` on `/sets/`. Layer B: SWR for `GET /_serverFn/*` in `route-data-v1`, NOT cleared on activate (URLs build-hashed) |
| 1.6 — Warm `artwork-v1` on save | ✅ committed | `50bb7d0` | `warmArtwork()` fires 4 variants (`640/1080 × avif/webp`) fire-and-forget after IDB commit. Saved sets render complete offline on `/sets/$setId` + FullPlayer |
| 2 — Artwork runtime SWR | ✅ committed | `aa6f9f9` + paperwork `3cd1dd3` | `artwork-v1` SWR, unbounded (TECH_DEBT 8) |
| 3a — Audio read-path SW handler | ✅ committed | `335f29d` | `workbox-range-requests`, R2 hostname matcher, originally Cache Storage |
| 3b — IDB-backed audio download + offline slice | ✅ committed | `b428c58` + paperwork `f62343c` | `idb` dep, `offline-audio.ts` wrapper, `offlineSlice`, `OfflineReconciler`, SW swapped to IDB read |
| 3c — UI: button state machine + retry-storm gate + size hint | ✅ committed | `718ead3` | Closed out TECH_DEBT 11 (retry storm). HEAD-free download via Option B (TECH_DEBT 15 captures the HEAD mystery) |
| Waveform — gold-progress freeze | ✅ committed | `da90a12` | TECH_DEBT 10. Preexisting bug, not Phase 4 — fixed during the cleanup pass before PR. `filter` moved off the width-animated layer |
| Waveform — load flick | ✅ committed | `e2b5f57` | TECH_DEBT 9. Preexisting bug. Three-state render (pending spacer / Waveform / fallback) eliminates first-play widget swap + height jump |
| 4 — List-card save-for-offline icon button | ✅ committed | `7649abc` | Compact icon button in the card action slot (floppy / progress ring / check / red retry). Shares state with `SaveForOfflineButton` via new `useOfflineDownload` hook. Saves directly from `/sets/` without opening detail; closes the chunk-1.6 warming story through the card path |
| 5 — Strict standalone gate (web/app divide) | ✅ committed | `fbbdd4d` | `useInstallCapability` → `useSaveGate`, `InstallPromptModal` → `SaveGateModal`. Tabs NEVER read IDB; standalone-only `?ctx=app` URL marker (`withAppContext`) drives the SW audio handler. Three-branch modal (needs-install / open-app / cannot-install) with mutual escape-hatches via the persisted `pwaInstalled` positive-only signal. PlaybackErrorToast gains a `tab-offline-needs-network` reason. |
| 5.1 — Chunk-5 regression: cross-track loop | ✅ committed 2026-07-01 | `<pending>` | Chunk 5 wrapped both `audio.src` writes AND the `useAudioPlayer` src-match comparison in `withAppContext`. Under specific cross-track transitions (saved A → non-saved B → back to A) Chrome's browsed URL round-trip diverged marginally from the JS-constructed URL, the `===` compare flipped false, useAudioPlayer set src → load → the click-path play() promise raced the bridge effect → infinite request + play/pause loop. Confirmed via Network panel showing alternating `?ctx=app` / bare URL requests. Fix: replaced URL string comparison with an identity stamp — `audio.dataset.trackId = track.id` written at BOTH src-assignment sites (playerSlice.playTrack click path + useAudioPlayer restore path), effect compares `audio.dataset.trackId === nowPlaying.id`. Immune to URL normalization and to the `?ctx=app` marker. Chunk-5 marker-in-URL is still what the SW read-path keys on; only the JS-side comparison stopped depending on URL equality. |
| 5.2 — Chunk-5 regression: unified offline gate (closes TECH_DEBT 11 fully) | ✅ committed 2026-07-01 | `<pending>` | The retry-storm gate (chunk 3c, `718ead3`) sat in the NEW-TRACK branch of `playerSlice.playTrack` only. The same-track branch had no gate, so re-tapping a paused non-saved set offline (play online → pause → offline → tap same set) bypassed the gate: `<audio>` retried the failing Range dozens of times = the storm the gate was built to prevent. Not a new chunk-5 regression per se — the gap existed since chunk 3c — but surfaced during chunk-5 testing. Fix: single unified gate BEFORE the same-track/new-track split; blocks starting OR resuming a track when `isOffline && offlineStatus !== "saved"`, still permits pausing a currently-playing same-track (`audio.pause()` never fetches). Three new tests in `playerSlice.test.ts` lock: (a) non-saved same-track resume blocked, (b) saved same-track resume allowed, (c) pause of a stalled non-saved stream still works. Old new-track-only gate removed — subsumed. |
| 5.3 — Chunk-5 regression: SW CORS mode preservation | ✅ committed 2026-07-01 | `<pending>` | Chunk 5 rebuilt the R2 request as `new Request(cleanUrlString, { method, headers })`. `new Request()` init defaults `mode: "cors"`, silently flipping `<audio>`'s native `mode: "no-cors"` (media element cross-origin default per HTML spec) to cors. R2's ACAO doesn't satisfy the CORS check for MP3 Range GETs → browser blocked the response → three non-saved sets failed to stream online from the standalone app; only the saved set (served from IDB, no fetch) played. Fix: preserve `mode`, `credentials`, `redirect` from the original `request` when constructing `cleanReq`. MP3 stays no-cors (opaque response — safe, both `return fetch(cleanReq)` paths pass through without inspecting), peaks JSON stays cors (transparent — the JS caller `.json()`s it). `createPartialResponse` operates only on the synthetic IDB-hit Response, never on the network fetch, so opaque doesn't affect Range slicing. |
| 4.5 — Beacon queue (Background Sync) | deferred — polish | TECH_DEBT 4 | Independent infra, lower stakes |

---

## What's actually left

Engineering-wise, the branch is shippable. Items below are the punch list:

### Launch blockers before wider release

Items that MUST land before a public / wider-audience release. A small
trusted-friends test can proceed without these — they only bite at
launch-scale concurrency.

- **[LAUNCH BLOCKER] Move audio off the R2 public dev URL onto a custom
  domain** (TECH_DEBT 19) — MP3s + peaks currently serve from
  `pub-e15e86da649d4c91b6666141bfe67664.r2.dev`, which Cloudflare
  explicitly warns is rate-limited and NOT recommended for production
  ("Connect a custom domain to the bucket to support production
  workloads"). At launch-scale concurrent traffic (many friends hitting
  play at once via an Instagram announcement) the dev URL's rate limit
  can throttle audio requests → broken playback for some users at
  exactly the worst moment. Fix scope (Cloudflare custom domain +
  hostname-audit code change) is documented in TECH_DEBT 19. CORS is
  already fine; the constraint is purely rate-limit / production
  recommendation. **Block wider announcement until this ships.**

### Pre-deploy polish

- **`offline.html` visual pass** (TECH_DEBT 7) — currently functional-minimal;
  needs a typographic + terminal-aesthetic pass to match the rest of the
  site. Zero-bundle constraint applies (no external CSS/JS, inline `<style>`
  only). **This is the last item before the deploy gate.**

### Open items from testing (2026-07-02) — pending verification

- **[VERIFY] Layout regression pass on normal content pages** — the
  2026-07-02 sticky-footer fix added `min-h-dvh flex flex-col` to
  `<body>` (`routes/__root.tsx`), `flex-1 flex flex-col` to BOTH
  SwipeNavigator wrappers (outer div + inner translated div), and
  `flex-1` to PageLayout's `<main>`. Only the status pages
  (NotFoundPage + offline.html) were visually verified. Pages to
  eyeball for regression before the wider deploy:
  - `/` (home) — has its own `sm:justify-center` on a content-sized div,
    should be a no-op but confirm no shift on desktop.
  - `/sets` — usually content-tall, but a short filter result could
    reveal empty-space-at-bottom.
  - `/djs/$djId` — the `<div className="flex-1">` at line 60 was a no-op
    before; now consumes real space. Watch for stretched content on DJs
    with short bios / few sets.
  - `/events/$eventId` — same `<div className="flex-1">` pattern
    (`$eventId.tsx:48`).
  - `/sets/$setId` — same pattern (`$setId.tsx:127`).
  - Swipe-between-tabs on mobile — SwipeNavigator's inner translated div
    gained `flex-1 flex flex-col`; horizontal `translateX` gesture
    transforms should be unaffected, but a real gesture test confirms.
  If a page looks stretched or misaligned, the fix is scoped to the
  three files above — no other consumer references these flex chains.

### Fixed 2026-07-02 (PM) — mobile install/save UX, pending on-device re-test

Four Android field-testing bugs (Chrome / Brave / Opera), diagnosed and fixed
in code with unit coverage; the fixes need one on-device confirmation pass.

- **[FIXED] First-visit: install CTA + diskette buttons invisible until
  reload.** Root cause was NOT the SW and NOT primarily the
  `beforeinstallprompt` race: zustand v5's persist calls
  `merge(undefined, current)` when the storage key doesn't exist (every true
  first visit), our `merge` destructured it unconditionally → TypeError →
  swallowed by persist's internal `.catch` → `hasHydrated` never flipped →
  everything gated on `useStoreHydrated()` (InstallCta, save buttons,
  OfflineReconciler) hidden all session. Any store write during the visit
  created the key, which is why a reload "fixed" it — and why Brave (prior
  visit, key present) worked immediately. Guard: `store/index.ts` merge
  returns `current` when nothing persisted; `onRehydrateStorage` now logs
  rehydration errors so this failure class can't be silent again. Locked by
  `tests/unit/store/persistRehydrate.test.ts`.
- **[FIXED] `beforeinstallprompt` race (secondary cause of the same
  symptom).** Chromium fires the event once per page load, on slow first
  visits before React hydrates. An inline head script in `__root.tsx` now
  stashes it on `window.__deferredInstallPrompt`;
  `components/InstallEventsListener.tsx` adopts the stash on mount (see the
  Reference section below). Locked by
  `tests/unit/components/InstallEventsListener.test.tsx`.
- **[FIXED] Opera Android: modal promised a menu item that doesn't exist.**
  Opera's UA carries `Chrome/` → classified "chromium", but it never fired
  `beforeinstallprompt` and its ⋮ menu had no install entry. Could not verify
  from code/standards what current Opera Android actually supports, so the
  manual-instructions branch of `SaveGateModal` no longer promises any
  specific menu item — it names the likely labels ("install app" / "add to
  home screen") and says plainly the browser may not support installing,
  pointing at Chrome. If Opera DOES fire the event post-stash-fix, it gets
  the native install button and never sees this copy.
- **[FIXED] Install CTA popped in with no entrance animation.** It mounts
  late by design (when the prompt event arrives) and had no animation of its
  own — `prefers-reduced-motion` was ruled out (global.css uses the 0.01ms
  duration trick, end states still land). Now wears the app-standard
  `animate-fade-in`.

On-device re-test script (fresh profile = clear site data first):

1. **Chrome, fresh profile:** first visit → diskettes visible without reload;
   install CTA fades in when Chrome delivers the prompt; CTA tap → native
   dialog.
2. **Chrome, revisit:** same, faster; no flash of missing buttons.
3. **Brave, fresh profile:** previously untested-fresh — expect same as
   Chrome fresh.
4. **Opera, fresh profile:** diskettes visible; diskette tap → modal shows
   EITHER the native install button (Opera fired the event — report back,
   we'll upgrade the copy) OR the hedged manual copy with no false menu
   promise.
5. **Any browser:** after install, CTA gone, modal switches to open-app
   branch; standalone gate unchanged (tab still streams, never reads IDB).

### Fixed 2026-07-03 — pre-friends-test review items (N1, M2, M4, quick wins)

- **N1 — manifest identity FROZEN.** `manifest.json` now has `"id": "/"`
  with the analytics marker moved to `"start_url": "/?source=pwa"`.
  **`id` must never change again** — it is the app's permanent identity;
  changing it re-identifies the app for new installs and orphans update
  paths. This landed BEFORE any friends-test installs, which is the only
  window it could. (Standalone launches now request `/?source=pwa`, a
  distinct `pages-v1` key from `/` — self-populates via SWR per launch.)
- **M2 — download failure taxonomy.** `classifyDownloadFailure` in
  `offlineSlice.ts`: `QuotaExceededError` → `quota` (IDB write backstop),
  `RangeError` → `quota` (the 100MB+ buffer preallocation failing on a
  constrained device — RAM not disk, but the user-side fix matches quota
  and retry fixes neither), everything else non-abort → `network`. The
  quota button label + `QuotaInfoModal` copy degrade to number-free text
  when the shortfall is unmeasurable (write-time hit — no pre-flight math).
- **M4 — `navigator.storage.estimate` guarded.** Missing on older WebKit /
  some WebViews; the pre-flight is skipped there and the IDB write is the
  backstop (correctly classified per M2).
- **Quick wins:** precache revisions are now content md5 instead of mtime —
  proven by building twice with touched mtimes and diffing the extracted
  manifests (identical, 11 non-hashed entries); dead `index.html` allowlist
  line removed (SSR emits none); `useTriggerDownload`'s silent UNKNOWN_SET
  branch dev-warns.

Remaining from the review's next-PR plan: M1 (playback-gate centralization —
next session), M3 (`_headers` + CSP, bundled with TECH_DEBT 19's custom
domain), N3 (maskable icon check), N4 (set-card extraction, backlog).

### Fixed 2026-07-02 (evening) — review follow-ups H1 + H2, pending on-device checks

Both items from the post-merge review's next-PR plan, shipped as two commits.

- **[FIXED — H1] SW pass-through dropped the `Range` header.** Diagnosis
  outcome: spec-derived, NOT locally reproducible — Node's undici does not
  implement the `request-no-cors` header guard (demonstrated: `Range`
  survives a no-cors `new Request()` in Node), so only a real browser shows
  the drop. The Fetch spec is unambiguous (no-CORS-safelisted headers only:
  accept / accept-language / content-language / content-type; Range isn't
  one). Fix: both SW pass-through paths now forward the ORIGINAL request —
  `fetch(request)` — never a rebuilt one; the `?ctx=app` marker is stripped
  only for the IDB key (`stripAppContext` in the worker-safe
  `utils/appContext.ts`). Verified with curl against the live bucket that R2
  ignores the marker (same 200 body) and honors Range with it present (206).
  The 5.3 no-cors regression cannot recur by construction — nothing is
  rebuilt anymore.
  **On-device check (needs prod build + SW active, standalone or tab):**
  play a long set (e.g. Form:at 002 — t.i.l., ~100MB), let it buffer, then
  seek to ~70%. DevTools → Network → the `.mp3` request fired by the seek.
  PASS: status `206 Partial Content` with a `Range: bytes=N-` request
  header. FAIL: status `200` and a full-size transfer restarting from byte 0.
- **[FIXED — H2] `skipWaiting` replaced with user-consented update flow.**
  SW no longer self-activates over old clients; it waits, the page shows the
  gold "new build · tap to reload" toast (`UpdateToast` → `useSwUpdate`),
  tap posts `SKIP_WAITING`, and only the consenting tab reloads on
  `controllerchange` (first-install claims don't reload — guarded).
  Decisions locked: toast is deferred while a set download is in flight
  (reload would abort it); other open tabs do NOT auto-reload (no consent —
  they accept the same stale-chunk risk as before, now bounded by an
  explicit user action). E2E is scoped out honestly: the dev server
  Playwright boots never serves the SW, so the flow is unit-tested against
  a mocked `navigator.serviceWorker` only.
  **On-device check:** load the app (prod), deploy any change, wait ~1min or
  reload-once to let the browser's update check run → gold toast appears
  above the player chrome → tap → single reload → new build live. Confirm
  NO toast and NO reload on a genuinely first visit.

### Open bugs found in testing (2026-07-01) — CLOSED 2026-07-02 (evening)

Both diagnosed with scripted browser experiments against the production
preview (SW active, port 4173) — full RCA in TECH_DEBT 17 + 18 (both now
`✅ Resolved`). Short version:

- **Tab-plays-IDB:** the gate is intact (proven: seeded IDB is unreachable
  from a tab, reachable with `?ctx=app`). The heard bytes were the browser
  HTTP cache / media-element buffer — standard layers outside the chunk-5
  lock. One real fix shipped: the blocked first tap was silent
  (`PlaybackErrorToast` required `nowPlaying`, which the gate sets before a
  track attaches); now blocked reasons render without a track. Product
  decision recorded: HTTP-cache replay in tabs is accepted (see the chunk-5
  reference section below).
- **`/sets` offline nav:** not reproducible on the current build — SPA nav
  (cold cache), doc reload (pages-v1), cold doc nav (offline.html by
  design), and detail nav all verified working offline. Likely original
  cause: a stale pre-chunk-1.5 client (the hazard H2's update flow now
  addresses) or the SW-not-yet-controlling first-visit window.

The original entries below are kept for the diagnosis-plan history.

- **[BUG, priority] Web offline plays a downloaded set** — violates the
  chunk-5 core rule (web NEVER reads IDB, even for a set that IS downloaded
  in the app). From a browser tab, offline, a downloaded set currently
  plays from IndexedDB — it must not. Web must always stream from network
  and never touch IDB. Possibly related to the `?ctx=app` marker
  evaluation in the SW handler OR to the chunk-5.3 CORS-mode fix (though
  that only touched the network fallback, not the IDB read decision).
  Diagnosis needed: trace why the SW serves from IDB for a tab request
  when no `?ctx=app` should mean pure network pass-through. Check
  `sw.ts` audio handler line-by-line: `ctxIsApp = url.searchParams.get("ctx") === "app"`;
  if `!ctxIsApp` MUST short-circuit to `return fetch(request)` (post-H1) before
  IDB is consulted. Verify that path is actually taken for tab-origin
  requests (and that `withAppContext` in a tab really returns bare URLs).
- **[BUG] Web offline can't navigate to `/sets`** — offline navigation to
  `/sets` fails in a tab. Separate system from the audio read-path
  (playback vs route data). Likely a precache or `route-data-v1` SWR
  issue, not chunk 5. Diagnosis needed: check `pages-v1` has an entry
  for `/sets/`; check `route-data-v1` has the `_serverFn` response for
  the sets loader; check whether the failure is at the HTML fetch or
  at the loader's `fetchOverallStats`. Chunk 1.5 wraps `fetchOverallStats`
  in `.catch(() => null)` so a failed server-fn shouldn't reject the
  route — verify that's still in place.

### Cosmetic backlog — pre-PR polish, no dependencies between items

Batchable in any order; none block the deploy gate on their own but
worth landing before PR to main so the first public build is polished.

- **Toast redesign** (three toasts: PlaybackErrorToast, generic Toast,
  any other bracketed toast surface) — remove the `[ ]` brackets from
  toast MESSAGE text (keep on close `[ x ]` only), remove the vertical
  separator between message and close, make the entire toast surface
  click-to-dismiss. Also fixes the iPhone SE 2-line wrap caused by the
  current message-plus-separator-plus-close width budget.
- **Web-offline message unification** — from the web tab, offline, a
  downloaded-in-the-app set shows `[ playback_error :: tap to retry ]`
  while a non-downloaded set shows `[ ✗ playback needs connection — open
  the app to listen offline ]`. Both should show the "open the app"
  message: from the web, downloaded vs not doesn't matter because the
  web can't touch IDB either way. Fold both into `tab-offline-needs-network`
  reason at the playerSlice gate level.
- **SaveGateModal escape-hatches close the modal instead of switching
  message** — "already installed? open it from your home screen" and
  "not installed? install the app" links currently close the modal
  after flipping `pwaInstalled`. Should instead re-render the modal
  with the OTHER case's copy, so the user sees the confirmation of
  what they self-reported. Only close on the actual close button or
  successful install prompt.
- **DJ page image doesn't load unless navigated-to-first** — the
  `<Image>` component on `/djs/$djId` fails to load the artwork on
  direct visit; requires a prior visit to `/sets/` or `/` to warm
  something (probably the image cache or the `Image` component's
  intersection observer). Needs its own repro + fix.
- **Set card abstraction — DJ page card vs `/sets/` card unification**
  — the set list on `/sets/` and the "played by this DJ" list on
  `/djs/$djId` currently render very similar cards via two different
  component paths. Consolidate into one reusable `SetCard` component.
  Needs its own plan (props shape, action-slot semantics, artwork
  variant selection) before implementation.

### Deferred — post-2026-07-24 (coupled, ship together)

- **Manage offline sets view** — list of saved sets with remove + storage
  totals. The slice + `removeOfflineSet` are wired (chunk 3c), so this is
  pure UI. **Earned its place later**: at 4 sets, the per-card save-icon
  state (chunk 4) already gives at-a-glance management of what's saved;
  the dedicated view starts paying off once the catalogue grows past
  ~10-15 sets where scanning every card becomes a chore. Revisit after
  the next batch of sets lands (target: post 2026-07-24).
- **TECH_DEBT 16 — orphan artwork prune** — currently warmed `artwork-v1`
  variants are NOT cleaned up on `removeOfflineSet`. The correct prune
  algorithm (union of `artwork` paths across saved sets, drop the rest)
  naturally lives inside the manage-view's remove flow. **Ship the prune
  with the manage view, not before.** Standalone earlier would duplicate
  the iteration logic.

### Validation deferred until access exists

- **iOS memory-peak validation** (TECH_DEBT 12) — download a large set on
  an installed iOS PWA, watch for tab crashes / 2× heap spike. Mitigation
  plan (chunk-store streaming) is documented but only ship it if iOS
  reproduces the issue.

### Lower-priority follow-ups

- **TECH_DEBT 4** — Phase 4.5 beacon queue (offline play counts).
- **TECH_DEBT 8** — `artwork-v1` bounds (`workbox-expiration`) — only if
  storage pressure observed.
- **TECH_DEBT 13** — orphan offline entries when `sets.ts` ever gains an
  "archived" status. Speculative; current auto-purge is correct.
- **TECH_DEBT 14** — Brandon Lee Vear R2 object has `.mp3.mp3`. Cosmetic.
- **TECH_DEBT 15** — browser-side HEAD against R2 fails mysteriously.
  Sidestepped by Option B; only chase if a future feature needs HEAD.
- **TECH_DEBT 16** — orphan artwork prune. Coupled with the deferred manage
  offline sets view above; not a standalone item.

### Deploy gate

- **R2 CORS verification** (TECH_DEBT 5) — one-curl confirm CORS allows
  `formatglasgow.com` for GET/HEAD before merging to `main`.
- **PR to main** — once polish landed (or explicitly skipped) and CORS
  confirmed. CI is already gated (`ci.yml` + `deploy.yml`).

---

## Reference — key design decisions locked in this branch

### Cache lifecycle on activate

- **Cleared on activate** (cross-deploy safety): `pages-v1`, legacy
  `audio-v1` Cache Storage residue. Reason: cached HTML can reference
  purged hashed JS chunks → hydration risk.
- **NOT cleared on activate** (stable URLs, deploy-keyed or content-keyed):
  `artwork-v1`, `route-data-v1`, IDB `audio-v1`. Reason: no JS coupling,
  wiping per-deploy would erase offline access to recently-visited content
  — wrong direction. Stale entries either content-hashed (go inert
  naturally) or self-replace via SWR.

### Storage choice — audio in IDB, everything else in Cache Storage

- **IDB (`audio-v1`):** large blobs (MP3 + peaks JSON), 100s of MB per set.
  Decision driven by iOS WebKit's documented quirks with large Cache
  Storage blobs. Synthetic `Response` built at SW read time satisfies the
  same Range-slicing contract as a native Cache Storage Response — see the
  "chunk-3 §3 contract" comment in `sw.ts`.
- **Cache Storage (`artwork-v1`, `pages-v1`, `route-data-v1`):** KB-MB
  text/image responses. SWR via Workbox routes is the canonical writer for
  each — never `cache.open().put(...)` from app code (would drift the
  cache-name + response-shape contract).

### Save gate — strict standalone rule (chunk 5)

The `save_for_offline` flow fires download ONLY when running in standalone
display-mode (`matchMedia('(display-mode: standalone)').matches ||
navigator.standalone === true`). Every browser tab — including a tab on a
device where the PWA is installed — opens `SaveGateModal` instead.

Why "standalone" not "installed": iOS WebKit's 7-day ITP eviction rule
exempts standalone PWAs but not plain Safari tabs, so in-tab downloads would
evaporate; equally important, an "installed but currently in a tab" session
should behave like the web (stream, no IDB read) so the web/app divide is
coherent. The matching playback-side signal is the `?ctx=app` URL marker
appended by `withAppContext` only in standalone — the SW audio handler in
`sw.ts` reads it and serves from IDB only when present.

`pwaInstalled` (persisted) is a POSITIVE-ONLY signal used by the modal to
pick "open it from your home screen" (case b) vs "install the app" (case a).
`SaveGateModal` includes mutual escape-hatches so a misclassified user can
flip themselves into the right case manually.

**Scope of the lock (decided 2026-07-02, TECH_DEBT 17):** the lock governs
IDB/download exclusivity — tabs never read IDB, proven by experiment. It
does NOT govern the browser HTTP cache: a set streamed online in a tab may
replay offline from disk cache through the SW's `fetch(request)`
pass-through. That's standard browser caching, outside SW control short of
`cache: "no-store"` (rejected — it would degrade normal online streaming
for no exclusivity gain). Not a violation; documented so nobody re-files it
as a bug.

### Retry-storm gate

Lives in `playerSlice.playTrack` BEFORE `audio.src` is set: if
`!navigator.onLine && offlineSetState !== "saved"`, refuse to attach src +
surface via `PlaybackErrorToast`'s `playbackBlockedReason:
"not-saved-offline"` branch. Fixes TECH_DEBT 11 at its source — `<audio>`
never gets a source it can't fetch, so it can't hammer the network.

### SW network pass-through — always `fetch(request)` (2026-07-02, H1)

The SW audio handler NEVER rebuilds a Request for the network. Two incidents
locked this: chunk 5.3 (rebuild defaulted `mode: "cors"`, browser blocked R2
MP3s) and H1 (even a mode-preserving rebuild silently drops `Range` under
the Fetch spec's request-no-cors header guard → seeks got 200 full-body
instead of 206). The `?ctx=app` marker is stripped only to derive the IDB
key; on the standalone IDB-miss path the marker reaches R2, which is
verified harmless (R2 resolves by path; Range honored with the marker).
Marker protocol lives in `utils/appContext.ts` (worker-safe: `sw.ts` imports
it and type-checks under WebWorker libs; `withAppContext` stays in
`utils/audioUrl.ts` because it needs `window`).

### SW update flow — user-consented skipWaiting (2026-07-02, H2)

The SW has NO unconditional `skipWaiting()`. Pattern:

1. New build installs → sits in `waiting` (old clients keep their precache,
   so their lazy route chunks stay servable).
2. `useSwUpdate` detects it (both `registration.waiting` at mount and
   `updatefound` → `statechange` while open; "installed + has controller"
   distinguishes an update from a first install).
3. `UpdateToast` shows "new build · tap to reload" — deferred while a set
   download is in flight.
4. Tap → `postMessage({ type: "SKIP_WAITING" })` → SW calls
   `self.skipWaiting()` → `controllerchange` → ONLY the tab that requested
   the swap reloads (guarded ref; first-install `clientsClaim` also fires
   controllerchange and must not reload).

`clientsClaim()` stays in the SW: first install has no old clients, and it
makes offline capability live without a reload. Detection uses
`navigator.serviceWorker.ready` (not `getRegistration()`) because the
inline registration script runs on window `load`, potentially after the
hook mounts.

### `beforeinstallprompt` capture — pre-hydration stash (2026-07-02)

Chromium fires `beforeinstallprompt` ONCE per page load, and on a slow first
visit it fires while the bundle is still downloading — before any React
effect can attach a listener. Pattern locked in this branch:

1. Inline head script in `__root.tsx` (runs pre-bundle) does
   `e.preventDefault()` and stashes the event on
   `window.__deferredInstallPrompt`.
2. `components/InstallEventsListener.tsx` adopts the stash into the Zustand
   store on mount, and keeps a live listener for events that fire later.
3. The stash is cleared on consumption (`useTriggerInstallPrompt` — the
   event is single-use) and on `appinstalled`, so a remount can't re-adopt
   a dead event.

The property name is duplicated between the inline script string and
`utils/installPromptStash.ts` (which owns the `declare global` typing) —
keep them in sync. Do NOT move the capture back into a React effect.

### First-visit persist rule (2026-07-02)

zustand persist calls `merge(undefined, current)` when localStorage has no
key — `merge` implementations MUST handle a missing persisted payload
(return `current`). A throw inside `merge` is swallowed by persist and
silently prevents `hasHydrated` from ever flipping, hiding every
`useStoreHydrated()`-gated surface for the whole session.
`onRehydrateStorage` in `store/index.ts` now logs rehydration errors;
`tests/unit/store/persistRehydrate.test.ts` locks the first-visit path.
(Test-infra corollary: Node 25's broken `localStorage` global used to shadow
jsdom's in vitest — `tests/setup.ts` now installs a working in-memory
Storage, which is what lets persist be tested at all.)

---

## How to resume

If a session breaks mid-task:
1. `git log --oneline -10` on `transform-the-web-app-in-a-pwa` to confirm
   where HEAD is.
2. `git status` — any working-tree files from a partial change are
   recoverable; just read them.
3. Re-read the relevant TECH_DEBT entry (top-of-file glance section shows
   open vs resolved) and the file map above.
4. Continue from whichever file is incomplete.

Dev (`pnpm dev`, port 5173) does NOT serve the SW. All PWA / offline
testing is production-preview only:

```bash
pnpm --filter @form-at/web build
pnpm --filter @form-at/web start   # port 4173, real Chrome
```

The command is `pnpm start`, not `pnpm preview` (which doesn't exist).
