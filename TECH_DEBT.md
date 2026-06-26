# Form:at — Tech Debt

Engineering-side cleanup and infrastructure items deferred from active work. Product feature ideas live in `IMPROVEMENTS.md`; this file is for code-quality, tooling, and refactor debt only.

Each item is written to be picked up cold — no conversation context required.

---

## 1. Delete dead code flagged by knip

**Scope:** one file — `apps/web/app/utils/ics.ts`.

Remove the two exports:

- `buildGoogleCalendarUrl` (currently around line 81)
- `buildOutlookCalendarUrl` (currently around line 105)

**Why deprecated:** `AddToCalendarButton` downloads a direct `.ics` file. There is no multi-provider calendar picker in the UI and none is planned. Both functions have zero callers outside `ics.ts` itself (verified by grep during the 2026-06-24 knip audit).

**Do NOT delete** `Text` / `Heading` / `Muted` from `apps/web/app/components/Text.tsx`. Knip flags them as unused exports, but they are an intentional design-system surface kept for future use. They get silenced in knip config (item 2 below), not deleted.

**Verification:** `pnpm check` (lint + tsc) + `pnpm test:run` must stay green. Grep for any new callers before deleting in case something landed in the meantime.

---

## 2. knip.json + CI placement

**Scope:** create `apps/web/knip.json` (per-app, not repo-root); then wire knip into CI.

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

**Scope:** `apps/web/app/routes/__root.tsx` — split one file into several, single responsibility per module.

### What's currently inline

Five distinct concerns share the file:

- `RootNotFound` — the 404 component
- `fontCSS` — inlined `@font-face` CSS string
- `HydrateStore` — store-hydration effect component
- `InstallEventsListener` — `beforeinstallprompt` + `appinstalled` listeners writing to the Zustand store
- The `head()` meta / link / script config (large object literal)

### Constraints

- **Pure mechanical move.** No new abstractions, no consolidation across the five modules, no "while I'm here" cleanups. Split only.
- **No behaviour change.** Same render output, same effects firing in the same order at the same lifecycle moments.
- **Plan first.** Propose the target file paths before touching anything — locking the structure during plan-review avoids re-litigation mid-refactor.

### Verification

- `pnpm check` (lint + tsc) green.
- `pnpm test:run` stays at the current passing count (137 at the time of writing this entry — 2026-06-24).
- Manual smoke test in dev: install flow still wires up, 404 page still renders for an unknown route, fonts still load, store still hydrates.

---

## 4. Phase 4.5 — Beacon queue (offline play counts via Background Sync)

**Deferred from Phase 4 per architecture decision** (2026-06-24): independent infrastructure with no shared code with the audio cache chain. Different API (Background Sync vs Cache Storage), different storage (IndexedDB queue vs Cache Storage), different failure mode (intermittent network vs full offline), lower stakes (lose a play count vs lose a 64MB download), invisible to users.

**Scope:** queue `/api/signal` POSTs in IndexedDB when offline; replay them via a Background Sync registration when connectivity returns. Drop the queue entry on successful replay; surface no UI either way.

**Order:** ships any time after Phase 4 audio chunks (2/3/4) stabilize. Not on the critical path; can slip indefinitely if higher-priority work appears.

**Verification:** seed a queue offline (simulate plays), come back online, confirm `/api/signal` requests fire and D1 receives them; queue is then empty.

---

## 5. R2 CORS verification — pre-chunk-3 check

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

**Preexisting bug, affects production** (predates Phase 4). When a set starts playing, the player briefly shows the simple progress bar before the waveform component renders — a flash of fallback content while the waveform JSON loads and computes.

**Scope:** investigate how the waveform component decides to mount the real waveform vs the fallback bar. Likely a brief window between "currentSrc set" and "peaks data ready" where the fallback wins. Fix: either reserve the layout space so the waveform pops in without moving siblings, or hold the fallback state explicitly until the waveform is mount-ready (no race).

**Verification:** start playing a fresh set on a slow network throttle (DevTools → Network → Slow 3G). The transition should be visually stable — no flash, no layout shift.

---

## 10. Waveform gold progress doesn't advance

**Preexisting bug, NOT chunk-3 related.** Reported by a real user — happens online AND offline. The gold "played" overlay on the waveform stays at 0% even though audio is playing and the time counter advances normally.

**Scope:** investigate how the waveform receives `currentTime` / `duration` from the audio element, and how it computes the gold proportion. Likely candidates:
- Stale closure in a `useEffect` capturing the initial 0 value.
- Missing subscription to player state updates (Zustand subscribe vs static read).
- Audio element's `timeupdate` event not propagating to the waveform.
- The gold-overlay width style isn't reading from the right state.

**Verification:** play any set, watch the gold portion grow with playback progress, both online and offline. Should also track seek operations.

---

## 11. Audio retry storm on offline playback of unsaved sets — chunk 3c UX gate

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

There's a fourth case the current code handles silently with auto-purge: **IDB entries whose `setId` is no longer in `sets.ts`**. Reconciliation deletes both the MP3 and peaks blobs in a single readwrite transaction, removes the entry from state, and `console.warn`s the purged set IDs. Rationale: if `sets.ts` doesn't list the set, no UI path exists for the user to play it offline — keeping ~100 MB of blobs is dead storage.

**When to revisit:** if `sets.ts` ever gains an "archived" status (set hidden from listings but technically still in the catalogue), the auto-purge rule needs revising to NOT purge archived sets. At that point, either:
- Filter `getSet()` to exclude archived from listings but include from reconciliation lookups, OR
- Surface orphans in a "Manage offline sets" view (Phase 4 polish) instead of auto-purging, giving the user a "this set is no longer in the catalogue — remove from library?" prompt.

Current behaviour is intentional and load-bearing; this entry exists so a future "archived sets" feature doesn't accidentally lose data.

---

_Last updated: 2026-06-26_
