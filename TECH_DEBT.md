# Form:at — Tech Debt

Engineering-side cleanup and infrastructure items deferred from active work. Product feature ideas live in `IMPROVEMENTS.md`; this file is for code-quality, tooling, and refactor debt only.

Each item is written to be picked up cold — no conversation context required.

## Status at a glance

- **Launch blockers:** none open (19 resolved 2026-07-06 — audio on cdn.formatglasgow.com)
- **Open:** 8, 12, 13, 15, 22, 23 (verification debt — a partially cleared 2026-08-18, b and c still fully unexercised), 27 (offline click-through has no e2e coverage; needs a production-build Playwright project)
- **Deferred, recorded rather than done:** 24 (DJ/event data model still static while sets are in D1), 25 (no-cross-app-imports unenforced), 26 (`PWA_PROGRESS.md` too large to be readable)
- **Invalid:** 1 (2026-07-22 — premise was wrong, not stale: both flagged functions are load-bearing behind a live multi-provider calendar picker; do not delete, see item for the full re-verification)
- **Deferred:** 14 (Brandon Lee Vear `.mp3.mp3` — R2 has no rename op, cosmetic, no re-visit condition); 16 (orphan artwork prune, coupled — waits for the deferred manage-offline-sets view, real trigger is ~10-15 sets in the catalogue, not a calendar date; see item for why that arrives faster now)
- **Resolved:** 2 (2026-07-22 — knip.json config + parallel CI job; see item for a correction to its own original plan), 3 (2026-07-23 — `__root.tsx` split into `fontCSS.ts` / `HydrateStore.tsx` / `rootHead.ts`), 4 (2026-07-23 — beacon queue + Background Sync, with a page-side fallback for Safari/Firefox), 6 (2026-06-28, `10811a4`), 7 (2026-07-02, `d2bbc36` — offline.html redesign, stamped during the 2026-07-06 docs cleanup), 9 (2026-06-29, `e2b5f57`), 10 (2026-06-29, `da90a12`), 11 (fully resolved 2026-07-01 — initial fix `718ead3` 2026-06-27, same-track branch closed 2026-07-01), 17 (2026-07-02 — gate proven intact via SW-preview experiments; observed bytes were HTTP cache / element buffer, not IDB; silent-blocked-tap toast fixed), 18 (2026-07-02 — not reproducible on current build; all three offline nav modes verified against the SW preview), 5 (absorbed into 19's verification — CORS re-checked on the custom domain 2026-07-06: preflight GET/HEAD + range, ACAO *, Content-Length exposed), 19 (2026-07-06 — audio on cdn.formatglasgow.com, host centralized in `@form-at/data/sets` since item 21's sweep, IDB force-re-download migration in reconcileFromIdb), 20 (2026-07-31 — superseded by the admin dashboard shipping and then moving to its own app, apps/admin), 21 (2026-08-04 — import sweep to `@form-at/data`, four shim files reduced to two deleted + two trimmed to their genuinely-local code)

Resolved items keep their original section in place with a `✅ Resolved` stamp at the top, so the historical context (cause + fix path) stays readable. Search for `✅ Resolved` to skip to / past them.

---

## 1. Delete dead code flagged by knip

**❌ INVALID — re-verified 2026-07-22, do NOT delete.** This item's premise
was wrong, not just stale. Re-grepping before touching anything (as this
entry's own "Verification" note below asked) found real callers:
`buildGoogleCalendarUrl` is called by `buildGoogleCalendarTargetUrl`
(`ics.ts:99`), and `buildOutlookCalendarUrl` by
`buildOutlookCalendarTargetUrl` (`ics.ts:127`) — both wrappers exported and
imported directly by `AddToCalendarButton.tsx:8`, which renders an actual
multi-provider picker modal (`google` / `outlook` / `apple · .ics`,
`AddToCalendarButton.tsx:41-98`) — the exact UI this entry's "why
deprecated" claimed doesn't exist and isn't planned. The 2026-06-24 knip
audit's "zero callers outside `ics.ts`" was technically true (the direct
callers ARE inside the file) but missed that those in-file callers are
themselves the load-bearing indirection knip can't see through in this
shape — deleting either function would have broken live `google`/`outlook`
add-to-calendar links in production. Original text kept below for context,
per this file's stamp convention.

**Scope:** one file — `apps/web/app/utils/ics.ts`.

Remove the two exports:

- `buildGoogleCalendarUrl` (currently around line 81)
- `buildOutlookCalendarUrl` (currently around line 105)

**Why deprecated:** `AddToCalendarButton` downloads a direct `.ics` file. There is no multi-provider calendar picker in the UI and none is planned. Both functions have zero callers outside `ics.ts` itself (verified by grep during the 2026-06-24 knip audit).

**Do NOT delete** `Text` / `Heading` / `Muted` from `apps/web/app/components/Text.tsx`. Knip flags them as unused exports, but they are an intentional design-system surface kept for future use. They get silenced in knip config (item 2 below), not deleted.

**Verification:** `pnpm check` (lint + tsc) + `pnpm test:run` must stay green. Grep for any new callers before deleting in case something landed in the meantime.

---

## 2. knip.json + CI placement

**✅ Resolved 2026-07-22.** `pnpm knip` verified exiting 0 locally with the
config in place, and a parallel `knip` job added to `.github/workflows/ci.yml`
alongside `static`/`unit`/`e2e` (per-PR check, not a pre-commit hook, per
this item's own instruction below).

**Correction to this item's own scope line:** a per-app `apps/web/knip.json`
was NOT created — by the time this was picked up, a ROOT-level `knip.json`
already existed using knip's `"workspaces"` map (covering `.`, `apps/web`,
and `packages/tsconfig`). Empirically verified (not assumed) that knip
completely ignores a per-workspace `knip.json` file once a root config
defines that workspace via `"workspaces"` — creating one had zero effect on
the findings. The two config lines below were instead merged into the
existing root config's relevant workspace blocks: `entry: ["app/sw.ts!"]`
into `apps/web`'s existing `entry` array, `ignoreBinaries: ["ffmpeg"]` into
the **`.` (root) workspace**, not `apps/web` — `scripts/generate-peaks.mjs`
(the ffmpeg caller) lives at the repo root's `scripts/`, not
`apps/web/scripts/`.

**Additional findings beyond this item's original two-line snippet** (real
`pnpm knip` output on re-verification, not anticipated when this item was
written):
- `Text` / `Heading` / `Muted` (the design-system surface this item's item-1
  neighbor explicitly says to keep exported, not delete) — silenced by
  marking `apps/web/app/components/Text.tsx!` as an additional knip `entry`
  file. Verified against knip's docs: entry files are excluded from
  "unused exports" reporting by default — the intended, documented
  mechanism for "this whole file is a public surface," not a workaround.
- Six more exports/types flagged as "unused" for the exact same reason item
  1's `buildGoogleCalendarUrl`/`buildOutlookCalendarUrl` were (genuinely
  used, but only by other code in the SAME file — knip correctly flags an
  export nothing outside the file imports, even when it's not actually
  dead). Unlike items 1's pair, these six had no documented reason to stay
  part of the public surface, so each had its `export` keyword removed
  instead (zero behavior change — confirmed via grep that nothing outside
  each file referenced them by name; `pnpm check` + full test suite stayed
  green): `openOfflineAudioDb` (`offline-audio.ts`), `OfflineAudioKind`
  (`offline-audio.ts`), `NOT_SAVED` (`useOfflineDownload.ts`),
  `PlaybackBlockedReason` (`playerSlice.ts`), and `ToastVariant`
  (`ToastShell.tsx`, new this session).

**Scope:** ~~create `apps/web/knip.json` (per-app, not repo-root)~~ — see
correction above; then wire knip into CI.

### Minimum config to clear the known false positives

```json
{
  "entry": ["app/sw.ts!"],
  "ignoreBinaries": ["ffmpeg"]
}
```

Why each line:

- `entry: ["app/sw.ts!"]` — the service worker is registered by the browser at runtime via `navigator.serviceWorker.register(...)`, never imported by any ES module. Knip can't see it and flags both the file AND its imports (`workbox-core`, `workbox-precaching`) as unused. The `!` suffix tells knip "this is an intentional entry, don't second-guess it." Single line fixes three knip findings (1 unused file + 2 unused devDependencies).
- `ignoreBinaries: ["ffmpeg"]` — `scripts/generate-peaks.mjs` shells out to system `ffmpeg`. It's a system tool (like `git`), not an npm package. Without this, knip emits an "unlisted binaries" warning every run.

**The `icons/` barrel needs NO rule.** Knip 6 follows re-export chains correctly; the barrel + all six icon re-exports were not flagged during the audit. Verified empirically.

