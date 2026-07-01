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

### Pre-deploy polish

- **`offline.html` visual pass** (TECH_DEBT 7) — currently functional-minimal;
  needs a typographic + terminal-aesthetic pass to match the rest of the
  site. Zero-bundle constraint applies (no external CSS/JS, inline `<style>`
  only). **This is the last item before the deploy gate.**

### Open bugs found in testing (2026-07-01) — pending diagnosis

Two bugs surfaced during the chunk-5 verification pass that are NOT yet
fixed. Both have their own diagnosis plans; documented here so a fresh
session can pick either up cold.

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
  if `!ctxIsApp` MUST short-circuit to `return fetch(cleanReq)` before
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

### Retry-storm gate

Lives in `playerSlice.playTrack` BEFORE `audio.src` is set: if
`!navigator.onLine && offlineSetState !== "saved"`, refuse to attach src +
surface via `PlaybackErrorToast`'s `playbackBlockedReason:
"not-saved-offline"` branch. Fixes TECH_DEBT 11 at its source — `<audio>`
never gets a source it can't fetch, so it can't hammer the network.

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
