# Form:at — Tech Debt

Engineering-side cleanup and infrastructure items deferred from active work. Product feature ideas live in `IMPROVEMENTS.md`; this file is for code-quality, tooling, and refactor debt only.

Each item is written to be picked up cold — no conversation context required.

## Status at a glance

- **Launch blockers:** none open (19 resolved 2026-07-06 — audio on cdn.formatglasgow.com)
- **Open:** 1, 2, 3, 4, 7, 8, 12, 13, 14 (deferred — see item), 15
- **Deferred (coupled, ship together post-2026-07-24):** 16 (orphan artwork prune) — waits for the deferred manage-offline-sets view; the prune naturally lives in that view's remove flow. See PWA_PROGRESS.md for the deferral rationale.
- **Resolved:** 6 (2026-06-28, `10811a4`), 9 (2026-06-29, `e2b5f57`), 10 (2026-06-29, `da90a12`), 11 (fully resolved 2026-07-01 — initial fix `718ead3` 2026-06-27, same-track branch closed 2026-07-01), 17 (2026-07-02 — gate proven intact via SW-preview experiments; observed bytes were HTTP cache / element buffer, not IDB; silent-blocked-tap toast fixed), 18 (2026-07-02 — not reproducible on current build; all three offline nav modes verified against the SW preview), 5 (absorbed into 19's verification — CORS re-checked on the custom domain 2026-07-06: preflight GET/HEAD + range, ACAO *, Content-Length exposed), 19 (2026-07-06 — audio on cdn.formatglasgow.com, host centralized in utils/audioHost.ts, IDB force-re-download migration in reconcileFromIdb)

Resolved items keep their original section in place with a `✅ Resolved` stamp at the top, so the historical context (cause + fix path) stays readable. Search for `✅ Resolved` to skip to / past them.

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

Five distinct concerns shared the file; two have since moved out:

- ~~`RootNotFound`~~ — consolidated into `components/NotFoundPage.tsx` (2026-07-02, status-pages redesign)
- ~~`InstallEventsListener`~~ — extracted to `components/InstallEventsListener.tsx` (2026-07-02, install-race fix: the pre-hydration stash adoption needed unit tests, which forced the move)
- `fontCSS` — inlined `@font-face` CSS string
- `HydrateStore` — store-hydration effect component
- The `head()` meta / link / script config (large object literal — now also carries the inline `beforeinstallprompt` capture script, whose property name must stay in sync with `utils/installPromptStash.ts`)

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

There's a fourth case the current code handles silently with auto-purge: **IDB entries whose `setId` is no longer in `sets.ts`**. Reconciliation deletes both the MP3 and peaks blobs in a single readwrite transaction, removes the entry from state, and `console.warn`s the purged set IDs. Rationale: if `sets.ts` doesn't list the set, no UI path exists for the user to play it offline — keeping ~100 MB of blobs is dead storage.

**When to revisit:** if `sets.ts` ever gains an "archived" status (set hidden from listings but technically still in the catalogue), the auto-purge rule needs revising to NOT purge archived sets. At that point, either:
- Filter `getSet()` to exclude archived from listings but include from reconciliation lookups, OR
- Surface orphans in a "Manage offline sets" view (Phase 4 polish) instead of auto-purging, giving the user a "this set is no longer in the catalogue — remove from library?" prompt.

Current behaviour is intentional and load-bearing; this entry exists so a future "archived sets" feature doesn't accidentally lose data.

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
token has NO R2 scopes (`r2 object get` → 403 Authentication error; the
token's grants cover containers/email/browser only). Julian's dashboard
steps (do together with the TECH_DEBT 19 domain connection, one bucket
visit):
1. Cloudflare dashboard → R2 → `form-at-sets` → `002/`.
2. For `Form_at 002 - Brandon Lee Vear.mp3.mp3`: download → re-upload as
   `Form_at 002 - Brandon Lee Vear.mp3` (dashboard has no in-place rename).
   Same for `….mp3.json` → `….json` (matches the t.i.l. naming pattern).
3. Keep the OLD keys until the sets.ts change deploys, then delete them.
4. Tell the next session "objects renamed" — the `sets.ts` URL update is
   deliberately NOT made yet (code must never point at keys that don't
   exist).

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

Not blocking anything currently. Filed for visibility.

---

## 16. Orphan artwork in `artwork-v1` after offline-set removal

Chunk 1.5 follow-up (2026-06-28) ships `warmArtwork` inside `startDownload`: after the audio IDB commit + `saved` state transition, the four `<Image>` variants for `set.artwork` (`640.avif`, `1080.avif`, `640.webp`, `1080.webp`) are fetched fire-and-forget so the artwork-v1 SWR route populates them. Result: a saved set renders complete offline on both `/sets/$setId` and the FullPlayer, even if the user never visited those pages online first.

The symmetric path is NOT implemented: warmed variants stay in `artwork-v1` when `removeOfflineSet(setId)` runs, and likewise when reconciliation auto-purges a catalogue-orphaned set. Intentional for three reasons:

1. **Variants are KB-scale.** Per-set warm is sub-1MB. The orphan cost is bounded and tiny.
2. **The same `artwork` path is shared across sets.** All four shipping sets use `artwork: "sets/002"`, so per-set deletion is ambiguous — removing variants for one would break offline display for another saved set sharing the path. NOT deleting isn't just simpler, it's more correct.
3. **The opportunistic SWR path repopulates** on next online visit anyway, so the worst-case offline experience for a removed-then-re-saved set is one online visit away from being right.

**When to revisit:** coupled with the deferred "Manage offline sets" view (see PWA_PROGRESS.md → "Deferred — post-2026-07-24"). The prune algorithm — sweep `artwork-v1` by computing the union of `artwork` paths across currently-saved sets and dropping anything outside that set — naturally lives inside the manage-view's remove flow. Ship the prune with the manage view; standalone earlier would duplicate the iteration logic. Both items earn their place once the catalogue grows past ~10-15 sets.

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
`apps/web/app/utils/audioHost.ts` (worker-safe: sw.ts imports the matcher
host; sets.ts builds URLs from `AUDIO_ORIGIN`; server.ts CSP uses it;
`_headers` carries a keep-in-sync comment; `appContext.test.ts` imports the
const). IDB migration: force re-download via URL validation in
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

---

_Last updated: 2026-07-02 (R2 custom domain launch blocker recorded as item 19)_