### CI placement

Add knip as a **per-PR check**, parallel to the existing `static` / `unit` / `e2e` jobs in `.github/workflows/ci.yml`. New job runs `pnpm knip`.

**Do NOT** add it as a pre-commit hook. Reason: slow hooks get disabled the moment they get in the way of a fast commit, defeating the point. PR-level cadence fits the many-commits-one-PR flow already in use.

**Verification:** `pnpm knip` exits 0 locally with the config in place; the new CI job passes on a clean PR.

---

## 3. `__root.tsx` extraction

**✅ Resolved 2026-07-23.** Re-verified this entry's own claims fresh before
touching anything (per this week's repeated stale-doc lesson): `RootNotFound`
and `InstallEventsListener` really were already gone, and nothing else had
snuck into the file since — every remaining import was a real component
being rendered, not a new inline definition (checked all of `AppLaunchTracker`,
`BottomNav`, `Header`, `InAppBrowserBanner`, `OfflineReconciler`, `ShareModal`,
`SwipeNavigator`, `Toast`, `UpdateToast`, `PlaybackErrorToast`, `Player`).

Extracted the remaining three, following this codebase's existing
module-organization conventions rather than inventing a new one:
- `fontCSS` → `styles/fontCSS.ts` (matches `styles/{tokens,layout,z}.ts`'s
  existing style-constant convention)
- `HydrateStore` → `components/HydrateStore.tsx` (matches the established
  invisible-mount-effect-component shape already used by
  `InstallEventsListener.tsx` / `OfflineReconciler.tsx` / `AppLaunchTracker.tsx`)
- The `head()` config → `utils/rootHead.ts`, exporting `rootHead()` — sits
  next to its sibling `pageHead()` in `utils/head.ts` rather than being
  merged into it (different shape: static config vs. parameterized builder;
  merging would have been a consolidation the constraints explicitly forbid)

Verified byte-for-byte before wiring the import back in — extracted the
object literal into `rootHead()`'s return value, then diffed it
programmatically against the original inline object (not by eyeballing):
identical except the necessarily-different closing token
(`}),` → `};`). The `beforeinstallprompt` inline script's
`window.__deferredInstallPrompt` property name — the one piece required to
stay in sync with `utils/installPromptStash.ts` — carried over unchanged;
confirmed via the same diff and re-confirmed in the rendered dev-server
HTML.

One necessary compile-time-only fix, not a behavior change: extracting the
object literal into a standalone function lost TypeScript's contextual
typing, widening a couple of DOM-attribute literals (`fetchPriority: "high"`,
`crossOrigin: "anonymous"` ×3) to plain `string`. Restored with `as const`
on each — purely a type annotation, the runtime string values are identical
either way.

**Verification:** baseline established BEFORE touching anything (not trusting
the stale "137" figure this entry was written with) — `pnpm test:run` was
already at 325/325 and e2e at 62 passed / 6 skipped on top-of-main; both
held at the exact same counts after the extraction. `pnpm check` green.
Manual smoke test in a real dev server: fetched the rendered HTML directly —
`fontCSS`'s `@font-face` block present in the inlined `<style>` tag, both
head scripts present byte-for-byte (SW registration + the
`beforeinstallprompt` stash with its exact property name), the 404 page
renders correctly for an unknown route ("SIGNAL_LOST"). Store hydration
verified via the e2e suite's real-browser test (`sets.spec.ts`'s "first
visit: save-for-offline buttons appear without a reload" — the actual
regression lock for a broken `HydrateStore`), since a raw HTML fetch can't
execute the client-side hydration effect that stamps `data-hydrated`.

---

## 4. Phase 4.5 — Beacon queue (offline play counts via Background Sync)

**✅ Resolved 2026-07-23.** Re-verified this item's own premise fresh first
(`useAudioPlayer.ts`'s `sendPlay`, read in full): still exactly as described
— fires `navigator.sendBeacon("/api/signal", ...)` on pause/ended/unload
after 3+ seconds, no retry path, a failed beacon was simply lost. Built the
queue + both replay paths described below.

**Shape, following this codebase's existing conventions rather than
inventing new ones:**
- `data/beacon-queue.ts` — IDB wrapper mirroring `offline-audio.ts`'s exact
  pattern (module-level `dbPromise` singleton, private `openBeaconQueueDb()`,
  plain async CRUD). Exports `queueSignalForReplay(payload)` (enqueue +
  best-effort Background Sync registration), `getQueuedSignals()`,
  `dequeueSignal(id)`, and `replaySignalQueue()` (the actual replay logic,
  exported so it's unit-testable rather than living inline in `sw.ts` —
  same split this week's other SW work already established for
  `buildNotificationOptions`/`resolveNotificationClickUrl`).
- `useAudioPlayer.ts`'s `sendPlay` — reuses the exact `navigator.onLine`
  check `canFetchPlaybackBytes` (`playerSlice.ts`) already uses. Known-offline
  at call time, or `sendBeacon` returning `false` (browser rejected queuing
  it) → `queueSignalForReplay` instead of dropping. The online-succeeds
  happy path is untouched — same `sendBeacon` call, same Blob shape.
- `sw.ts` — a `"sync"` event listener calling `replaySignalQueue()` inside
  `event.waitUntil()`. Verified against MDN before writing anything (same
  rigor as this week's badge/notification-options work): `sendBeacon` is
  Window-only (confirmed absent from `WorkerNavigator`) — the SW replay
  path uses `fetch` instead. TypeScript's bundled lib doesn't define
  `SyncManager` / `ServiceWorkerRegistration.sync` / `SyncEvent` at all
  (checked directly against the installed package, same class of gap as
  the Notification options fields found this week) — declared locally via
  `declare global` augmentation + a module-local `SyncEvent` interface,
  rather than reaching for `any`.
- **Fallback for browsers without Background Sync — real coverage gap, not
  an edge case.** Verified against caniuse (2026-07-23): Safari (desktop
  AND iOS) and Firefox do not support Background Sync at all — ~77%
  global support, Chromium-only in practice. `components/BeaconQueueFlusher.tsx`
  (mirrors `OfflineReconciler.tsx`'s invisible-mount-effect shape) replays
  the queue via `sendBeacon` on mount (if online) and on the `online`
  window event — covers reopening the app after being offline, and
  connectivity returning while the app stays open. This is the pragmatic,
  justified degradation: it can only replay while a tab is open, but
  that's the best available without Background Sync.
- No UI surfaced anywhere, per this item's own scope note.

**Tests:** `beacon-queue.test.ts` — a REAL IndexedDB round-trip (added
`fake-indexeddb` as a new devDependency specifically for this, since no
existing test exercises real IDB — every other IDB-backed module's
consumers mock `~/data/offline-audio` at the module boundary instead, and
this item's own verification note explicitly wants a queue that "is then
empty" after replay, not a mocked assertion of it) — enqueue/read/dequeue,
the Background-Sync-registration best-effort path (present/absent/
unsupported), and `replaySignalQueue`'s fetch-based replay (success,
non-ok, network failure, multiple entries replayed independently). Found
and fixed a real test-authoring bug along the way: deleting the whole fake
database between tests blocked forever (`onblocked`, not
`onsuccess`/`onerror`) because nothing ever closes the cached connection —
same as `offline-audio.ts`'s deliberate pattern. Fixed by draining the
queue via the module's own `dequeueSignal` instead of deleting the
database. `useAudioPlayerBeaconQueue.test.tsx` locks `sendPlay`'s three
branches (online success / known-offline / sendBeacon-rejected).
`BeaconQueueFlusher.test.tsx` locks the fallback's mount + `online`-event
replay, including that a still-failing entry stays queued.

**Not testable in the existing harness, flagged rather than forced:** the
actual `self.addEventListener("sync", ...)` wiring in `sw.ts` — same
jsdom-harness gap documented repeatedly this week for every other SW
handler. On-device check: seed the queue while offline (e.g. airplane
mode mid-playback), reconnect, confirm a real `/api/signal` request fires
and D1 receives it, and the queue is then empty — this item's own original
verification wording, now the literal on-device check since the mechanics
above are unit-tested up to the SW boundary.

---

## 5. R2 CORS verification — pre-chunk-3 check

**✅ Absorbed into item 19 (2026-07-06).** The check was re-run against the
custom domain `cdn.formatglasgow.com`: preflight 204 with GET/HEAD + range
allowed, `access-control-allow-origin: *`,
`access-control-expose-headers: Content-Range,Accept-Ranges,Content-Length`.

_Original entry (kept for context):_

Before Phase 4 chunk 3 (audio download write-path) lands, confirm the R2 bucket `pub-e15e86da649d4c91b6666141bfe67664.r2.dev` allows CORS reads from the PWA origins: production `formatglasgow.com` and dev `http://localhost:4173`. Streaming a 64MB MP3 with client-side `fetch` requires permissive CORS; a mid-chunk-3 CORS surprise would mean a detour to bucket settings.

Quick check (one of the URLs from `apps/web/app/data/sets.ts`):

```bash
curl -H "Origin: https://formatglasgow.com" -I \
  "https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/002/Form_at%20002%20-%20t.i.l.mp3" \
  | grep -i "access-control"
```

Pass: `Access-Control-Allow-Origin` header is present and matches the origin (or is `*`). `Content-Length` is a CORS-safelisted response header so we don't need explicit exposure for the quota pre-flight HEAD.

Fail: no ACL headers → configure CORS in Cloudflare dashboard → R2 → bucket → Settings → CORS Policy. Allow `https://formatglasgow.com` and `http://localhost:4173` for `GET` and `HEAD`.

**Verification:** the curl check above returns ACL headers covering both origins.

---

## 6. Chunk 1.5 — Offline navigation for client-side click-through (polish)

**✅ Resolved 2026-06-28 in `10811a4`.** Two-layer fix shipped as Phase 4 chunk 1.5: (Layer A) `/sets/` deferred loader wraps `fetchOverallStats()` with `.catch(() => null)` so offline click-nav degrades to the designed `null` fallback instead of rejecting; (Layer B) new SW route caches `GET /_serverFn/*` with StaleWhileRevalidate in `route-data-v1`, NOT cleared on activate (URLs build-hashed → stale entries go inert naturally). Two-set collision check at gate time confirmed the `/_serverFn/<hash>` URLs differ per input, so no `cacheKeyWillBeUsed` plugin needed. Diagnosis + design preserved below for context.

---

**Scope downgraded after the 2026-06-25 hard-reload test.** Direct visits and reloads of previously-visited detail pages render cleanly offline — confirmed empirically. This works because:

1. `pages-v1` SWR caches the SSR'd HTML for document navigations.
2. `/sets/$setId` has `staleTime: 5 * 60 * 1000` so the loader doesn't refire on hydration within 5 minutes.
3. The loader does `await fetchSetStats({...}).catch(() => null)`, so even if the loader does refire (post-staleTime), the server-fn failure degrades gracefully — stats become `null` and the page renders without play counts rather than throwing.

What's still broken offline: **client-side navigation (link click between routes)**. TanStack Router invokes the destination route's loader on the client, which calls `createServerFn` via `fetch("/_serverFn/<hash>")`, which fails with `ERR_INTERNET_DISCONNECTED`. The navigate-mode SW route never sees these fetches because they're not `request.mode === "navigate"`.

**Status:** polish, NOT blocker. Users can still reach any previously-visited route offline by reload or typed URL. Phase 4 audio chunks (2/3) ship first — saved sets that play offline is the valuable outcome, and it's no longer gated behind this work.

**Real work involved when picked up:**

1. Identify the request shape TanStack Start uses for `_serverFn` calls — URL pattern (`/_serverFn/<hash>`), method, headers, body encoding.
2. Pick a runtime cache strategy — likely SWR against a new `route-data-v1` cache paralleling `pages-v1`.
3. Verify offline rehydration: TanStack Router's loader must consume the cached response correctly, not bail to the error boundary.
4. Decide cross-deploy invalidation — `route-data-v1` is per-deploy so the same `activate`-clear pattern as `pages-v1` likely applies, but check whether the `<hash>` in the `_serverFn` URL is already deploy-keyed (in which case stale entries can be left to expire naturally).

---

## 7. Polish `offline.html`

**✅ Resolved 2026-07-02** (`d2bbc36`, "Re design the Offline page and the not found page"). Verified against the current file (`apps/web/public/offline.html`): terminal-prompt status line (`› offline`, gold prompt / white value), the wordmark treatment mirroring `Header.tsx`'s crop + `mix-blend-mode: screen`, bracketed CTA buttons matching the design system, and the zero-bundle constraint fully preserved (inline `<style>` only, no Tailwind, no external CSS/JS). The description below predates the redesign and is stale — kept for the constraints list, which is still the correct spec for any future edit to this file.

_Original entry (kept for context):_

`apps/web/public/offline.html` is currently a functional-minimal fallback page — inline `<style>` block, no Tailwind, no JS. That's deliberate and must stay: the file has to render with **zero dependencies on the app bundle**, because it's served exactly when the bundle is unavailable.

What's missing is a proper visual pass to match the Form:at aesthetic — typographic hierarchy, the terminal-CLI feel of the rest of the site, maybe a small inlined pixel-F SVG logo. Currently it's just text plus a retry button.

**Constraints to preserve:**

- No `<script src="...">` to external JS.
- No `<link rel="stylesheet" href="...">` to external CSS.
- No Tailwind class names (Tailwind output is in the precached `assets/*.css` chunks, but we don't want offline.html to depend on the precache working — the offline fallback shouldn't itself need the precache).
- Inline `<style>` block in `<head>` only.
- Fonts may reference `/fonts/space-mono-400.woff2` etc. (precached), but the page must degrade via `font-family` fallback to system mono if for any reason the font request fails.

**Verification:** visual review against the rest of the site at desktop + iPhone SE widths. Offline test that the page still renders correctly with the precache cleared (Application → Clear site data, then trigger a navigation failure) — the only thing that should be missing is the Space Mono font; everything else must work.

---

## 8. `artwork-v1` cache bounds — add `workbox-expiration` if storage pressure observed

Phase 4 chunk 2 (2026-06-25) ships artwork runtime SWR against an `artwork-v1` cache with **no expiration policy** — entries accumulate without explicit bound. Justification: each variant is a few KB to a few hundred KB; rough ceiling is ~50 sets × 4 variants × ~200 KB ≈ 40 MB, well within typical per-origin quota. Browser storage-pressure eviction handles the long tail.

**When to act:**

- User reports of artwork failing to load alongside other quota-exhaustion symptoms.
- DevTools storage panel shows `artwork-v1` over ~100 MB in real usage.
- Either signal: add `workbox-expiration` as a `plugins` entry on the existing artwork route in `apps/web/app/sw.ts`, with `maxEntries: 200` and `maxAgeSeconds: 90 * 24 * 60 * 60` as starting bounds. Tune from telemetry.

**Don't act prematurely:** premature bounds churn the cache (LRU eviction triggers re-downloads), which is worse for offline reliability than letting the cache grow naturally.

---

## 9. Waveform flick on load

**✅ Resolved 2026-06-29 in `e2b5f57`.** Root cause: PlayerSeeker's two-branch render (`peaks.length > 0 ? Waveform : <input>`) collapsed "fetch in flight" and "fetch failed" into one fallback path, so the native slider rendered during the peaks-JSON RTT (~50–300ms on first-ever play) and then jumped ~30px in height when the canvas mounted. Fix: added a `peaksFetchState: "pending" | "ready" | "failed"` local state; render branch is now 3-way: Waveform when peaks are loaded, native `<input>` only when there's no peaks URL or fetch genuinely failed, otherwise an invisible 56px-tall `flex-1` spacer that reserves the layout. Kills both the widget swap and the height jump in one move. Diagnosis + fix preserved below for context.

---

**Preexisting bug, affects production** (predates Phase 4). When a set starts playing, the player briefly shows the simple progress bar before the waveform component renders — a flash of fallback content while the waveform JSON loads and computes.

**Scope:** investigate how the waveform component decides to mount the real waveform vs the fallback bar. Likely a brief window between "currentSrc set" and "peaks data ready" where the fallback wins. Fix: either reserve the layout space so the waveform pops in without moving siblings, or hold the fallback state explicitly until the waveform is mount-ready (no race).

**Verification:** start playing a fresh set on a slow network throttle (DevTools → Network → Slow 3G). The transition should be visually stable — no flash, no layout shift.

---

## 10. Waveform gold progress doesn't advance

**✅ Resolved 2026-06-29 in `da90a12`.** Root cause: a browser compositing quirk. The clip div that animates its width (`clipRef.current.style.width = "X%"` on every timeupdate) also carried `filter: drop-shadow(...)`. `filter` creates a paint layer keyed to the filtered element's geometry; on some loads the browser doesn't re-rasterize the layer when its width changes, so the visible gold stays frozen at its first-paint state (0%). Toggling the filter in DevTools forced a one-shot repaint that masked the bug after first load — that intermittency was itself the proof. Fix by construction: moved the `filter` onto a new STATIC outer wrapper (`position: absolute; inset: 0; pointerEvents: none`) whose dimensions never change; the inner clip div stays plain `overflow: hidden` with the width animation. The filter's compositing layer is now stable, descendants repaint via standard child-paint invalidation, and the trigger condition (filter + width change on same element) is structurally absent. Diagnosis + fix preserved below for context.

---

**Preexisting bug, NOT chunk-3 related.** Reported by a real user — happens online AND offline. The gold "played" overlay on the waveform stays at 0% even though audio is playing and the time counter advances normally.

**Scope:** investigate how the waveform receives `currentTime` / `duration` from the audio element, and how it computes the gold proportion. Likely candidates:
- Stale closure in a `useEffect` capturing the initial 0 value.
- Missing subscription to player state updates (Zustand subscribe vs static read).
- Audio element's `timeupdate` event not propagating to the waveform.
- The gold-overlay width style isn't reading from the right state.

**Verification:** play any set, watch the gold portion grow with playback progress, both online and offline. Should also track seek operations.

---

## 11. Audio retry storm on offline playback of unsaved sets — chunk 3c UX gate

**✅ Fully resolved 2026-07-01** (see PWA_PROGRESS chunk 5.2 for the second-phase fix commit). Initial fix landed 2026-06-27 in `718ead3` (Phase 4 chunk 3c): if `!navigator.onLine && offlineSetState !== "saved"`, refuse to attach `audio.src` in the new-track branch of `playerSlice.playTrack`. **Second-phase fix 2026-07-01**: chunk-5 verification surfaced that the gate protected only the NEW-TRACK branch — the same-track branch (re-tap a currently-loaded but paused non-saved set) bypassed it, so `<audio>` still hammered the failing Range dozens of times. Restructured `playTrack` with a single unified gate BEFORE the same-track/new-track split; blocks starting OR resuming a track when offline+not-saved, still permits pausing (`audio.pause()` never fetches). Three new gate tests in `playerSlice.test.ts` lock the invariant so a future refactor can't drop one branch again. Diagnosis + fix preserved below for context.

---

When the user attempts to play a NOT-saved set while offline, the `<audio>` element retries the failed MP3 fetch dozens of times — dozens of `net::ERR_FAILED` requests pile up in the Network panel. The SW read-path (chunk 3a) correctly passes through to network and fails; the symptom is at the player layer, where `<audio>` hammers the failed source.

**This is NOT a chunk 3a bug to fix in the SW.** The read-path is doing its honest job (no cache → network → fail). The fix belongs at the UI layer in chunk 3c, before users can trigger the situation in the first place.

**Chunk 3c gate:** when the user taps `play_set` on a set whose offline state is not `saved`, AND `navigator.onLine` is false, show a clear message — `[ ✗ not saved for offline listening ]` — and DO NOT attach the source to the `<audio>` element. The retry storm only happens if the element is given a source it can't fetch. Refuse to set `audio.src` in that case; surface the reason inline.

**Verification:** offline, attempt to play an unsaved set. UI shows the "not saved" message, no `net::ERR_FAILED` requests in Network panel, no audio element activity.

---

## 12. Audio download memory peak — iOS validation pass

Chunk 3b (2026-06-26) ships `startDownload` with a deliberate memory-peak-reduction design: preallocate `new Uint8Array(bytesTotal)`, write chunks into it at offset, wrap once in `new Blob([buffer], { type })`, drop the buffer reference before the IDB put. This avoids the obvious anti-pattern (accumulating a `Uint8Array[]` then `new Blob(chunks)` while keeping the array alive) which would peak at ~2× total bytes sustained.

Residual ambiguity: `new Blob([Uint8Array])` may alias or copy at the engine's discretion. Chrome/V8 aliases in practice; WebKit's behaviour at the time of writing is not documented either way. Worst case during the Blob wrap step is one transient additional copy (~total bytes) before the buffer reference is dropped — that's ~2× peak briefly, vs. ~1× steady.

**When to act:** the moment any iOS access exists (real iPhone, iOS Simulator on the Mac, BrowserStack — whichever comes first), download a large set (e.g. Brandon Lee Vear ~150 MB) on an installed iOS PWA and watch for:

- Tab crash / "A problem repeatedly occurred" Safari dialog.
- Web Inspector → Memory tab showing a JS heap spike near 2× the file size during the download.
- Silent `unhandledrejection` from `startDownload` with no `failed` state transition.

If any of those reproduce, the mitigation is to stream chunks directly into IDB (one IDB `put` per chunk into a parallel chunk store), reassembling at SW-handler read time. Significant complexity (~+100 lines, chunk reassembly in the handler, schema migration). Defer until empirically required.

**Don't act prematurely:** the preallocation already eliminates the obvious double-allocation. Adding chunk-store complexity without measured iOS evidence would trade real maintenance burden for a hypothetical fix.

---

## 13. Orphan offline entries for catalogue-removed sets — behaviour locked, may want UI later

`reconcileFromIdb` (chunk 3b) handles three IDB-vs-state cases:
1. Persisted-saved entry that's still in IDB → confirm `saved` state.
2. Persisted-saved entry whose IDB blobs are gone → transition to `evicted`.
3. IDB entry with no persisted state → adopt as `saved` (orphan recovery).

There's a fourth case the current code handles silently with auto-purge: **IDB entries whose `setId` is no longer in the catalogue**. Reconciliation deletes both the MP3 and peaks blobs in a single readwrite transaction, removes the entry from state, and `console.warn`s the purged set IDs. Rationale: if the catalogue doesn't list the set, no UI path exists for the user to play it offline — keeping ~100 MB of blobs is dead storage.

**Update (2026-08-04) — the catalogue this checks against changed shape, the auto-purge rule didn't need to.** When this was written, "the catalogue" meant the hand-maintained `sets.ts` array. Since the admin set-upload feature (2026-08), it's `catalogueSlice.ts`'s `catalogueSets` — a live-wins merge (`mergeSets`) of the D1 `sets` table and the build-time snapshot, gated by `catalogueConfirmed` so this purge can't fire against an unconfirmed/failed boot fetch (see `offlineSlice.ts`'s `reconcileFromIdb` and `catalogueSlice.ts`). The auto-purge logic itself is unchanged and still correct against the new source. **This item's hypothetical fourth case is no longer hypothetical**: PR6 (2026-08) added a real admin delete endpoint, so "a set the user saved offline gets removed from the catalogue" is now a real, reachable path, not just a future "archived status" feature. The precise delete timeline (why it doesn't purge immediately, why the union in `mergeSets` means the deploy boundary is what actually matters) is traced in full in `PWA_PROGRESS.md`'s PR6 entry — read that alongside this item before touching either.

**When to revisit:** if the catalogue ever gains an "archived" status (set hidden from listings but technically still in the catalogue, distinct from admin-deleted), the auto-purge rule needs revising to NOT purge archived sets. At that point, either:
- Filter `getSet()`/`getCatalogueSet()` to exclude archived from listings but include from reconciliation lookups, OR
- Surface orphans in a "Manage offline sets" view (Phase 4 polish, item 16 below) instead of auto-purging, giving the user a "this set is no longer in the catalogue — remove from library?" prompt.

Current behaviour is intentional and load-bearing; this entry exists so a future "archived sets" feature (or the already-shipped admin delete) doesn't accidentally get treated as a bug.

---

## 14. Brandon Lee Vear R2 object has a double `.mp3` extension

**Deferred indefinitely (2026-07-06, Julian's call).** R2 has no rename
operation — the dashboard only offers download + re-upload of the 292MB
object — and the item is purely cosmetic (playback works; the SW matches on
`.endsWith(".mp3")`, which `.mp3.mp3` passes). The TECH_DEBT 19 host sweep
kept the `.mp3.mp3` keys, now on the new host. If the rename ever happens,
`reconcileFromIdb`'s URL-validation guard (added for 19) automatically
flips affected saved sets to `evicted` — no extra migration code needed;
play stats are keyed by `set_id`, not URL (`api/signal.ts`, `schema.sql`),
so stats survive any rename.

_Original entry (kept for context):_

`apps/web/app/data/sets.ts` references the MP3 + peaks for the Brandon Lee Vear set with a stuttered extension in the URL path:

```
https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/002/Form_at%20002%20-%20Brandon%20Lee%20Vear.mp3.mp3
https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/002/Form_at%20002%20-%20Brandon%20Lee%20Vear.mp3.json
```

The R2 object itself was uploaded with the wrong name (`.mp3.mp3` instead of `.mp3`). Cosmetic — playback and download work fine because the SW matches on `.endsWith(".mp3")` which still passes. Discovered during chunk 3c CORS diagnosis (and ruled out as the cause: the t.i.l. set has a clean URL and failed identically).

**Fix when convenient:** rename the R2 object (Cloudflare R2 dashboard → bucket → rename, or re-upload and delete the old key), then update the `src` and `peaks` URLs in `sets.ts` to match. Out of scope for chunk 3 work — does not affect any user-visible behaviour.

**2026-07-05 attempt — blocked on credentials.** The local wrangler OAuth
token had NO R2 scopes (`r2 object get` → 403 Authentication error; the
token's grants cover containers/email/browser only). The dashboard-rename
path (download 292MB → re-upload under a clean key → update `sets.ts` →
delete the old key) was drafted but never executed.

**2026-07-06 — Julian's call: deferred indefinitely, not just blocked.**
R2's dashboard has no in-place rename regardless of credentials (only
download + re-upload of the 292MB object), and the item is cosmetic with no
user-visible impact. Not worth the bandwidth. The `.mp3.mp3` keys stay on
the new `cdn.formatglasgow.com` host (TECH_DEBT 19). Revisit only if a
reason to touch this object comes up for other reasons.

---

## 15. Browser `fetch(url, { method: "HEAD" })` against R2 fails with `net::ERR_FAILED`

Discovered during chunk 3c verification. The pre-3c-Option-B `startDownload` did a HEAD pre-flight for size + quota math. The HEAD fails in Chrome at `http://localhost:4173` with `net::ERR_FAILED` + "No 'Access-Control-Allow-Origin' header is present", **despite** R2 being correctly configured:

- `curl -X HEAD -H "Origin: http://localhost:4173" <r2-url>` returns `200 OK` with `Access-Control-Allow-Origin: *` and `Vary: Origin`.
- `curl -X OPTIONS ... -H "Access-Control-Request-Method: HEAD"` returns `204` with `Access-Control-Allow-Methods: GET, HEAD`.
- The browser request shows `Provisional headers are shown` in DevTools, meaning the request fails before getting a response — not a CORS rejection on the response side.

**Mitigation in place (chunk 3c Option B):** the download flow no longer uses HEAD at all — quota pre-flight reads the `sizeBytes` hint from `sets.ts`, buffer preallocation reads `Content-Length` from the streaming GET response. The mystery is sidestepped, not solved.

**When to revisit:**
- If we ever want to add a server-fresh size read for the UI (e.g., to validate `sizeBytes` is in sync), HEAD is the natural primitive — we'd need to figure out the browser failure first.
- Likely candidates: a Chromium-specific privacy filter, a corporate proxy injecting headers that bump it out of "simple request" territory, or an interaction with R2's `Vary: Origin` caching that Chrome handles differently than curl.

**Update (2026-08-04) — new evidence narrows this to browser-only.** The admin set-upload feature (PR4, 2026-07) added `verifyR2ObjectsExist` (`apps/admin/app/routes/api/sets.ts`), which does exactly this — a plain `fetch(url, { method: "HEAD" })` against the same public R2 CDN URLs — and it works without issue, because it runs server-side in the Cloudflare Worker, not a browser tab. That's a real data point, not a guess: the failure mode here is specifically a browser-context thing (this item's own candidates — Chromium privacy filter, proxy header injection — are consistent with that), not an R2/CORS config problem, since the identical request shape succeeds reliably from a Worker.

Not blocking anything currently. Filed for visibility.

---

## 16. Orphan artwork in `artwork-v1` after offline-set removal

Chunk 1.5 follow-up (2026-06-28) ships `warmArtwork` inside `startDownload`: after the audio IDB commit + `saved` state transition, the four `<Image>` variants for `set.artwork` (`640.avif`, `1080.avif`, `640.webp`, `1080.webp`) are fetched fire-and-forget so the artwork-v1 SWR route populates them. Result: a saved set renders complete offline on both `/sets/$setId` and the FullPlayer, even if the user never visited those pages online first.

The symmetric path is NOT implemented: warmed variants stay in `artwork-v1` when `removeOfflineSet(setId)` runs, and likewise when reconciliation auto-purges a catalogue-orphaned set. Intentional for three reasons:

1. **Variants are KB-scale.** Per-set warm is sub-1MB. The orphan cost is bounded and tiny.
2. **The same `artwork` path is shared across sets.** All four shipping sets use `artwork: "sets/002"`, so per-set deletion is ambiguous — removing variants for one would break offline display for another saved set sharing the path. NOT deleting isn't just simpler, it's more correct.
3. **The opportunistic SWR path repopulates** on next online visit anyway, so the worst-case offline experience for a removed-then-re-saved set is one online visit away from being right.

**When to revisit:** coupled with the deferred "Manage offline sets" view (PWA_PROGRESS.md, `IMPROVEMENTS.md` #8 Phase 4, item 13 below) — the prune algorithm (sweep `artwork-v1` by computing the union of `artwork` paths across currently-saved sets and dropping anything outside that set) naturally lives inside the manage-view's remove flow. Ship the prune with the manage view; standalone earlier would duplicate the iteration logic. **Real trigger, not a calendar date:** both items earn their place once the catalogue grows past ~10-15 sets — a fixed "post-2026-07-24" target was written here and in PWA_PROGRESS.md before that date, and has since passed with the catalogue still at 4 sets, so it's dropped in favour of the actual condition. **That condition now arrives faster than either doc originally assumed**: `apps/admin` shipped a self-serve upload form (PR4, 2026-07) after this item was written, so hitting ~10-15 sets is gated on upload cadence, not an engineering task — check the live count (`packages/data/src/sets.generated.ts`, or the admin sets list) rather than assuming it's still 4.

---

## 17. [BUG, priority] Web offline plays a downloaded set from IDB — violates chunk-5 core rule

**✅ Resolved 2026-07-02 (evening) — misattribution + one real fix.** Diagnosed
against the production preview (SW active) with scripted browser experiments:

- **The chunk-5 gate is intact.** Tab context, offline, IDB seeded with a fake
  entry for a set URL: bare-URL fetch fails (`Failed to fetch` — SW passed
  through to the dead network, never touched IDB); the same URL with `?ctx=app`
  returned the seeded IDB bytes. Tabs cannot read IDB by construction
  (`sw.ts` audio handler, post-H1).
- **The bytes the tester heard were NOT from IDB.** Two standard non-IDB
  sources exist: (1) the browser **HTTP disk cache** — proven live: content
  streamed online in a tab is served offline with a 200 straight through the
  SW's `fetch(request)` pass-through (equally true of the old `cleanReq`
  path); (2) the **media element's own buffer** for same-track re-taps, which
  the 2026-07-02 unified gate has since blocked at tap time (remaining
  ungated resume paths = review item M1, queued).
- **One real bug found and fixed:** the blocked first tap was SILENT —
  `PlaybackErrorToast` required `nowPlaying`, but the gate fires before any
  track attaches. Fixed (blocked reasons render without a track), unit-tested,
  and verified in the SW preview: offline tab tap now shows "open the app to
  listen offline".
- **Product decision (Julian to confirm):** HTTP-cache replay in a tab is
  accepted as standard browser behavior outside the chunk-5 lock — the lock
  governs IDB/download exclusivity, not the HTTP cache. Forcing
  `cache: "no-store"` would degrade normal online streaming for no
  exclusivity gain. Documented in PWA_PROGRESS chunk-5 reference.

_Original entry (kept for context):_



Discovered during chunk-5 verification (2026-07-01). From a browser tab, offline, a set that IS downloaded in the standalone app currently plays from IndexedDB when tapped. This violates the chunk-5 lock: **tabs never read IDB**, even for a set present in this origin's storage. Web must always stream from network; offline in a tab means playback fails, not falls back to IDB.

The intended path (per `sw.ts` audio handler + `withAppContext`): in a tab, `isStandalone()` returns false, so `withAppContext(url)` returns the bare URL (no `?ctx=app` marker). SW handler reads `ctxIsApp` via `stripAppContext(url)` (`utils/appContext.ts`) — false in a tab — and MUST short-circuit to `return fetch(request)` before the IDB lookup. (H1, 2026-07-02, renamed this path: the old `cleanReq` reconstruction is gone; the original request is forwarded untouched.) Yet the observed behaviour is that IDB IS being served in the tab.

**Diagnosis needed** (do NOT fix from a guess):
1. Confirm `withAppContext` really returns bare URLs from the tab context (log the resolved src on a tap in-tab).
2. Confirm the SW handler's `ctxIsApp` branch is taking `return fetch(request)` for tab requests (log the branch taken).
3. Check whether a different code path (SW pre-cache? runtime cache? some workbox route order issue?) is serving the audio bytes before the audio handler runs.
4. Rule out that a stale SW from a previous build is still controlling the tab (unregister + refresh, retest).

**Not blocking** the three chunk-5 regression fixes (2026-07-01) that just committed, but IS blocking the PR to `main`: the strict web/app divide is a core promise of chunk 5. Landing before the deploy gate.

---

## 18. [BUG] Web offline can't navigate to `/sets`

**✅ Resolved 2026-07-02 (evening) — not reproducible on the current build.**
All offline navigation modes verified against the production preview (SW
active), scripted: SPA click-nav to `/sets` with a cold cache renders the
archive (loader degrades to null stats via the `.catch` at
`routes/sets/index.tsx`); document reload after an online visit serves from
`pages-v1`; cold document nav to a never-visited route lands on
`offline.html` **by design**; offline SPA nav to a set detail page renders
with zero failed requests. The `.catch` wrapper predates the 2026-07-01
observation (landed 2026-06-28, `10811a4`), so "wrapper missing" is ruled
out. Most plausible causes of the sighting: a **stale pre-chunk-1.5 client**
still running old JS without the wrapper (the exact stale-client hazard the
H2 update flow has since addressed), the narrow **SW-not-yet-controlling
window** on a fresh profile (verified: offline nav before SW control
hard-fails), or a cold doc nav reading `offline.html` as "broken". No code
defect in the current navigation stack.

_Original entry (kept for context):_



Discovered during chunk-5 verification (2026-07-01). Offline navigation to `/sets` in a browser tab fails — the route doesn't render. Direct visits and reloads of other previously-visited routes work fine offline (chunk 1 `pages-v1` SWR + chunk 1.5 `route-data-v1` SWR handle those); `/sets` specifically breaks.

Separate system from the audio read-path — this is route data, not playback. Not related to chunks 5.1–5.3 or item 17 above.

**Diagnosis needed**:
1. Check `pages-v1` cache in DevTools → Application → Cache Storage for a `/sets/` entry. If missing, precache/SWR didn't populate it. If present, the failure is downstream.
2. Check `route-data-v1` for the `_serverFn/<hash>` response for `/sets/`'s loader (`fetchOverallStats`).
3. Chunk 1.5 wrapped `fetchOverallStats()` in `.catch(() => null)` on `/sets/` specifically so offline degrades to `null` stats rather than rejecting. Verify that wrapper is still in place at `routes/sets/index.tsx`.
4. Determine whether the failure is at the HTML document fetch, at the JS chunk hydration, or at the loader's server-fn call — each has a different fix.

**Not blocking** the three chunk-5 regression fixes but IS a pre-deploy item; document-level offline nav is a core PWA promise.

---

## 19. [LAUNCH BLOCKER before wider release] Move audio off the R2 public dev URL onto a custom domain

**✅ Resolved 2026-07-06.** Audio serves from `https://cdn.formatglasgow.com`
(custom domain connected by Julian, verified: Range GET → 206 with correct
content-range; CORS preflight GET/HEAD + range; ACAO `*`; Content-Length
exposed). Code sweep complete — the hostname is centralized in
`packages/data/src/sets.ts` (moved here from `apps/web/app/utils/audioHost.ts`
by item 21's import sweep, 2026-08-04 — still worker-safe: sw.ts imports the
matcher host; server.ts CSP uses it; `_headers` carries a keep-in-sync
comment; `appContext.test.ts` imports the const). IDB migration: force re-download via URL validation in
`reconcileFromIdb` (unit-locked in `reconcileUrlMigration.test.ts`) — the
guard also self-heals future object renames. Verified against the
production preview with SW active: streaming, `?ctx=app` IDB hit on
new-host keys, bare pass-through, 5.3 no-cors lock. TECH_DEBT 5's CORS
check was re-run on the new host and is absorbed here.

_Original entry (kept for context):_

Discovered 2026-07-02 pre-friends-test. Audio MP3s + peaks JSON are currently served from the R2 Public Development URL:

```
https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/…
```

Cloudflare explicitly warns this URL is rate-limited and **NOT recommended for production** ("Connect a custom domain to the bucket to support production workloads"). No custom domain is currently assigned to the `form-at-sets` bucket (WEUR).

CORS itself is fine — Allowed Origins: `*`, GET/HEAD methods, Range header exposed — audio streaming works today. The constraint is purely rate-limit / production-recommendation, not a functional bug.

**Why this is a launch blocker, not a regular bug**: fine for small trusted-friends tests (low concurrency). At launch-scale concurrent traffic — many friends hitting play at once via an Instagram announcement, or any wider public share — the dev URL's rate limit can throttle audio requests, breaking playback for some users at exactly the worst moment. The failure mode is invisible in low-concurrency testing.

### Fix scope (its own session — Cloudflare config + code hostname sweep)

1. **Cloudflare**: connect a custom domain / subdomain to the `form-at-sets` bucket. Candidate hosts: `sets.formatglasgow.com` or `cdn.formatglasgow.com`. Gains: no rate limit, Cloudflare edge caching in front of R2, production-recommended path.

2. **Code**: replace every reference to `pub-e15e86da649d4c91b6666141bfe67664.r2.dev` with the new custom domain. **Known sites to audit** (grep the hostname — DO NOT trust this list as complete, run a fresh grep at fix time):
   - **`apps/web/app/sw.ts`** — the audio route handler matches by exact hostname (`url.hostname === "pub-e15e86…r2.dev"`). MUST update or the SW stops intercepting audio → offline playback breaks + tab streaming falls back to unproxied fetch.
   - **`apps/web/app/data/sets.ts`** — the `src` and `peaks` URLs for every shipping set are absolute R2 URLs with this host. Change the base.
   - **`apps/web/app/utils/audioUrl.ts`** — check whether `withAppContext` references the host (currently doesn't, but the audit is required so a future addition can't silently break).
   - Any comment / doc entry that names the hostname (this file, `PWA_PROGRESS.md`, `CLAUDE.md`, wrangler / worker config, README) — grep and update for consistency so future audits find one canonical host.

3. **Verify after the swap**:
   - (a) Audio streams from the new domain online (both saved-in-app and never-downloaded sets).
   - (b) Offline-from-IDB still works — the SW handler still matches the new host, still runs the `?ctx=app` → IDB path, IDB entries keyed by the new host resolve.
   - (c) Range slicing / `createPartialResponse` still fires correctly against the new host (seek + play-through a saved set to trigger multiple Range requests).
   - (d) The `mode: "no-cors"` preservation from chunk 5.3 still works if the new host has different CORS behaviour than the dev URL — verify with an actual GET + Range in DevTools; if the custom domain adds CORS headers the dev URL didn't, no-cors mode should still work but confirm.

### Migration caveat — existing offline entries

IDB entries are keyed by full URL. After the hostname swap, existing saved sets in users' IDB will have OLD-host URLs. Options:

- **Force re-download**: bump the SW cache version so `reconcileFromIdb` treats the old-host entries as evicted → user re-saves under the new host. Clean but costs a re-download per set.
- **URL-normalise in the SW handler**: strip/rewrite the host to a canonical form before the IDB lookup. Complex + fragile.
- **Do nothing**: old entries stay orphaned and eventually get auto-purged by `reconcileFromIdb`'s catalogue-check (since `data/sets.ts` now references the new host, the old-host `setId` still matches). Simplest but users lose their downloads silently.

Recommend the force-re-download path with an in-app notice ("we moved sets to a faster server — re-save to keep offline access"). Decide + document at fix time.

### Timing

Block wider announcement / public share until this ships. Small friends test (2026-07-02) can proceed on the dev URL — concurrency is low enough that rate limits don't bite. The threshold isn't sharp; use "am I about to link this in a post that reaches strangers?" as the go/no-go.

### 2026-07-05 session status — BLOCKED on the domain connection

Attempted; stopped at the precondition, per this item's own spec:
- Neither candidate host resolves (`sets.` / `cdn.formatglasgow.com` → no
  DNS). The custom domain is NOT connected to the bucket.
- The local wrangler token cannot connect it either (no R2/zone scopes —
  403 on any R2 call).

**Julian unblocks with:** dashboard → R2 → `form-at-sets` → Settings →
Custom Domains → Connect → pick the hostname (spec candidates:
`sets.formatglasgow.com` or `cdn.formatglasgow.com`). Then the next session
verifies `curl -H "Range: bytes=0-99"` returns 206 + CORS headers on the
new host and runs the sweep.

**Sweep note:** M3 landed meanwhile, so the hostname now ALSO lives in
`apps/web/public/_headers` (CSP media-src/connect-src) and
`apps/web/app/server.ts` (`AUDIO_HOST` const) — both deliberately greppable
and flagged in-file. A fresh grep at sweep time remains mandatory.

### 2026-07-06 — unblocked, resolved

Julian connected `cdn.formatglasgow.com` to the bucket and verified it
himself (206 + correct content-range). The sweep, centralization, and IDB
migration described in the ✅ Resolved summary at the top of this item all
happened this session — see there for the full verification record.

---

## 20. Analytics query UI — now has real data to query (feeds README's "Pending" item)

**✅ Resolved 2026-07-31.** The admin dashboard this item was pointing at
shipped 2026-07-27/28 (`/admin/dashboard`, see PWA_PROGRESS.md), reading
`events` + `plays` together exactly as scoped below, then moved to its own
app (`apps/admin`) this session. README's Roadmap → Pending bullet removed
in the same change. Original text kept below for context.

**Not urgent, just a pointer.** The README's Roadmap → Pending lists
"Analytics query UI — D1 has `started_at` and `listened_seconds` indexed
but there's no internal dashboard page to query plays by date range or top
tracks over time." As of 2026-07-08 (`feat/event-tracking`, see
PWA_PROGRESS.md's "Analytics 1" entry) there's more to query than that
README bullet describes:

- `plays` gained an `is_offline` column (offline-vs-network play ratio).
- A new `events` table tracks the install funnel (`install_prompt_shown` /
  `install_accepted` / `install_dismissed`), `app_launch`, `save_click`,
  `share_click` — none of which CF Web Analytics can see.
- `schema.sql`'s trailing comment block has ready-to-run example queries
  for all of the above (install funnel conversion, launches by day,
  save-clicks per set, offline-vs-network ratio) — start there rather than
  writing new SQL from scratch.

**Scope, when someone picks this up:** whatever UI/dashboard gets built
should read `events` + `plays` together (e.g. "of N `save_click`s, how many
sets are actually `saved` per `offlineSets`" needs both). No schema changes
anticipated — this is a "go build the UI" pointer, not new engineering
debt on the data side.

---

## 21. Sweep apps/web's remaining `~/data/sets` / `~/data/set-stats` / `~/utils/audioHost` / `~/utils/webPush` imports to `@form-at/data` directly

**✅ Resolved 2026-08-04.** Every consumer across `apps/web` now imports the
canonical exports (`MusicSet`, `sets`, `getSet`, `mergeSets`, `fetchSetById`,
`fetchUploadedSets`, `AUDIO_HOST`, `AUDIO_ORIGIN`, `fetchSetStats`,
`SetStats`, `sendWebPush`, `PushPayload`, `PushSubscriptionRecord`,
`SendPushResult`) directly from `@form-at/data/sets` / `@form-at/data/set-stats`
/ `@form-at/data/webPush`. `apps/web/app/utils/audioHost.ts` and
`apps/web/app/utils/webPush.ts` — both 100% pure re-exports — are deleted.
`apps/web/app/data/sets.ts` and `apps/web/app/data/set-stats.ts` were NOT
pure shims by the time this landed (each had gained real, app-specific code
during the catalogue-unification/upload work) — only their re-export halves
were removed; the local wrapping (`getAllSetsWithFallback`,
`getSetByIdWithFallback`, `fetchAllSets`, `getAllSetsLive`,
`fetchAllSetsLive`, `fetchSetForDetailPage`, `isKnownSetId` in `sets.ts`;
`fetchOverallStats`/`OverallStats` in `set-stats.ts`) stays exactly where it
was, since it's genuinely this app's own D1-fallback/createServerFn
plumbing, not catalogue data. `sw.ts`'s `AUDIO_HOST` import was the one
worker-safety-sensitive site (`tsconfig.sw.json`'s `WebWorker` lib) —
`tsc -p tsconfig.sw.json --noEmit` stayed green, confirming
`@form-at/data/sets` has no DOM/window/navigator dependency to leak in.
Verification: both `tsc` passes, `pnpm check`, `pnpm knip`, `apps/web`
unit (387/387) and e2e (62 passed / 6 pre-existing viewport-conditional
skips) all green, no behavior change.

**Original entry, kept for context:** when `apps/admin` was extracted (2026-07-31),
the shared sets catalogue and the `fetchSetStats` analytics query moved to
a new package, `packages/data` (`@form-at/data`). To avoid bundling an
unrelated ~33-file mechanical import-path rename into that migration,
`apps/web/app/data/sets.ts`, `apps/web/app/data/set-stats.ts`, and
`apps/web/app/utils/audioHost.ts` were kept in place as thin re-export
shims (`export * from "@form-at/data/..."`) rather than updating every
consumer to import `@form-at/data` directly. `apps/web/app/utils/webPush.ts`
joined the same shim list in Phase D1 (2026-08-01) for the same reason, when
the send-push module moved to `packages/data` so `apps/admin`'s send
endpoint could import it (three more consumers: `sw.ts`,
`utils/pushNotification.ts`, `scripts/send-push.ts`).

**Scope, when someone picks this up:** grep for `~/data/sets`, `~/data/set-stats`,
`~/utils/audioHost`, and `~/utils/webPush` across `apps/web`, update each
import to the `@form-at/data` equivalent, then delete the four shim files.
Purely mechanical — same shape as the `@form-at/ui` component migration
already done in this repo. No behavior change expected; `pnpm check` +
`pnpm test:run` staying green is the whole verification.

---

## 22. Artwork and DJ-photo URLs aren't content-hashed — a re-export stays stale for hours

**Status: open.**

Re-exporting an image at the same path does not reach anyone who has already
viewed it, for up to ~4 hours. Observed live on 2026-08-07: the Unreal DJ photo
was re-cropped, deployed, and the origin served the new bytes
(`md5 6934c1d6…` matching the local file) while the browser kept showing the
old crop through repeated ordinary reloads.

**Why reloading doesn't fix it.** Two caches compound:

1. `sw.ts`'s `artwork-v1` route serves `/images/*` with `StaleWhileRevalidate`
   — respond from cache, refetch in the background, store for next time. The
   cache deliberately survives deploys (artwork rarely changes, and clearing it
   would break offline access), so the intended cost is "stale for one visit".
2. The live asset carries `cache-control: public, max-age=14400`. SWR's
   background refetch goes through the HTTP cache, so it is handed the OLD
   bytes and re-stores them. The SW cache therefore never self-heals inside
   that 4-hour window, no matter how many times the page is reloaded.

A hard reload clears it (bypasses the HTTP cache), as does fully closing the
installed app — the same lever as the SW-update behaviour documented in
PWA_PROGRESS.md's "SW update flow" section.

**Same class as a bug already fixed once.** The SW precache had exactly this
shape: a stable URL whose content changes, needing a revision token to tell
versions apart. `buildServiceWorker` in `apps/web/vite.config.ts` solves it for
precached assets by hashing file CONTENT into the manifest revision (its own
comment records that `mtime` failed because CI's fresh checkouts changed it on
every deploy). Artwork never got the equivalent treatment because it isn't in
the precache manifest at all — it's a runtime cache keyed on the raw URL.

**Recommended fix — content-hash the filenames.** `optimize-images.ts` emits
`unreal-1080.<hash>.webp`, and `Image.tsx` resolves the base path through a
generated manifest. A re-export produces a new URL, so both caches miss and
every viewer sees the new image immediately, with no expiry to wait out. Costs
a committed manifest mapping base path → hashed filenames, and both files must
change together (they already share the `WIDTHS` keep-in-sync constraint, so
the coupling is established rather than new).

**Cheaper alternatives, recorded so the trade-off is visible:**

- **Version query** — store `photo: "djs/unreal?v=2"` and bump on re-export.
  Same cache-busting effect for one character of change, but relies on a human
  remembering, and a forgotten bump is silently indistinguishable from the
  current bug.
- **Shorter `max-age`** for `/images/*` in `public/_headers` — one line, narrows
  the stale window without removing it. Trades edge-cache efficiency for
  freshness and leaves the SWR "stale for one visit" behaviour untouched.

**Not urgent:** artwork changes rarely, and when it does the fix is a hard
refresh. Revisit when images start changing often enough that "tell people to
hard-refresh" stops being an acceptable answer.

---

## 23. [VERIFICATION DEBT] Three shipped paths have never been exercised for real

Three features are built, reviewed, deployed and covered by unit tests. Two of
them — b and c below — have **never been run once against real input**. Unit
tests here prove our own logic; they cannot prove the parts that only a real
file, a real device or a real service exercises. The third, a, got its first
real attempt on 2026-08-18, and it's the case in point for why this item
exists at all: it failed immediately, on exactly the kind of thing a unit-test
suite structurally cannot catch (see below).

This item exists because the honest admissions were buried at lines 2820 and
3475 of a 4,006-line `PWA_PROGRESS.md`, which is the same as not recording them.
Anyone reading `README.md` or `CLAUDE.md`'s architecture map would reasonably
conclude all three are proven in service.

**a. Set upload, end to end.** `apps/admin/app/routes/api/sets-presign.ts` →
direct-to-R2 `PUT` → `api/sets.ts` writing the catalogue row. **Partially
cleared 2026-08-18.** The first real upload attempt reached only the
file-selection step before failing there: `apps/admin`'s CSP had no
`media-src` directive, so `readAudioDuration`'s `blob:` load of the selected
mp3 into an `<audio>` element (`apps/admin/app/utils/validateUpload.ts`) was
silently blocked, `loadedmetadata` never fired, and the form reported a
perfectly valid file as unreadable. No unit test could have caught this —
jsdom enforces no CSP, and the header is only ever set on the real
`server.ts` fetch response. Fixed by adding `media-src 'self' blob:'` to
`DOCUMENT_CSP`; also fixed in the same pass: the error message no longer
implies the file is bad (it wasn't), and `readAudioDuration` now distinguishes
a CSP block from a genuinely unplayable file via a `securitypolicyviolation`
listener, so this specific failure mode won't be misdiagnosed again if it
ever recurs.
That proved file selection and the duration read, and nothing past it — the
attempt hadn't yet reached presign.

**Second real attempt, same day, same failure shape.** With the file-selection
step fixed, the next try reached presign and the actual R2 `PUT`s — and hit a
second, different CSP gap: `connect-src 'self'` has no allowance for
`*.r2.cloudflarestorage.com`, the host `uploadWithProgress.ts`'s XHR PUTs
target directly (a presigned URL from `sets-presign.ts`, see `r2Sets.ts`). All
three PUTs were silently blocked, and the failure surfaced as the generic
"upload failed — check your connection and try again" — accurate-sounding but
wrong; nothing about the connection was at fault. Fixed by adding
`https://*.r2.cloudflarestorage.com` to `connect-src`. Two real CSP gaps found
back to back, immediately upon the two things this item names as untested
(the duration read, then the presigned PUT) — direct confirmation that
"covered by unit tests" and "exercised for real" are not the same claim, which
is this item's entire argument.

The `connect-src` fix is deployed but **not yet confirmed** — no successful
upload has completed yet, so R2's CORS config, whether the presigned URL's
signature survives a real PUT, and whether `uploadWithProgress.ts`'s XHR
progress events behave against R2 rather than a stub are all still open, and
the catalogue write (`api/sets.ts`) hasn't been reached at all. A 220MB upload
is also still the only way to learn what a dropped connection actually does,
since these are single PUTs with no resume.

**b. iOS push on a physical device.** The whole `@pushforge/builder` choice
exists so Web Push can be signed inside a Worker; the platform where push
behaviour diverges most has never received one. Unverified: whether Apple's push
service accepts our VAPID JWT, and whether the notification renders and routes
correctly from a home-screen-installed PWA. Android has been exercised.

**c. Uploaded-artwork variant generation.** `optimize-images.ts`'s
`UPLOADED_OUT` path runs on every build and its `sets.filter(s =>
s.artworkOriginalUrl)` has always matched zero rows, because nothing has been
uploaded. Blocked on (a) — it cannot be tested independently.

**Not debt, recorded so it isn't re-added:** the archiver run-log path was the
fourth candidate and **is verified** as of 2026-08-17. `rum_capture_runs` is
applied to production D1 and holds seven rows, one per day, all `ok = 1`, six of
them written by the cron rather than by hand. That is the capture loop working
unattended, which is exactly what the table was added to make observable.

**How to clear the rest of a, plus b and c:** upload one short real set through
the admin form. With the CSP block cleared, that attempt should now get past
file selection into the unproven part — the presign, the R2 CORS config, the
progress reporting, the catalogue write — and on the next deploy, the artwork
variant generation. Then send one push and open it on an iPhone. Neither
needs new code.

---

## 24. DJs and events are static arrays while sets are in D1

Sets have a D1 table, a committed snapshot (`sets.generated.ts`), live-over-
snapshot merge, and a self-serve admin upload form. DJs
(`apps/web/app/data/djs.ts`) and events (`apps/web/app/data/events.ts`) are plain
TypeScript arrays edited by hand and shipped by deploy.

**Why it's real debt and not just asymmetry:** the seam is visible in the
product. `apps/admin/app/components/UploadSetForm.tsx:268` instructs the operator
to go and hand-edit `apps/web/app/data/djs.ts` and redeploy. An admin UI telling
you to edit a source file is the clearest possible statement that a migration
stopped halfway.

**Cost of finishing it** (this is why it's deferred, not done): a `djs` table
plus migration; a committed snapshot and generator, because the app is
offline-first and a cold offline start cannot query D1 — the exact reason
`sets.generated.ts` exists; merge and fallback logic; an admin route and form
with `verifyAccessJwt`; and photo upload to R2 wired into the build-time
`optimize-images` uploads path, since responsive AVIF/WebP variants cannot be
generated in a browser.

**The trap that makes it less valuable than it looks:** event lineups are
`lineupIds: [...]` in `events.ts`. Even with a DJ dashboard you would still edit
that file to put a new guest on a bill and deploy — at which point you could have
edited `djs.ts` in the same commit. **A DJ table only pays for itself if events
move too.** Do both or neither.

**Revisit when:** the lineup changes often enough that a deploy per booking is
the bottleneck, or when someone other than the repo owner needs to add an artist.
At the current cadence — a handful of events a year — hand-editing is genuinely
cheaper than the machinery.

---

## 25. "Apps never import each other" is a convention, not an enforced rule

`README.md` calls it "verified by there being no cross-app import anywhere in
either app's source", and that is true today — checked 2026-08-17, no
`apps/web` ↔ `apps/admin` imports exist. But **nothing enforces it**: no Biome
rule, no knip boundary, no CI check. It is the repo's most-repeated architectural
claim and one careless import away from being false, at which point the README
becomes a false statement rather than a stale one.

**Options, cheapest first:** a Biome `noRestrictedImports` rule per app banning
the other app's path; or a grep-based CI step, which is cruder but has no
dependency on Biome's rule coverage.

**Why deferred:** the invariant has held for the life of the repo without
enforcement, and the failure would be caught in review by anyone who knows the
rule. The reason to do it anyway is that "verified" in the README currently
implies a mechanism that does not exist — either the check gets built or that
word gets softened.

---

## 26. `PWA_PROGRESS.md` has outgrown being readable

4,006 lines in one file. It was a good idea — a decision log recording what was
tried and **rejected**, not just what shipped — and it is genuinely the most
useful document here for anyone resuming cold. But past a few thousand lines it
stops functioning as a document: true and important facts inside it become
invisible, which is precisely how item 23's admissions went unnoticed for weeks
while `README.md` implied the opposite.

**Not a formatting problem.** Splitting it per feature area, or capping it with
an archive file for entries older than a release, would keep the value while
making the current state findable. Any split must preserve the dated entries
verbatim — they are correct as history and must not be rewritten to match the
present.

**Deferred because** it is a large, purely-editorial change with real risk of
losing context in the move, and no deadline forces it. Revisit before the next
person other than the repo owner has to work in here.

---

## 27. The offline click-through fallback can't be e2e-tested against the dev server

`fetchAllSetsForRoute` / `fetchSetForRoute` in `~/data/sets` exist so that
clicking through to a route while offline falls back to the committed snapshot
instead of failing. That behaviour has **unit** coverage
(`tests/unit/data/sets.test.ts` rejects the D1 fetches and asserts the wrapper
still resolves) but no end-to-end coverage, and can't get any as things stand.

**Why.** Playwright drives `pnpm dev`. Vite's dev server ships unbundled native
ESM, one HTTP request per module, so `context.setOffline(true)` fails every
not-yet-loaded import — and a failed import anywhere in a route's transitive
graph fails the whole route component. `SaveForOfflineIconButton`'s chain
(`SaveGateModal` → `useOfflineDownload`) is enough to blank all of `/sets`, which
swamps whatever the test was actually asserting.

**This is not a production bug.** In production the service worker precaches the
built, content-hashed chunks, so a route's module graph is already local before
offline matters. The failure is a property of testing offline against a dev
server. Recorded because a previous comment in `sets.spec.ts` described it as "a
real, separate bug" without that qualifier, which reads as an untracked defect.

**What would fix it:** point a Playwright project at the production build
(`pnpm build:web && pnpm start:web`) rather than the dev server, which is the
only configuration where the service worker exists at all — the same constraint
already documented for all SW-dependent behaviour. That means a second
`webServer` config and a slower job, which is why it hasn't been done for one
test.

**Revisit when** anything else needs real offline e2e coverage; the cost is
shared across all of it, and one test doesn't justify a second build in CI.

---

_Last updated: 2026-08-17_
