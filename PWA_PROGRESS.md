# Phase 4 — PWA / Offline progress

Session-resumption note. If a session breaks mid-implementation, read this +
the relevant TECH_DEBT entries + recent commits and you have everything
needed to continue.

Authoritative reference for design decisions: `IMPROVEMENTS.md` (product),
this file (engineering state), `TECH_DEBT.md` (engineering follow-ups —
status-at-a-glance section at the top of that file).

**Branch model (updated 2026-07-06):** the original `transform-the-web-app-in-a-pwa`
branch merged to `main` via PR #1 (2026-07-02). All work since then has
shipped as short-lived `fix/*` / `docs/*` branches off `main`, one PR each
(PRs #2–#5 as of this writing). There is no long-lived feature branch
anymore — `git log --oneline` on `main` is the source of truth for what's
shipped, and any open branch is scoped to whatever it's named after.

---

## Branch status — core PWA + offline work is COMPLETE, shipped to main

All planned Phase 4 chunks are merged to `main` and verified through the
real UI (PR #1, 2026-07-02). Everything below the chunk table happened in
follow-up PRs after the merge — bug fixes, the post-merge review's action
items, and the R2 custom-domain launch blocker — not new feature work.

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
| 5.1 — Chunk-5 regression: cross-track loop | ✅ committed 2026-07-01 | `2291ea0` | Chunk 5 wrapped both `audio.src` writes AND the `useAudioPlayer` src-match comparison in `withAppContext`. Under specific cross-track transitions (saved A → non-saved B → back to A) Chrome's browsed URL round-trip diverged marginally from the JS-constructed URL, the `===` compare flipped false, useAudioPlayer set src → load → the click-path play() promise raced the bridge effect → infinite request + play/pause loop. Confirmed via Network panel showing alternating `?ctx=app` / bare URL requests. Fix: replaced URL string comparison with an identity stamp — `audio.dataset.trackId = track.id` written at BOTH src-assignment sites (playerSlice.playTrack click path + useAudioPlayer restore path), effect compares `audio.dataset.trackId === nowPlaying.id`. Immune to URL normalization and to the `?ctx=app` marker. Chunk-5 marker-in-URL is still what the SW read-path keys on; only the JS-side comparison stopped depending on URL equality. |
| 5.2 — Chunk-5 regression: unified offline gate (closes TECH_DEBT 11 fully) | ✅ committed 2026-07-01 | `2291ea0` | The retry-storm gate (chunk 3c, `718ead3`) sat in the NEW-TRACK branch of `playerSlice.playTrack` only. The same-track branch had no gate, so re-tapping a paused non-saved set offline (play online → pause → offline → tap same set) bypassed the gate: `<audio>` retried the failing Range dozens of times = the storm the gate was built to prevent. Not a new chunk-5 regression per se — the gap existed since chunk 3c — but surfaced during chunk-5 testing. Fix: single unified gate BEFORE the same-track/new-track split; blocks starting OR resuming a track when `isOffline && offlineStatus !== "saved"`, still permits pausing a currently-playing same-track (`audio.pause()` never fetches). Three new tests in `playerSlice.test.ts` lock: (a) non-saved same-track resume blocked, (b) saved same-track resume allowed, (c) pause of a stalled non-saved stream still works. Old new-track-only gate removed — subsumed. |
| 5.3 — Chunk-5 regression: SW CORS mode preservation | ✅ committed 2026-07-01 | `2291ea0` | Chunk 5 rebuilt the R2 request as `new Request(cleanUrlString, { method, headers })`. `new Request()` init defaults `mode: "cors"`, silently flipping `<audio>`'s native `mode: "no-cors"` (media element cross-origin default per HTML spec) to cors. R2's ACAO doesn't satisfy the CORS check for MP3 Range GETs → browser blocked the response → three non-saved sets failed to stream online from the standalone app; only the saved set (served from IDB, no fetch) played. Fix: preserve `mode`, `credentials`, `redirect` from the original `request` when constructing `cleanReq`. MP3 stays no-cors (opaque response — safe, both `return fetch(cleanReq)` paths pass through without inspecting), peaks JSON stays cors (transparent — the JS caller `.json()`s it). `createPartialResponse` operates only on the synthetic IDB-hit Response, never on the network fetch, so opaque doesn't affect Range slicing. |
| 4.5 — Beacon queue (Background Sync) | deferred — polish | TECH_DEBT 4 | Independent infra, lower stakes |

_5.1/5.2/5.3 share one commit_ (`2291ea0`, "Some fixes for the player and the offline features") — the three regressions were fixed and squashed together, not as three separate commits; verified against `git log`.

---

## What's actually left

Engineering-wise, the PWA work is shippable and live on `main`. Items below are the punch list:

### Launch blockers before wider release

**NONE OPEN as of 2026-07-06.** The single blocker (TECH_DEBT 19, audio on
the R2 dev URL) is resolved: audio now serves from
`https://cdn.formatglasgow.com` (custom domain on the `form-at-sets`
bucket — no rate limit, Cloudflare edge caching, production-recommended).
Host verified by curl (Range GET → 206 with correct content-range; CORS
preflight allows GET/HEAD + range header; `Content-Length` exposed for the
download progress reader) and against the production preview with the SW
active (streams, IDB read via `?ctx=app` with new-host keys, bare-URL
pass-through, 5.3 no-cors lock intact). The hostname is centralized in
`apps/web/app/utils/audioHost.ts` (worker-safe; `_headers` carries a
keep-in-sync comment).

**IDB migration decision (documented per TECH_DEBT 19):** force
re-download. `reconcileFromIdb` now validates every entry's URL against the
catalogue (`offlineSlice.ts`, pass 2) — entries under URLs the catalogue no
longer emits are purged and a set whose MP3 went stale flips to `evicted`,
surfacing the existing "↻ re-save · was N MB" button as the notice. This
was necessary (the natural path did NOT evict: grouping is by setId, so
old-host entries kept the state lying "saved" while the SW's exact-URL
lookup missed) and it self-heals future object renames (TECH_DEBT 14).
Clean-slate (bump the IDB name) was considered and rejected — the guard is
~20 lines, generic, and unit-locked. Only Julian's devices had saved sets;
they will each show re-save buttons once after this deploys.

**On-device checks for the next pass:** (1) play + seek a set on the
deployed site — Network panel shows `cdn.formatglasgow.com` with 206s on
seek; (2) standalone app: previously-saved sets show "↻ re-save"; re-save
one and confirm airplane-mode playback works from the new-host IDB entry.

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
  pointing at Chrome. **Field-confirmed 2026-07-03:** Opera Android does not
  fire the event even with the stash; the hedged copy is the permanent
  behavior there, not a fallback.
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
4. **Opera, fresh profile: ✅ CONFIRMED 2026-07-03 on-device.** Opera
   Android does NOT fire `beforeinstallprompt` even with the pre-hydration
   stash in place; the hedged manual copy renders as designed
   (screenshot-verified). The hedge stays — do not add Opera-specific UA
   handling.
5. **Any browser:** after install, CTA gone, modal switches to open-app
   branch; standalone gate unchanged (tab still streams, never reads IDB).

### Added 2026-07-08 — Analytics 1: first-party event tracking

Cloudflare Web Analytics stays as the page-view/Core-Web-Vitals layer,
unchanged. This adds a first-party D1 `events` table for discrete product
events CF Analytics has no concept of (install funnel, save/share clicks,
app launches), plus an `is_offline` column on the existing `plays` table.
Branch: `feat/event-tracking`.

**The anonymous/aggregate decision (read before adding ANY column to
`events`):** decided this week — aggregate/anonymous tracking only, no
persistent device identifier of any kind, ever. Each row in `events` is a
standalone fact with no reliable way to link it to another row from the
same visitor. This is NOT enforced by a SQL constraint (SQL has no notion
of "this column must never become a linking key") — the real enforcement
is three loud, hard-to-miss guardrails:
1. **Schema comment** (`schema.sql`, directly above `CREATE TABLE events`)
   spells out the constraint and why each existing column can't reconstruct
   a session, so a future column addition is a deliberate decision, not a
   silent drift.
2. **Endpoint allowlist** (`utils/trackableEvents.ts` + `routes/api/event.ts`)
   rejects any `event_type` not on an explicit list — the practical guard
   against the table becoming a dumping ground for arbitrary strings, which
   is also where an accidental identifier-shaped field would first get caught
   in review.
3. **This doc entry** — so a future session reads the "why" before reaching
   for a device ID to solve some future analytics question.

If a real product need ever justifies a linking key, that's an explicit
decision to make then, with its privacy tradeoffs weighed on purpose — not
a column added because it seemed convenient.

**`event_type` allowlist (six types, all from this week's discussion — no
extras invented):** `install_prompt_shown`, `install_accepted`,
`install_dismissed`, `app_launch`, `save_click`, `share_click`.

**Fire points, with the judgment calls flagged:**
- `install_prompt_shown` — `InstallCta.tsx`'s gated child component's mount
  effect, i.e. when the CTA actually renders (hydrated + captured prompt +
  not dismissed), NOT when Chromium's `beforeinstallprompt` fires — those
  can differ by seconds on a slow first visit.
- `install_accepted` — `InstallEventsListener.tsx`'s existing `appinstalled`
  handler.
- `install_dismissed` — TWO call sites, both firing the same event type:
  (1) `useSaveGate.ts`'s `useTriggerInstallPrompt`, when the NATIVE browser
  install dialog's outcome is `"dismissed"` — shared by InstallCta's
  tap-to-install and SaveGateModal's "install" button, since both call this
  one hook; (2) `SaveGateModal.tsx`'s `handleClose`, but **only** when
  `gate.reason === "needs-install"` — closing the open-app or
  cannot-install branches isn't dismissing an install offer (there's no
  install action on those branches to dismiss), so counting those would
  inflate the metric with closes that were never about installing. This
  scoping is a judgment call, not a literal reading of "wherever the modal
  closes" — flagging it as such.
- `app_launch` — new `<AppLaunchTracker>` component, mounted once in
  __root's `<body>` alongside `<HydrateStore>` / `<InstallEventsListener>` /
  `<OfflineReconciler>` (same "mount-once, null-render" pattern). Gated on
  `isStandalone()` alone, not the manifest's `?source=pwa` start_url marker
  (N1) — `isStandalone()` is the authoritative signal used everywhere else
  in the app, and requiring the query marker too would miss a standalone
  relaunch that deep-links somewhere other than `/`. No dedicated
  "session-start" hook was needed: this component's mount-only effect IS
  session-start, because TanStack Router's Outlet-based navigation never
  remounts anything living in `__root`'s body.
- `save_click` — inside `useOfflineDownload.ts`'s `useTriggerDownload`, the
  single hook already shared by `SaveForOfflineButton` (detail page) and
  `SaveForOfflineIconButton` (list card) — one code change covers both of
  chunk 4's component paths. Fires on every explicit save/retry/re-save tap
  (first save, network-failure retry, post-eviction re-save all funnel
  through this one hook) — doesn't yet distinguish "first save" from
  "retry"; add a payload field for that later if it's actually needed, not
  speculatively now.
- `share_click` — `ShareIconButton.tsx` (list card + FullPlayer circle icon)
  and `ShareSetButton.tsx` (detail page text button), both at the point
  `openShareModal(set)` is called — "user expressed intent to share",
  mirroring `save_click`'s "user expressed intent to save" semantics. Does
  NOT track which provider inside the share modal the user picks next —
  not asked for, would be a higher-cardinality event not on the allowlist.

**Wire format — deliberately inconsistent with `api/signal.ts`:** the new
`/api/event` endpoint uses snake_case JSON keys (`event_type`, `set_id`,
`is_standalone`) matching the payload shape specified this week, while
`api/signal.ts` keeps its established camelCase (`setId`, `setTitle`, …).
Not an oversight — flagging it so a future session doesn't "fix" one to
match the other without checking here first.

**Click-tracking pattern — a hook (`useTrackEvent`), not a wrapper
component:** the tracked actions live inside components that render EITHER
the design-system `<Button>` OR a raw `<button>` depending on surface, and
the real "this is a save" moment is often one branch of a multi-branch
state machine (see `useOfflineDownload.ts` — only some `offlineState.status`
branches are a real save attempt). A wrapper component would have to be
either `<Button>`-specific (misses the icon-button surface) or generic
enough that it stops being more than "call this function inline" — so
`useTrackEvent()` returns exactly that, called directly at each real call
site. Fires via `navigator.sendBeacon`, matching `useAudioPlayer`'s existing
play-tracking convention exactly (fire-and-forget, survives page unload).

**`plays.is_offline` — the SAME signal the SW audio route uses, not a new
one:** `wasServedFromIdb` (`store/playerSlice.ts`, next to
`canFetchPlaybackBytes`) mirrors `sw.ts`'s exact IDB-vs-network decision:
`isStandalone() && offlineSets[trackId]?.status === "saved"`. This is
**not** the same predicate as `canFetchPlaybackBytes` — that one
short-circuits true whenever `navigator.onLine`, regardless of saved
status. `wasServedFromIdb` has no online/offline check at all, because
`sw.ts`'s audio route doesn't either: a saved set in the standalone app is
served from IDB even while fully online, so `is_offline` really means
"served from cache", not literally "device was offline" — named to match
the product framing anyway. Computed inside `useAudioPlayer.ts`'s
`sendPlay` via `useStore.getState().offlineSets` (a live read, not a
selector — keeps `sendPlay`'s stable `[]` deps intact, same pattern already
used elsewhere in that file). Best-effort: relies on `offlineSets` staying
in sync with real IDB via `reconcileFromIdb`, the same tolerance the rest
of the app already accepts for this state. The column is nullable and the
endpoint treats a missing/malformed value as `null` rather than rejecting
the whole play record — a pre-2026-07-08 cached client can keep posting the
old payload shape for a while post-deploy (H2's consented update flow means
old JS can legitimately outlive a deploy) without losing play-count data.

**Deliberately NOT added:** a `country` column on `events` (unlike `plays`)
— adding it needs its own decision, not a silent copy from the plays table;
a `set_id` index on `events` — only 2 of 6 event_types carry one and no
query needs it yet; per-provider share tracking; first-save-vs-retry
distinction on `save_click`.

**Needs on-device / production-preview confirmation** (as always for
anything SW-adjacent in this repo): (1) `is_offline` actually reads `true`
for a real saved set played in the installed app — the unit tests mock
`offlineSets` and `isStandalone()`, they don't exercise the real SW; (2) the
`/api/event` beacon actually reaches D1 in production (unit tests mock
`navigator.sendBeacon` itself, never a real network call); (3) the schema
migration — **✅ DONE 2026-07-15**, applied via `--command` (NOT `--file`;
see schema.sql's warning comment: the `ALTER TABLE plays ADD COLUMN` line
is non-idempotent and running the whole file against the migrated prod DB
now fails with a duplicate-column error — the `--file` instruction that
used to sit here was corrected in the 2026-07-16 review).

### Added 2026-07-15 — Phase 2: push notification infrastructure

Subscribe + receive + a real manual-send script — the actual mechanism for
announcing new sets and events until an admin panel exists (and a manual
override afterward too). Branch: `feat/push-notifications`.

**Step 0 research — how to send Web Push from a Cloudflare Worker (done
BEFORE writing any send logic):** the standard `web-push` npm package
depends on Node's `crypto` (`crypto.createECDH`) and `https` modules, which
the Workers runtime does not implement even with `nodejs_compat` on —
confirmed as a known, unresolved gap
([web-push-libs/web-push#718](https://github.com/web-push-libs/web-push/issues/718),
open since 2022). Chose `@pushforge/builder` instead: built entirely on
`globalThis.crypto.subtle` (Web Crypto API), which is portable across
browsers, Node 20+, and workerd — verified directly against the package's
compiled source (`dist/lib/crypto.js`), not just its documentation, to
confirm zero `node:` imports. This is the same reasoning that makes
`app/utils/webPush.ts` reusable as-is by a future Worker-based admin panel:
nothing in it is Node-specific.

**⚠️ Known caveat found in the 2026-07-16 pre-commit review — legacy
encryption encoding, iOS delivery unverified.** Reading the library's
actual compiled source (`vapid.js`, `payload.js`) shows it implements the
pre-RFC draft `aesgcm` scheme (`Content-Encoding: aesgcm`, `Encryption:
salt=` / `Crypto-Key: dh=` headers, 2-byte prefix padding), NOT RFC 8291's
final `aes128gcm`. FCM and Mozilla autopush accept both encodings; Apple's
push service (`web.push.apple.com`) arrived post-RFC and may accept only
`aes128gcm` — unverifiable from source, and iOS-standalone users are a
headline audience for this app's push. **The iOS field test IS the
verdict on this.** Test an iPhone FIRST, before announcing to anyone: if
Apple's service 4xxes, swap the internals of `webPush.ts` for an
`aes128gcm` implementation — the module boundary makes that a contained,
one-file change; nothing else in this phase touches the encoding.

**VAPID keys (RFC 8292) — one-time, local, never committed:** generated via
`npx @pushforge/builder vapid` on 2026-07-15. The public key is a plain
committed constant (`app/utils/vapidPublicKey.ts`) — safe to expose, that's
the point of VAPID's asymmetric design. The private key lives ONLY in
`apps/web/.env` (git-ignored, `VAPID_PRIVATE_KEY_JWK` — see `.env.example`
for the required shape) and as a Cloudflare secret for the future admin
panel. **Not yet stored as a Cloudflare secret — Julian needs to run this
himself** (same reasoning as `CLOUDFLARE_API_TOKEN`: secret-writing
commands aren't run on his behalf). This is a **Pages** project
(`wrangler.toml` has `pages_build_output_dir`), so it's the Pages-scoped
command — the Workers-style `wrangler secret put` fails here (corrected in
the 2026-07-16 review; the original instruction had the Workers form):
```bash
npx wrangler pages secret put VAPID_PRIVATE_KEY_JWK --project-name=form-at-web
```
(paste the full JWK from `apps/web/.env` when prompted). Only the PRIVATE
key needs to be a secret — the public key is a committed constant
(`app/utils/vapidPublicKey.ts`), storing it as a secret would be pointless.
The key pair was verified mathematically consistent (public point derived
from the private JWK's x/y === the committed constant) on 2026-07-16. If
these keys are ever rotated, `vapidPublicKey.ts`, `.env`, and the
Cloudflare secret must all change together — a mismatched pair fails
silently at `pushManager.subscribe()` (browser-side `DOMException`) or at
send time (push service 401/403).

**`push_subscriptions` D1 table — a deliberate exception to the Analytics 1
anonymity rule, not a reversal of it.** Full reasoning lives in `schema.sql`
directly above `CREATE TABLE push_subscriptions` (read it there — not
duplicated here to avoid the two copies drifting). Short version: a push
subscription's `endpoint` IS an addressable per-device token by necessity —
that's the only way push delivery works — unlike `events`, where
addressability was explicitly designed out. Mitigation is scope, not
anonymity: never joined against `events` or `plays`, no IP/UA/name/email
stored. **Not yet applied to the remote database** — same "Julian runs it"
pattern as the `is_offline` migration above. **Do NOT use
`--file=apps/web/schema.sql`**: schema.sql contains the one-time
`ALTER TABLE plays ADD COLUMN is_offline` line (already applied to prod,
non-idempotent — see its own warning comment), so running the whole file
fails with a duplicate-column error. Run the isolated statement instead:
```bash
npx wrangler d1 execute form-at-analytics --remote --command "CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, is_standalone INTEGER NOT NULL, created_at INTEGER NOT NULL)"
```
(idempotent — safe to re-run; keep it in sync with schema.sql's DDL if the
table ever changes).

**Client opt-in — `<PushOptInCta>`, a deliberate button tap, never an
auto-prompt.** Placed on the home route directly below `<InstallCta>`, in
the same passive capability-nudge zone (`routes/index.tsx`) — proposed
rather than picked silently, since both CTAs are "ask once, respect the
answer" nudges that belong together but must stay visually/functionally
separate (see below). A SEPARATE component and a SEPARATE dismiss flag
(`pushOptInDismissed`, mirrors `pwaInstallDismissed`'s "soft dismiss, hide
forever" semantic but is NOT the same flag) — installing the app and
opting into push are different asks with different native prompts;
conflating the flags would mean dismissing one silently answers a question
the user was never asked. Gated on capability detection
(`'serviceWorker' in navigator && 'PushManager' in window`), not UA
sniffing — this is also what naturally handles iOS Safari's real
constraint (Push API only exists for installed/standalone PWAs there, not
browser tabs) without any special-casing. `Notification.permission ===
"granted"` or `"denied"` both hide the CTA (nothing left to offer, and the
browser blocks re-prompting after an explicit deny anyway); a
dismissed-without-choosing prompt is covered by `pushOptInDismissed` itself
since the Notification API resolves that case the same as "denied" — no
separate handling needed. After a successful subscribe the parent component
re-reads `Notification.permission` and the CTA hides in the SAME session
(2026-07-16 review fix — originally it only disappeared on the next mount).
A transient subscribe failure (`"failed"` outcome — push service
unreachable, etc.) leaves the button visible for a legitimate retry. Button
label: `notify_me`, matching the app's lowercase terminal-command tone
(`install_form:at`, `resume_signal`).

**`POST /api/push-subscribe` — follows `api/event.ts`'s conventions, not
`api/signal.ts`'s.** Exported `validate()` for unit tests, snake_case for
the one app-controlled field (`is_standalone`), always-204, try/catch
swallow — the newer/better-practice pattern in this codebase, chosen
because `push_subscriptions` is a Phase-2 sibling of the deliberately
designed `events` table, not a play-tracking beacon. `endpoint` /
`keys.p256dh` / `keys.auth` are NOT this app's casing choice — that's
exactly what the browser's `PushSubscription.toJSON()` produces (a Web
standard shape). `INSERT OR REPLACE` on the primary key (`endpoint`) so a
re-subscribe (permission re-granted, browser refreshed the subscription)
overwrites cleanly instead of erroring on a duplicate insert. Sent via
`navigator.sendBeacon`, matching every other tracking beacon in this
codebase — fire-and-forget; a failed POST means the browser holds a
subscription this app doesn't know about, and the next send simply won't
reach that device (no retry/reconciliation UI — deliberately deferred, see
below).

**SW handlers (`app/sw.ts`) — `push` and `notificationclick`, API shapes
verified against MDN before writing, not assumed:**
- `push`: reads `event.data?.json()` wrapped in try/catch (both because
  `event.data` is legitimately `null` for an empty push per spec, AND
  because `.json()` itself throws on a non-JSON body — optional chaining
  alone only guards the first case). Falls back to a generic "Form:at"
  notification rather than dropping the push silently on a malformed
  payload. Calls `registration.showNotification(title, { body, icon,
  badge, data: { url }, tag })`.
- `notificationclick`: the standard focus-or-open pattern —
  `clients.matchAll({ type: "window", includeUncontrolled: true })`, and
  if an existing client is found, `.focus()` then `.navigate(url)` to
  deep-link it to the pushed URL (falls back to `/` if the payload carried
  none); otherwise `clients.openWindow(url)`. `WindowClient.navigate()` is
  what makes the deep-link work on an ALREADY-OPEN app — a bare `.focus()`
  (the basic MDN example) would just bring an unrelated open page to the
  front. `includeUncontrolled: true` matters specifically for a client that
  was open before this SW activated. If `navigate()` rejects (it throws on
  a client this SW doesn't control — exactly what `includeUncontrolled`
  admits), a `.catch` falls back to `openWindow` so the tap is never
  swallowed. Notification `tag` is unique per push (`format-<timestamp>`) —
  a constant tag would make a second announcement silently replace an
  unread first one.

**`scripts/send-push.ts` — THE real production send mechanism, run locally,
not a public endpoint.** Deliberately a local Node script rather than a
Worker HTTP route: a public endpoint would need its own authentication to
stop anyone who finds the URL from spamming every subscriber, and there's
no auth system yet (that's the deferred admin panel). Running it from
Julian's terminal reuses his already-authenticated `wrangler` session
instead of needing to build auth infrastructure just for this. Shells out
to `wrangler d1 execute --remote` (no direct D1 connection from Node — that
plumbing is NOT part of the reusable `webPush.ts` module, deliberately,
since it doesn't port to a future Worker route which would use its own D1
binding instead). Implements the Web Push spec's dead-subscription rule: a
404 or 410 from the push service means the subscription is permanently
invalid, so the script deletes that row immediately rather than letting
dead entries accumulate forever. Transient failures (429 rate limit, 5xx)
are counted and reported but NOT deleted — deleting a live subscription
because the push service had a bad minute would be wrong, and the
distinction is unit-locked in `webPush.test.ts`. Sends run sequentially
(one `await` per subscriber) with per-subscription error isolation — a
thrown error on one row (malformed stored keys, network drop) is counted
as failed and the loop continues; fine at the current handful-of-devices
scale, revisit concurrency only if the subscriber count makes a send
noticeably slow. **How to send an announcement today:**
```bash
cd apps/web
pnpm send-push -- --title "New set: DJ Name" --body "Fresh from the booth" --url /sets/003
pnpm send-push -- --title "Event: Warehouse Session" --body "This Saturday" --url /events/012
```
(requires `apps/web/.env` filled in per `.env.example`, and the two
Cloudflare secrets above set up first). The admin panel, whenever it's
built, calls the SAME `sendWebPush()` from `app/utils/webPush.ts` this
script calls — it adds a UI on top, it doesn't reimplement the send logic.

**Deliberately NOT done:** ~~a "you're subscribed" confirmation state in the
UI (the CTA hides once permission is granted — no positive confirmation
toast, a known gap)~~ — CLOSED 2026-07-16 by the soft-prompt modal's
success phase (see the 2026-07-16 section below); any retry/reconciliation
if the `/api/push-subscribe`
beacon fails to reach the server (same fire-and-forget tolerance every
other beacon in this app accepts); a UI-level unsubscribe (a user revokes
in browser/OS settings, and the next send's 404/410 cleanup removes the
row — building an in-app toggle means building subscription-state UI that
the "no confirmation state" decision above already deferred; both land
together or not at all); a `push_subscribed` analytics event on the
`events` allowlist (would need its own `is_standalone`-shaped decision
like `save_click`/`share_click` got — not asked for, skipped rather than
silently expanding that allowlist); first-save-vs-resubscribe distinction
(the `INSERT OR REPLACE` collapses both into one row either way, so
there's nothing to distinguish yet); any abuse guard on
`/api/push-subscribe` beyond shape validation (anyone can insert
arbitrary-HTTPS rows — bounded by the length caps, low impact, acceptable
at current scale; revisit at the auth/admin-panel milestone, noted
2026-07-16).

**Needs on-device / production-preview confirmation** (as always for
anything SW-adjacent in this repo, plus this phase's own real-network
requirements):
0. **BLOCKER FIRST — wrangler auth.** Live-tested 2026-07-16: `wrangler d1
   execute --remote` fails with `Authentication error [code: 10000]` on
   the current local credentials (consistent with the M3 note that this
   token lacks R2 scopes — it lacks D1 too). `npx wrangler login` (or a
   token with D1 write scope) before ANY of the following; the migration
   AND every send-script run depend on it.
1. The `wrangler pages secret put VAPID_PRIVATE_KEY_JWK` command above —
   not yet run.
2. The `push_subscriptions` table — not yet applied to the remote
   database (use the isolated `--command` above, NOT `--file`).
3. The opt-in tap → soft-prompt modal accept → real
   `Notification.requestPermission()` → real `pushManager.subscribe()`
   round trip on an actual device. NOTE the flow changed 2026-07-16:
   subscribing is now **standalone-only** (product policy — see the
   two-variant modal section below), and a browser tab — including iOS
   Safari, where a tab has no `PushManager` at all — now shows the CTA
   with an install nudge behind it instead of hiding it.
4. A real push actually arriving and calling `sw.ts`'s `push` handler —
   unit tests exercise the SW's parsing/fallback logic directly, they
   cannot simulate a real push service delivery (no jsdom/Playwright
   equivalent for the Push API's OS-level delivery path). **Test iOS
   (installed PWA) FIRST — it doubles as the verdict on the legacy-aesgcm
   encoding caveat above.** Pass = notification appears on the locked
   iPhone; fail = the send script logs a 4xx from `web.push.apple.com`,
   which means swapping `webPush.ts`'s internals for `aes128gcm` before
   anything ships.
5. `notificationclick` deep-linking, both branches: tapping a notification
   while the app is CLOSED (`clients.openWindow`) and while it's already
   OPEN on a different page (`.focus()` + `.navigate()`).
6. `scripts/send-push.ts`'s real `wrangler d1 execute --json` output shape
   on a SUCCESSFUL query — the parsing in `runD1Command()` is defensively
   checked (throws a clear error rather than crashing obscurely on a shape
   mismatch). The FAILURE path got live-verified 2026-07-16 by accident:
   the auth error in item 0 came back as a JSON object on stdout, exactly
   the shape the guard rejects loudly. The success shape still needs one
   watched real run.
7. Dead-subscription cleanup (404/410 → row actually deleted from D1) —
   the status→outcome mapping and the delete-only-on-dead distinction are
   unit-locked (`webPush.test.ts`, mocked builder + stubbed fetch), but a
   REAL push service returning 404/410 for a genuinely expired
   subscription can only be observed on-device (subscribe, uninstall the
   PWA / revoke in OS settings, send again, confirm the row disappears and
   the script reports `dead_removed=1`).

### Added 2026-07-16 — push opt-in soft prompt (two-variant modal)

The bare `notify_me` button is now a **soft prompt**: tapping it opens
`PushOptInModal.tsx`, and the native browser permission dialog does NOT
fire until the user accepts our modal. Rationale: a native "Block" is
nearly unrecoverable (the browser refuses to re-prompt forever), while a
decline of our own modal stays fully recoverable. The guarantee is
unit-locked (`PushOptInModal.test.tsx`): `Notification.requestPermission`
is asserted un-called on open, on decline, and on every browser-tab path —
it fires only from the standalone variant's explicit accept.

**Two variants, branched on the same `SaveGate` the save-for-offline flow
uses** (decision 2026-07-16):

- **Standalone (installed app)** — the real subscribe ask. Accept → the
  existing `useSubscribeToPush()` flow unchanged. The modal owns outcome
  UI: a success phase (closing the old "no subscribed-confirmation" gap),
  a distinct denied phase (blocked at browser level, settings pointer, no
  dead retry button), and a distinct failed phase with `try_again` —
  retry is cheap because a granted permission resolves instantly without
  re-prompting.
- **Browser tab** — NO subscription possible, by product policy:
  subscriptions are app-only, so the tab variant converts notification
  interest into installs instead of losing it. It reuses the exact install
  mechanics `SaveGateModal` uses — `useTriggerInstallPrompt()` when a
  `beforeinstallprompt` is stashed, otherwise the hedged manual copy /
  iOS share-menu steps, now extracted into `InstallInstructions.tsx`
  (shared, not duplicated) — plus the same mutual already-installed /
  not-installed escape hatches. The `open-app` and `cannot-install` gate
  reasons get honest notification-flavoured guidance.

**CTA gating changed with it** (`PushOptInCta.tsx`): the CTA now renders
in tabs too — including iOS Safari tabs with no Push API at all, exactly
the audience the install nudge exists for — and hides in a tab once
permission is known-spent at the origin. In standalone it additionally
returns for the granted-but-unsubscribed case (a subscribe that failed
after the grant, detected via `pushManager.getSubscription()`): the old
"granted hides the CTA" tradeoff was justified by "a tap couldn't prompt
again", which the modal made obsolete.

**Decline semantics (decision + rationale):** declining the modal (either
variant: "not now" or closing without accepting) suppresses the CTA for
the **session only**, via the non-persisted `pushOptInDeclinedSession`
store flag. Three suppression tiers now exist: persisted
`pushOptInDismissed` is reserved for a spent NATIVE ask; the session flag
covers soft-prompt declines (persisting those would recreate the
near-unrecoverable state the modal exists to avoid); no suppression at
all after an accept — even a failed one, so the failed state stays
retryable. Full note in `uiSlice.ts`.

**Analytics quartet** added to the `events` allowlist, mirroring the
`install_*` naming: `notify_prompt_shown` / `notify_install_nudge_shown`
(the two variants becoming visible), `notify_accepted` (accepting OUR
prompt — fires before the native ask, so grant rate is inferable against
the `push_subscriptions` table), `notify_declined` (closing either
variant without accepting/engaging). Install actions inside the nudge
keep reporting through the existing `install_*` events. Anonymous /
aggregate rules unchanged.

**New on-device checks** (append to the checklist above):
8. Standalone modal → accept → native prompt → notification subscribe —
   the full soft-prompt path on a real installed PWA (iOS + Android).
9. Tab modal → install nudge routes correctly on Chrome for Android
   (native `beforeinstallprompt` path) AND on a no-`beforeinstallprompt`
   Chromium browser like Opera (must show the hedged manual copy, not a
   dead install button — same field finding as 2026-07-02).
10. iOS Safari TAB now shows the CTA (it used to hide) → modal must show
   the share-menu install steps, and nothing on that path may touch the
   Notification API (it doesn't exist there — a regression here is a
   hard crash).

### Fixed 2026-07-17 — granted-but-unsubscribed resume path (field bug)

Field report (Android, installed app, post-PR-#7 build): CTA invisible
for a device believed to hold an orphaned LOCAL subscription (subscribed
pre-migration, POST hit a missing table). **CORRECTED 2026-07-18: that
attribution was wrong** — the sole `push_subscriptions` row belonged to a
DIFFERENT device, and the affected device turned out to have no
subscription at all; its CTA was hidden by the persisted denial flag (see
the 2026-07-18 entry below). The two changes in this entry remain correct
code for the states they handle — but neither was what that device
needed, and the orphaned-local-subscription state, while real as a class
(pre-migration window, future dead-row cleanup), has NOT been observed in
the field. (An even earlier diagnosis blamed an unmerged branch — also
wrong, made from stale local refs without fetching; PR #7 was merged and
deployed.)

Two changes:

- **Reconcile re-beacon (the actual field fix):** the CTA's mount effect
  now re-POSTs an existing local subscription via the shared
  `postSubscription()` (extracted in `usePushSubscription.ts`) —
  `/api/push-subscribe` is an idempotent `INSERT OR REPLACE` on
  `endpoint`, so healing a missing row is safe and repeat sends are
  no-ops. Standalone-only: a tab can share the origin's subscription and
  a tab re-POST would flip the row's `is_standalone`. The same edge
  covers any future dead-subscription cleanup that deletes a row for a
  still-live device.
- **Granted-but-unsubscribed resume path:** when `getSubscription()`
  really returns null but permission is granted (a subscribe that failed
  before reaching the push service), the modal used to reopen the soft
  prompt — a redundant ask. Now it resumes the subscribe directly on
  open: busy → subscribed/failed, engaged-from-start (closing a failed
  resume is not a decline), outside the notify_* funnel (no ask was
  shown), and `useSubscribeToPush` skips `requestPermission` entirely
  when the grant already exists — the "native dialog only from a modal
  accept" guarantee is now literal, unit-locked in all three suites.

~~New on-device check: on the affected Android device, open the installed
app's home once → the device's row appears via the re-beacon.~~ VOID
2026-07-18 — written for the wrong diagnosis; that device had nothing to
re-beacon. The re-beacon path stays unit-locked but has no field
verification case yet. The device's real check lives in the 2026-07-18
entry.

### Fixed 2026-07-18 — persisted denial flag deferred to live permission (field bug)

Field sequence (Android, installed app, user-diagnosed): tapped
**Block** on the native permission dialog at some point →
`pushOptInDismissed` persisted → CTA hidden. Later re-enabled
notifications EXTERNALLY (Android Settings → Notifications → Apps →
Form:at). The app never re-checked live permission — the flag alone kept
the CTA hidden forever, with no in-app path back. **Root design flaw:
the persisted flag was acting as the source of truth when the real one,
`Notification.permission`, is live-queryable and changes outside the app
** (Android app settings, Chrome site settings, permission resets).

Fix (`PushOptInCta.tsx`, reconcile effect): on mount, after hydration,
read `Notification.permission` fresh. The flag only keeps suppressing
while live permission is still `"denied"`; any other value means it's
stale → cleared. The states then route themselves through existing
gating: granted-but-unsubscribed → CTA → direct-subscribe resume (busy →
subscribed, NO dialog); back to `"default"` (permission reset) → CTA →
full soft prompt. Read via `getState()` deliberately: a flag set
mid-session (native prompt dismissed without choosing leaves permission
`"default"`) keeps THIS session's suppression and reconciles on the next
mount — so the dismissed-without-choosing case now degrades from
"hidden forever" to session-scope suppression. That original
hide-forever rationale predates the soft prompt (the CTA no longer fires
the native dialog on tap); `uiSlice.ts`'s flag comment is rewritten to
match.

Verified vs inferred: the reconcile logic + both transitions
(granted / default) are unit-locked (three new CTA tests). The exact
mapping of the Android app-level notification toggle onto
`Notification.permission` for a WebAPK is INFERRED, not device-verified:
re-enabling is expected to read `"granted"` (the origin's site permission
was never revoked; Chrome binds the WebAPK's notification channel to it),
while a Chrome site-settings reset reads `"default"`. The fix doesn't
depend on which one is right — both un-hide the CTA and route to the
correct ask. The on-device check below settles it.

Considered, NOT implemented — muted denied-state CTA ("notifications are
blocked for form:at — enable them in your device settings" instead of a
fully hidden CTA). Trade-off: honest-disclosure precedent (Opera hedged
copy) favours it, but unlike Opera's case this user explicitly said no —
a permanent passive pointer in the nudge zone reads as nagging past a
clear refusal, and the modal's denied phase already gives the settings
pointer to anyone who engages. With this fix, a user who changes their
mind via settings self-heals on next visit, which covers the field case.
Revisit if analytics/support show users stuck wanting notifications
without finding device settings.

On-device check (THIS device): after merge + deploy, open the installed
app's home → CTA must reappear (no dialog) → tap `[ notify_me ]` → modal
opens blank for a beat (no "setting up…" copy — removed 2026-07-20) then
lands on success copy, still no native dialog → `SELECT endpoint FROM
push_subscriptions` now shows TWO rows (the other device's plus this
one's). Also confirms whether live permission read `"granted"` (direct
subscribe, as expected) or `"default"` (soft prompt shown first) — note
which, to settle the inference above.

### Reference 2026-07-19 — push device lifecycle: the canonical state machine

Answers "why does/doesn't the CTA show on this device right now" for any
device without reading code. A device's push state is the product of
three axes:

- **A** — live `Notification.permission`: `default` / `granted` / `denied`
- **B** — local browser subscription (`pushManager.getSubscription()`):
  exists / none
- **C** — server row in `push_subscriptions` (keyed on endpoint):
  exists / none

Overlaid by two suppression flags (`uiSlice.ts`): `pushOptInDismissed`
(persisted, honoured only while A=denied — reconciled against live
permission on CTA mount, 2026-07-18) and `pushOptInDeclinedSession`
(this session only). CTA gating (`PushOptInCta.tsx`): **standalone**
shows when A=default OR (A=granted AND B=none); **tab** shows when A is
unreadable (no Push API — iOS Safari tab) or default; A=denied hides the
CTA everywhere. **C is invisible to gating** — the client never queries
the server; C only matters to the send script.

| # | A | B | C | user sees | in / out |
|---|---|---|---|-----------|----------|
| 1 | default | – | – | CTA visible; standalone → soft prompt, tab → install nudge | Fresh device (or post-reset). Out: accept + native Allow → 2; native Block or dismiss → 5 (flag set); soft "not now" → hidden this session only |
| 2 | granted | yes | yes | CTA hidden — healthy subscribed state | Out: app-notification toggle OFF → 6; Chrome site-settings reset → 1 (sub dropped; stale row 410s at next send); browser subscription rotation → 4 |
| 3 | granted | yes | – | CTA hidden; heals silently | Orphaned row-loss (pre-migration class; row deleted while device live). The mount re-beacon re-POSTs the local sub → 2. No user action involved |
| 4 | granted | – | any | CTA visible → tap → **direct subscribe** (brief blank pause, no loading copy, → success — NO dialog) | Local sub lost (failed subscribe after grant, rotation) or post-re-enable. New subscribe = new endpoint = new row; any stale row dies at next send (410) |
| 5 | denied | – | – | CTA hidden everywhere | Native Block, native dismiss, or Android app-notification toggle OFF (**field-verified 2026-07-19: toggle-off reads as "denied"**). Out: Android settings re-enable → A=granted → 4; Chrome site reset → 1 |
| 6 | denied | ? | yes | CTA hidden; row is dead but present | Subscribed then toggled off. Next send → FCM 410 → cleanup removes row → 7 |
| 7 | denied | ? | – | CTA hidden — terminal until user acts | `dead_removed`. Re-enable → A=granted → 4 **if** B reads none (see open question) |

**Open question (B = "?" in 6/7):** whether `getSubscription()` returns
null or the stale subscription after a toggle-off → toggle-on cycle is
NOT field-verified. Null → state 4 → clean direct re-subscribe. Stale →
the CTA hides (granted + B=exists) and the re-beacon re-POSTs a dead
endpoint (harmless — it 410s out again — but the device never
re-subscribes without a site-data reset). On-device check: on the
dead_removed device, re-enable notifications in Android settings, open
the app → if the CTA reappears, B reads null (good); if it stays hidden,
we need dead-sub detection (unsubscribe+resubscribe keyed off send-time
410s, or channel validation at mount).

Clear-site-data resets everything client-side (A→default, B→none, flags
wiped) but leaves C — looks like state 1; the stale row 410s out after
the next send.

**Field-verified lifecycle stories:**
1. **The dead-end device** (2026-07-18→19): 1 →(native Block)→ 5
   →(Android settings re-enable)→ 4 →(tap → direct subscribe, no
   dialog)→ 2. The 2026-07-18 reconcile fix is what makes the 5→4 edge
   exist at all.
2. **The dead_removed device** (2026-07-19): 2 →(app-notification toggle
   off)→ 6 →(send attempt → FCM 410)→ 7, row removed server-side.
   OS-level unsubscribe works end-to-end with no in-app affordance.

### Fixed 2026-07-19 — accept flow read as TWO modals (geometry jump)

Field bug: accepting the soft prompt "produces one modal and then
another". There is no second mount — `PushOptInModal` is one `<dialog>`
whose phases render in place (unit-locked: dialog count stays 1 through
accept). The illusion was geometric: `Modal.tsx`'s panel is
`fixed inset-0 m-auto h-fit`, so it resizes AND recenters on every
body-height change. The ~200px idle ask collapsed to a one-line "setting
up notifications…" then swapped to a short success paragraph — with the
OS permission sheet interleaved, the differently-sized, differently-
positioned, fully-reworded box read as a new modal. Fix:
- the subscribe-variant body is wrapped in a `min-h-48` container keyed
  by phase — geometry stays pinned near the tallest phase, and the key
  re-runs `animate-fade-in` so each phase change is an explicit in-place
  transition;
- the success phase now carries BOTH messages in one surface —
  "notifications on." (white, the confirmation) + "we'll ping you when
  something new drops — no spam, just the signal." (grey, the
  reassurance) — plus an explicit `[ done ]` that closes without
  counting as a decline (field users didn't reliably find `[ x ]`).

**Follow-up 2026-07-20:** the "setting up notifications…" busy copy this
fix pinned in place was ITSELF field-reported as noise (see the entry
below) — it's now removed rather than geometry-stabilized. The min-h
pinning and keyed-transition mechanism from this fix stay; only the busy
phase's content changed.

### Fixed 2026-07-20 — busy phase read as the modal "turning pages by itself"

Field feedback (screenshots reviewed): on the direct-subscribe path
(permission already granted), tapping `notify_me` flashed "setting up
notifications…" for the few hundred ms `subscribe()` takes, then swapped
to success — even with 2026-07-19's geometry pinning, a same-sized,
same-position but fully-reworded box reads as the modal changing pages
on its own. Reference behaviour: `SaveGateModal` never self-advances —
stable content per situation.

Root cause (`PushOptInModal.tsx`): a single `"busy"` phase rendered the
same loading text for two structurally different situations — the
native-dialog accept (where the ask was just shown and dismissed) and
the direct/resume path (where NO ask was ever shown, so busy copy was
the FIRST thing the user saw appear, unprompted).

Fix — split into two phases with different visibility rules, both still
in-flight states internally:
- **`"busy"`** (native-dialog path, `handleAccept`): the ask content
  (`askContent`) stays ON SCREEN, `opacity-50 pointer-events-none` and
  the `enable_notifications` button's native `disabled` attribute set —
  a dim/disable transition on the SAME content, not a swap. The geometry
  key groups `"idle"` and `"busy"` together (`geometryKey`,
  `PushOptInModal.tsx:223`) so React doesn't remount/re-fade for this
  transition — only a genuine content change gets the fresh mount.
  Net result: the modal's visible content changes exactly ONCE per
  accept (ask → outcome), never ask → busy → outcome.
- **`"resuming"`** (direct/resume path, the granted-but-unsubscribed
  open-effect): renders `null`. There's no honest copy to show before
  the outcome is known — the ask was never shown, so there's nothing to
  hold in place or dim — and the window is a few hundred ms; Julian's
  call was not to cover it with loading copy at all. `min-h-48` still
  reserves the geometry so the eventual outcome doesn't jump the modal.
  Net result: "outcome only" — the direct path shows exactly one
  content change (blank → outcome), same as before this fix but now
  honestly blank instead of narrating a step the user doesn't need to
  see.

Both paths still fall through to the existing `"failed"` phase (retry
button, not-a-decline) unchanged — only the in-flight rendering changed,
not the outcome handling. Unit-locked: dialog count stays 1 through
both paths' entire flight (regression guard against the 2026-07-19
bug's mechanism recurring), native path's ask copy + disabled button
assert mid-flight via a controllable (not just fast) mock promise, and
direct path asserts no busy/ask copy at any point.

State-machine reference (2026-07-19, above): row 4's "user sees" column
updated to drop "busy" wording; the on-device check's quoted copy
updated to match. The phase machine itself (`idle`/`busy`/`resuming`/
`subscribed`/`denied`/`failed`) still exists internally — only which
phases render distinct copy, and to whom, changed.

### Added 2026-07-20 — notification badge icon (Android status-bar mask)

Field bug: the Android status-bar/notification-shade icon rendered as a
generic solid square instead of the F mark. Root cause, verified two
ways: (1) MDN (`ServiceWorkerRegistration.showNotification()`, fetched
2026-07-21) — the small status-bar icon is a SEPARATE option named
`badge` (not a resized `icon`), recommended ~96×96px, and "the image
will be automatically masked"; (2) pixel-level check of the asset the SW
was passing as `badge` — `icon-192.png` — showed alpha=255 at every
single pixel (`identify`/PIL, verified). Android/Chrome discard color
and mask using ONLY the alpha channel, so a uniformly-opaque icon masks
to a uniform (square) shape regardless of what's drawn on it — that's
the bug, not a missing asset.

Fix: `apps/web/public/badge-96.png`, derived (not hand-drawn) from the
existing `icon-512.png` brand mark — the source icon is already a flat
white "F" silhouette on black (verified: 82 unique colors in the whole
512×512 image, dominated by pure black/white with a thin antialiased
edge), so luminance IS the shape's alpha channel. Script mapped
luminance → alpha and forced RGB to white at 96×96 (one-off, run
locally with `sharp` — already a project dependency — not added as a
permanent build step; there is no existing "icon pipeline" to hook into,
see below). Verified the output: RGB is uniformly `(255,255,255)`
across every pixel, alpha spans the full 0–255 range tracing the F
shape, and a composite over a colored background renders the F cleanly.

`sw.ts`'s push handler (`:233-241`) now passes `badge: "/badge-96.png"`
instead of reusing `icon-192.png`; `icon` was already correctly set to
the app icon (`icon-192.png`) — confirmed present, no change needed
there.

**Icon pipeline finding:** there isn't one. `icon-192.png` / `icon-512.png`
are hand-placed static files in `apps/web/public/`, referenced directly
by path from `manifest.json` and `sw.ts` — no generation script, unlike
`optimize-images.mjs` (which targets content images — set art, flyers —
output to `public/images/`, a different asset class entirely). Following
the existing convention meant: derive the asset once, drop the PNG
directly in `public/`, reference it by path. If icon assets multiply
(more sizes, more purposes), a small `scripts/generate-icons.mjs` sibling
to `optimize-images.mjs` would be the natural next step — not done now,
one new asset doesn't justify a script.

Note for future sends: badge rendering is monochrome BY SPEC, not a
Form:at choice — Android/Chrome use only the alpha channel and discard
whatever RGB is supplied (the derivation above sets RGB to white for
correctness/clarity when previewing the asset directly, but the OS would
mask identically if it were any other color, since only alpha carries
shape information).

Tests: not unit-locked. `sw.ts` has no existing unit-test harness — it's
a genuine service-worker module (`self.__WB_MANIFEST`, `workbox-precaching`,
`self.addEventListener`) with no jsdom-compatible test target today, and
building that harness is beyond this pass's scope (flagged, not built).
On-device check: trigger a real push send → Android notification shade
shows the F silhouette, not a solid square.

### Added 2026-07-21 — notification polish (image, vibration, actions, requireInteraction, timestamp)

Extended the push notification surface beyond title/body/url. Verified
the current state first rather than trusting a prior summary: confirmed
by reading `webPush.ts`, `sw.ts`'s push handler, and `send-push.ts` fresh
— payload really was title/body/url only, icon+badge really were
hardcoded, no vibration/actions/image existed anywhere.

**Architecture:** a new pure module, `~/utils/pushNotification.ts`,
owns `buildNotificationOptions(payload)` (payload → `NotificationOptions`)
and `resolveNotificationClickUrl(action, url)` (click routing). Pure and
SW-global-free on purpose — `sw.ts` has no jsdom test harness (Phase 2's
finding, still true), so pulling the payload-shaping and click-routing
logic OUT of `sw.ts` and into a plain module is what makes any of this
pass unit-testable at all. `sw.ts`'s handlers shrink to gluing this
module's output to `self.registration.showNotification` /
`self.clients`.

**TypeScript gap, verified not assumed:** `image`, `vibrate`, `actions`,
and `timestamp` are all real, shipped `NotificationOptions` fields (MDN,
fetched 2026-07-21) that are simply ABSENT from TypeScript's bundled
`lib.dom.d.ts` and `lib.webworker.d.ts` (checked directly against the
installed `typescript` package — both files declare only `badge`, `body`,
`data`, `dir`, `icon`, `lang`, `requireInteraction`, `silent`, `tag`).
Handled with a local `PushNotificationOptions = NotificationOptions & {…}`
extension rather than `any`, per CLAUDE.md's "unknown + narrowing" rule —
structural typing means the widened object still satisfies
`showNotification`'s narrower parameter type with no cast needed.

1. **Image** — `PushPayload.image?: string`, passed straight through as
   `NotificationOptions.image` (MDN, verified: "a string containing the
   URL of an image to be displayed in the notification," silently omitted
   if absent — no special handling needed). **Does NOT need to be
   absolute** — checked directly, not assumed: set/event artwork lives on
   formatglasgow.com's own `/images/` path via the responsive-image
   pipeline (`app/utils/jsonld.ts`'s `imageUrl()` → `${SITE}/images/…`),
   NOT on `cdn.formatglasgow.com` — that CDN (TECH_DEBT 19) is audio-only
   (`AUDIO_HOST`/`AUDIO_ORIGIN` in `utils/audioHost.ts`). This corrects
   the task's own premise. A relative path resolves against the SW's own
   origin exactly like `icon`/`badge` already do (both already ship as
   root-relative paths with zero issue); an absolute URL works too if
   that's more convenient when pulling from elsewhere.
2. **Vibration** — a fixed `vibrate: [100, 50, 100]` (short buzz-pause-
   buzz, ~250ms total) applied to EVERY push, not payload/CLI-configurable
   — a vibe check, not a feature to design options around. Support is
   real but partial (MDN marks `vibrate` "Limited availability… does not
   work in some of the most widely-used browsers" — notably iOS/Safari).
   Degradation is silent by the same mechanism `icon`/`badge` already rely
   on unconditionally in this codebase: unsupported `NotificationOptions`
   dictionary members are ignored, not thrown — an inference from
   established WebIDL dictionary behavior and this file's own existing
   precedent, since MDN's page didn't spell out the no-op explicitly for
   this specific field.
3. **Action buttons** — a fixed pair, not payload/CLI-configurable:
   `view` / `later`. Wording decided over the alternatives ("listen now"/
   "later", "view"/"dismiss"): "view" over "listen now" because a push
   can announce a set OR an event, not only audio; "later" over "dismiss"
   to match the app's existing soft-decline voice (`PushOptInModal`'s
   "not now") rather than reading as a rejection of the channel itself.
   `view` reuses the same `url` the notification already carries (no new
   field) — simplest shape, no new CLI flag. Routing verified against
   MDN's `NotificationEvent.action`: empty string for a body tap, the
   action's id for a button tap — `resolveNotificationClickUrl` returns
   the url for both a body tap AND `view` (identical destination), `null`
   for `later` (close only, don't navigate). Considered and rejected: the
   per-action `navigate` field MDN also documents (browser navigates
   directly, bypassing `notificationclick` entirely) — would fragment
   click handling across two mechanisms and skip the already-hardened
   focus-existing-window/fallback logic in the `notificationclick`
   handler for one of the two actions. Per-action `icon` also skipped —
   not requested, rarely rendered in practice, and MDN's phrasing around
   it reads more like a typical schema field than a hard requirement (no
   documented throw for omitting it, unlike `renotify` + empty `tag`).
4. **`requireInteraction`** — real, verified (MDN: boolean, defaults
   `false`/auto-hide). Defaults OFF (omitted unless the payload sets it
   true — a routine "new set" ping should auto-hide); exposed as
   `--require-interaction true` for a genuinely urgent send.
5. **`renotify`** — investigated, NOT added. MDN: only applies when a new
   notification reuses an EXISTING tag (replace-in-place) — the whole
   point is whether that replacement re-alerts. Since yesterday's fix
   already makes `tag` unique per push (`format-${Date.now()}`, specifically
   to stop same-day announcements from collapsing into each other), the
   precondition for `renotify` to ever matter — two notifications sharing
   a tag — never occurs in this app. Confirmed moot, not added as a dead
   option.
6. **`timestamp`** — real, verified (MDN: Unix ms, meant for exactly the
   "message that couldn't be delivered immediately because the device was
   offline" case — which the existing 24h TTL makes a real scenario here).
   Trivial: `send-push.ts` captures `Date.now()` once per run and includes
   it unconditionally (no CLI flag — there's no "off" state worth
   exposing) via `PushPayload.timestamp`.

**CLI** (`send-push.ts`): a plain send is unchanged —
`--title / --body / --url`. Two new opt-in flags, `--image <url>` and
`--require-interaction true`; `timestamp` is automatic. No flag was added
for vibration or actions — deliberately, since neither is configurable.

```bash
# plain send (unchanged)
pnpm send-push -- --title "New set: DJ Name" --body "Fresh from the booth" --url /sets/003

# fully loaded — every optional field in one send
pnpm send-push -- --title "Event: Warehouse Session" --body "This Saturday, doors 11pm" \
  --url /events/012 --image /images/events/012-1080.webp --require-interaction true
```

**Tests:** `pushNotification.test.ts` (new, 12 tests) locks
`buildNotificationOptions`'s always-present shape (body/icon/badge/
vibrate/actions/data) and that image/requireInteraction/timestamp are
each conditionally applied — including the `timestamp: 0` edge (a
presence check, `!== undefined`, not a truthiness check, since 0 is a
legitimate Unix timestamp) — plus `resolveNotificationClickUrl`'s four
routing cases. `webPush.test.ts` gained one passthrough test: a
kitchen-sink `PushPayload` (every optional field set) survives unchanged
into the `buildPushHTTPRequest` call — `sendWebPush` treats payload as
opaque, so nothing here validated that a future refactor couldn't
silently drop a field; now something does.

**New on-device checks** (append to the Phase 2 checklist above):
11. Image renders in the expanded notification (Android notification
    shade, pulled down).
12. Vibration fires on receipt — short, not jarring (confirms the
    pattern reads as intended, not just that it's wired).
13. Both action buttons (`view` / `later`) appear on the notification;
    `view` and a body tap both open the same deep link, `later` closes
    the notification with no navigation.
14. With `--require-interaction true`: the notification stays visible
    until manually dismissed, confirming the flag actually changes
    device behavior (not just that the option is passed).

### Implemented 2026-07-22 — third bracket-CTA treatment: shared `ToastShell` (was: "Proposed 2026-07-19")

Julian's call on the 2026-07-19 proposal below: unify all three toasts —
error stays red-toned, everything else (including the generic ephemeral
`Toast`) adopts the gold-border/grey-text/padding treatment `UpdateToast`
already shipped. Extracted `ToastShell` (`components/ToastShell.tsx`)
owning the wrapper positioning (verified byte-identical across all three
consumers before extracting, still true) and the surface treatment
(`bg-black`, border, `px-5 py-3.5`, `gap-4 max-w-sm`,
`animate-fade-in-up`), with a `variant` prop mirroring `Button.tsx`'s
existing `Record<Variant, string>` idiom rather than a new mechanism:

- `"default"` — gold (`UpdateToast`, the generic `Toast`).
- `"error"` — red equivalent, same mechanics (border brightens
  `/40 → hover:/70 → active:` full, same for text), preserving the
  urgency read (`PlaybackErrorToast`).

Zero behavior change: all three consumers' existing test suites pass
unchanged. Notably, `Toast`'s own timed enter/exit
(`fadeInUp`/`fadeOutDown`, driven by its `exiting` state — a LIFECYCLE
concern, deliberately kept separate from the visual unification) is
passed as an inline `style` prop, which wins over `ToastShell`'s default
`animate-fade-in-up` class via ordinary CSS specificity — no conditional
class-dropping needed. `PlaybackErrorToast`'s message keeps its
`flex-1` (pushes `[ x ]` to the far edge) since `ToastShell` only owns
the shared row, not each consumer's own child layout. New
`ToastShell.test.tsx` locks the variant → class mapping and the
style-override behavior directly, since it was clean to test in
isolation; the three consumers' unchanged suites remain the behavior
regression guard.

### Decided + implemented 2026-07-22, option (b) — notify_me CTA entrance fade (was: "Finding 2026-07-19")

Root cause (unchanged from the 2026-07-19 finding below): the `visible`
state + opacity-transition pattern only animates if the browser paints
the opacity-0 frame before the flip — this element mounts LATE (after
the permission-read effect / async `getSubscription()` / flag-reconcile
re-render), so insertion and the flip can land in the same paint and the
fade never plays.

Fixed with option (b): `PushOptInCtaButton` now applies
`animate-fade-in` (or `animate-slow-fade-in` on true first load — same
5s/0.6s convention as before, unchanged) directly on mount; the
`visible` state + effect are gone. Verified, not just cited, that
BottomNav's keyframe-flash caveat doesn't apply here before relying on
it: that caveat is specific to elements present in the SSR'd HTML, where
attaching an animation only client-side jumps the element back to the
keyframe's 0% before replaying. `useStoreHydrated()`'s
`getServerSnapshot` (`store/index.ts`) unconditionally returns `false`,
so this whole subtree is NEVER in the server-rendered HTML — its first
DOM appearance full stop IS this mount, so the keyframe's 0%→100% is the
honest first frame, not a jump from an already-painted state. Visual-only
change; existing `PushOptInCta` test suite (no assertions on
opacity/animation) passes unchanged.

### Finding 2026-07-19 — notify_me CTA entrance fade unreliable (original, resolved above)

The fade IS wired (`PushOptInCta.tsx` → `PushOptInCtaButton`, 5s/0.6s
first-load convention) and was never removed (diff-verified: untouched
since 2e4972b). Root cause: the `visible` state + opacity-transition
pattern only animates if the browser PAINTS the opacity-0 frame before
the flip to 1. The home hero/socials mount with the route commit, so
that frame paints. The CTA mounts LATE — after the permission-read
effect, the async `getSubscription()` resolution, or the flag-reconcile
re-render — so insertion and the flip can land in the same paint: first
computed style is already opacity 1 → no transition → pop-in. Options:
(a) double-rAF before `setVisible(true)` (SwipeNavigator precedent);
(b) switch to the `animate-fade-in` keyframe on mount — keyframes always
run on insertion (BottomNav's keyframe-flash caveat doesn't apply: this
element is client-conditional, never SSR-rendered); (c) drop the
entrance. Recommendation: (b) — one class, deletes the state+effect.
Julian decides.

### Proposed 2026-07-19 — third bracket-CTA treatment for toast surfaces (original, resolved above)

Direction (Julian): gold border works at toast size, gold TEXT doesn't;
needs more padding to read. That treatment already exists concretely in
`UpdateToast` since the 2026-07-18 polish — spec, for extraction as the
canonical "toast CTA" treatment: `bg-black`, `border-gold/40`
(hover /70, active full gold), message `text-grey text-xs`, action as
gold `BracketLabel` with the label going white on press, `px-5 py-3.5`
(exact 44px target), `gap-4 max-w-sm`, `whitespace-nowrap` on the
bracket, `animate-fade-in-up` entrance. NOT implemented as a shared
variant yet — deliberately: unifying means touching `PlaybackErrorToast`
(red; does the error tone adopt the same padding/entrance, or stay
visually distinct?) and `Toast` (ephemeral auto-fade; probably stays
lighter), all three field-hardened, and those are art-direction calls.
The three positioning wrappers are already copy-identical (same bottom
math in all three files) — when the direction lands, extract a
`ToastShell` owning wrapper + surface treatment in one place.

### Decided 2026-07-19 — in-app unsubscribe still deferred

With real members subscribed, re-evaluated: still no in-app unsubscribe.
Why: the OS-level path is field-verified end-to-end TODAY (dead_removed
story — Android toggle → 410 → row cleanup), and it lives where users
already look for notification control; iOS has the same per-app toggle;
410 cleanup keeps the table honest without user action; the audience is
collective members who asked for the pings. A minimal affordance would
be small (`getSubscription().unsubscribe()` + a DELETE endpoint) but its
natural home is the future settings/manage view (TECH_DEBT's manage-view
precedent) — a lone "unsubscribe" button with no settings surface around
it isn't worth the surface area yet. Revisit on ANY of: a member asks
how to stop notifications; the settings/manage view lands; send cadence
rises beyond occasional pings.

### Decided 2026-07-17 — NO further app-gate abstraction yet (rule of three)

Analysed save-for-offline vs push opt-in for a shared "app-gated
capability" abstraction (a `useAppGate(feature)` hook / generic
`AppGateModal` shell). **Decision: don't — the current sharing level is
the right stopping point.** The full pattern map lives in the Reference
section ("App-gated capability pattern"); the short version of why:

- Everything mechanical is ALREADY shared: `useSaveGate` (the decision),
  `useTriggerInstallPrompt` (the action), `InstallInstructions.tsx` (the
  field-tested manual/iOS copy), `TextButton`, `Modal`. What remains
  duplicated between `SaveGateModal` and `PushOptInModal` is ~40 lines of
  declarative branch JSX each — and the parts that vary inside it (lead
  copy, close-time analytics, dismiss-flag semantics) are exactly the
  parts that would become 6-8 configuration props on a generic shell.
- The two modals deliberately DISAGREE at close time (SaveGateModal:
  `pwaInstallDismissed` + conditional `install_dismissed`;
  PushOptInModal: `notify_declined` + session-only flag, never touches
  `pwaInstallDismissed` — the uiSlice "one ask must not answer the
  other" rule). A shared shell would have to take that behaviour as
  callbacks, i.e. it would abstract nothing.
- PushOptInModal's standalone subscribe variant (phase machine:
  idle/busy/subscribed/denied/failed) has no SaveGateModal counterpart —
  in a generic shell it becomes an opaque slot that bypasses the
  abstraction.

**Revisit trigger:** when a THIRD app-gated capability appears (anything
"this lives in the installed app" — background-sync surfaces, badging,
share-target…). At that point: extract the branch ladder as an
`AppGateGuidance` component taking per-branch lead copy, and consider
renaming `useSaveGate` → `useAppGate` (it is already feature-agnostic;
only its name is save-specific — a rename was skipped now because it
would churn many imports/tests for zero behaviour).

### Added 2026-07-23 — Phase 4.5: beacon queue + Background Sync (TECH_DEBT 4)

A failed `/api/signal` play beacon (offline at call time — the metro
scenario Phase 4's offline playback exists for) used to just be lost, no
retry. Full detail + the exact file shapes live in TECH_DEBT.md item 4
(stamped ✅ Resolved) — this entry is the SW-touching-change log line that
file's own convention doesn't cover: `sw.ts` gained one new listener,
`self.addEventListener("sync", ...)`, replaying `data/beacon-queue.ts`'s
queue via `fetch` inside `event.waitUntil()`. Verified against MDN before
writing anything (same rigor as every other SW API this project has
added): `sendBeacon` is Window-only, confirmed absent from
`WorkerNavigator` — the SW side has to use `fetch`, not the API the page
side uses. TypeScript's bundled lib doesn't define Background Sync's types
at all; declared locally rather than reaching for `any`.

Real coverage gap, not a theoretical one: Safari (desktop + iOS) and
Firefox don't support Background Sync at all (~77% global support,
Chromium-only in practice, verified against caniuse) — `BeaconQueueFlusher.tsx`
is the deliberate fallback (replays on mount + the `online` event, page-
context only, so it can't replay after the tab closes the way Background
Sync can). No UI surfaced either way, matching TECH_DEBT 4's own scope.

On-device check (new): seed the queue offline (airplane mode mid-playback
on a saved set), reconnect, confirm a real `/api/signal` request fires and
D1 receives it, queue is then empty — this item's own original
verification wording. `sw.ts`'s `sync` listener itself has no jsdom
coverage (the same gap every other SW handler in this file has noted), so
this on-device pass is the only place that wiring gets verified.

### Added 2026-07-27 — internal admin analytics dashboard (`/admin/dashboard`)

Read-only dashboard over the analytics already being collected — no new
tracking. Branch: `feat/admin-dashboard`, extended same-day with a second
pass (four more views, below) on `feat/admin-dashboard-v2`.

**Branch-state note:** the v2 pass was asked for as a fresh branch off
`main` once `feat/admin-dashboard`'s PR merged — it hadn't: that branch's
work was still uncommitted (never pushed, no PR opened). `feat/admin-
dashboard-v2` was created from the same tip regardless (equivalent to
`main` plus those uncommitted files) rather than inventing a commit/push/PR
flow on Julian's behalf. Both branches' changes are uncommitted as of this
entry — reconcile branch/PR strategy before either lands (e.g. squash into
one PR, or commit+PR the first pass before rebasing v2).

**No in-app authentication — deliberate, not an oversight.** The route is
protected at the edge by Cloudflare Access (a policy on `/admin/*` allowing
exactly the team's 3 emails), which Julian configures himself outside this
repo's scope — **not yet set up**, so the route is currently reachable by
anyone who finds the URL until that policy is added. The route file
(`routes/admin/dashboard.tsx`) carries a top-of-file comment to stop a
future session from "fixing" the missing login check with a weaker
client-side mechanism. Two independent layers keep it out of casual
discovery in the meantime: `noindex` (via a new optional param on
`utils/head.ts`'s `pageHead()`) and exclusion from the sitemap, which is
automatic — `scripts/generate-sitemap.ts` only emits routes from its own
explicit `staticRoutes` allowlist, and `/admin/dashboard` was simply never
added to it.

**Five metric groups, all aggregate SQL (`COUNT`/`GROUP BY`), nothing
pulled row-by-row into the client:**
- **Install funnel** — `install_prompt_shown` / `install_accepted` /
  `install_dismissed` counts from `events`, plus conversion rate
  (accepted ÷ shown). Conversion renders as `—` (not `0%`) when nothing's
  been shown yet — "no data" and "0% conversion" are different facts.
  **v2:** each of the three stages also gets its own 60-day/7-day-bucketed
  trend sparkline (`shownTrend`/`acceptedTrend`/`dismissedTrend`), same
  shape as app-launches/push-subscriber growth below — one `TerminalRow`
  per stage, reusing the exact row-per-trend layout already established for
  those two rather than building a combined multi-series chart for three
  data points. One D1 query covers all three (`GROUP BY day, event_type`),
  not three separate day-bucketed queries.
- **App launches** — total `app_launch` count, plus a 60-day trend bucketed
  into 7-day sparkline bars. Reuses `set-stats.ts`'s existing
  `fillDailyWindow`/`bucketByWeek`/`TREND_WINDOW_DAYS`/`TREND_BUCKET_DAYS`
  (exported for this, generalized from a `plays`-specific field name to
  `count` — second real consumer, not a speculative export) and
  `utils/fmt.ts`'s `asciiBar()` sparkline renderer, the same shape already
  used for per-set play trends.
- **Plays** — total count, top 5 sets by play count, and an offline/online
  split from `is_offline`. Rows with `is_offline IS NULL` (pre-2026-07-08
  or a stale client mid-rollout) count toward the total but are excluded
  from the split — same exclusion `schema.sql`'s own "useful queries"
  comment documents for this exact ratio. **v2:** a new `// per_set_plays`
  section adds a set picker (a row of `<Button variant="secondary">`
  labeled by artist — the app has no `<select>`/dropdown convention, and a
  native `<select>` would break the bracket-button design-system rule, so a
  button row was the closest fit for a 4-set catalogue) that shows the
  selected set's play count + 60-day trend. **Reuses `fetchSetStats` as-is**
  — the same `createServerFn` `/sets/$setId` already calls in its own
  loader — rather than duplicating its query. `set-stats.ts` is a shared
  data module, not the public route itself, so importing it into the admin
  route is architecturally identical to `admin-stats.ts` already importing
  its trend-bucketing helpers from that same file; no extraction needed.
  Called directly from a client `useEffect` on picker selection — the first
  client-invoked `createServerFn` call in this codebase (every prior call
  site is inside a route `loader`) — deliberately, so switching sets
  re-fetches only that one set's stats instead of re-running the whole
  dashboard loader's five aggregate queries again.
- **Push subscribers** — total, standalone-vs-tab split (`is_standalone`),
  and the same 60-day/7-day growth trend as app launches. **Only ever
  selects `is_standalone`/`created_at`/`COUNT` from `push_subscriptions`
  — never `endpoint`/`p256dh`/`auth`.** Per that table's own schema.sql
  comment, `endpoint` is an addressable per-device token by necessity
  (that's how push delivery works) and the mitigation is scope, not
  anonymity: this dashboard reads aggregate counts only, holding the same
  discipline every other consumer of that table besides the send script
  itself must hold to. Locked by a dedicated regression test (below).
- **Clicks** — `save_click` / `share_click` counts from `events`. **v2:** a
  new per-set breakdown (`GROUP BY set_id, event_type`, mapped to
  title/artist via `getSet()` from `data/sets.ts` since `events` stores only
  `set_id`, no denormalized title/artist the way `plays` does), rendered as
  a ranked list (highest save+share total first) — matching the existing
  top-sets-by-plays list shape for visual consistency. **Full list, not
  top-N** — today's catalogue is 4 sets, so "top 5" and "all" are the same
  list, and click volume per set is low enough that a hardcoded `LIMIT`
  risks silently hiding a set with real signal once the catalogue grows;
  revisit with a `LIMIT` if the list becomes unwieldy later.

**v2 addition — install → push-subscribe conversion (`installToPushConversion`).**
⚠️ **Aggregate approximation, not a tracked per-user funnel — read before
trusting this number.** `install_accepted` lives in `events`, anonymous by
design (no device identifier); `push_subscriptions` is a separate table
with no shared key (see both tables' own schema.sql comments on why they're
never joined). This stat is just `pushSubscribers.total ÷
installFunnel.accepted` — two independent aggregate counts divided, nothing
more. A tab subscriber who never saw an install prompt, or one device
re-subscribing after clearing site data, both move this number without
corresponding to "one more converted install". Computed with **zero new
queries** (both counts are already fetched for their own sections) via a
small pure `computeInstallToPushConversion()` helper, extracted specifically
so the null-vs-zero edge case (no accepted installs to divide by) is
unit-testable without needing a fake `D1Database`. Rendered in the
`install_funnel` section as `install_to_push`, with a visible caption below
the row: *"install_to_push is an aggregate approximation, not a tracked
per-user funnel — install events are anonymous and push_subscriptions
shares no key with them."* — Julian should read this as a rough proxy, not
a real funnel step.

**Data layer (`data/admin-stats.ts`) — one exported, directly-callable
function per query,** not inlined in the `createServerFn` handler like
`set-stats.ts`'s `fetchOverallStats`/`fetchSetStats` are. This is the one
deliberate deviation from mirroring that file exactly: neither of those two
functions has a test today (checked — no precedent existed in this
codebase for testing a D1-querying loader at all), so this splits the
shape specifically to make each query unit-testable against a fake
`D1Database`, rather than perpetuate the untestable-inline pattern. The
`createServerFn` wrapper (`fetchAdminDashboardStats`) still follows the
same cast-and-degrade-to-null convention as every other server function in
this codebase (`(context as unknown as Record<string, unknown>).cloudflare`
— the documented `any`-avoidance exception).

**Visual style — reused the existing terminal/gold design system**
(`PageTitle`, `Label`, `TerminalRow`, `asciiBar`), not a separate plain
admin style: `/sets`'s `OverallMetrics` already renders this exact
label/value metrics shape with `TerminalRow`, so this page is more of an
established pattern, not a new one; the monospace font aligns tabular
numbers for free; and a second visual language for one internal,
Cloudflare-Access-gated page would be inconsistency for no benefit.

**Tests** — 16 unit tests total in `tests/unit/data/admin-stats.test.ts` (11
from the first pass + 5 for the v2 additions) against the same small local
fake `D1Database` (`prepare(sql).bind().first()/.all()`, routed by matching
the SQL text since several functions fire more than one query via
`Promise.all`), including the original dedicated regression test asserting
every query against `push_subscriptions` excludes `endpoint`/`p256dh`/
`auth` by name — untouched by this pass, still passing. New coverage:
`fetchInstallFunnel`'s three trends bucket independently per event type
(one test, disambiguating the totals vs. trend query routes by their
distinct `COUNT(*) as n` / `GROUP BY day, event_type` text — a broad
`/FROM events/` match would have silently routed both queries through the
same fixture); `fetchClickStats`'s per-set grouping, catalogue mapping, and
unknown-`set_id` fallback (two tests); `computeInstallToPushConversion`'s
ratio math and null-when-zero-installs edge case (two tests, no fake D1
needed — pure function). **Per-set play trend (v2 addition #1) has no new
data-layer test** — it reuses `fetchSetStats` unchanged, and that function
still has zero test coverage of its own (a pre-existing gap in
`set-stats.ts`, out of scope for this dashboard work — flagging rather than
silently leaving it unmentioned). One e2e smoke test
(`tests/e2e/admin-dashboard.spec.ts`) confirms the route mounts and renders
its documented no-data fallback (the dev server has no D1 binding, so
that's the only state reachable locally) — deliberately not a full flow
test, matching this page's internal/low-traffic priority; left unchanged
this pass since the same dev-environment limitation means none of the new
sections render locally either (the whole `stats &&` branch is
unreachable without a live D1 binding, same as the original five sections).

**Needs on-device / production confirmation:** (1) the Cloudflare Access
policy itself — not yet configured; (2) real D1 data actually renders
correctly once deployed (unit tests only exercise the fake D1 mock, never
a live query) — now also covering the four v2 views (set picker, per-set
click ranking, funnel trends, install→push ratio) end to end against real
rows.

**v3 — honesty pass (2026-07-28).** A dedicated investigation session
(2026-07-27, read-only — no code changes) audited the dashboard against
real production row counts (pulled via `wrangler d1 execute --remote`:
292 plays, 110 events, 4 push subscriptions at the time) and found four
places where the page implied more than the data actually supports. This
pass closes all four, each confirmed against the same real numbers:

1. **Offline/online ratio now discloses its excluded rows.** `is_offline`
   is `NULL` for 256 of 292 real plays (87.7%) — everything that predates
   the column's 2026-07-08 addition. `PlayStats` gains `excludedCount`
   (`total − offlineCount − onlineCount`, pure arithmetic on values already
   fetched, zero new query) and the `plays` section now captions the ratio
   with the excluded count whenever it's nonzero — the investigation found
   this ratio was being shown with no indication it covers barely 12% of
   real play volume.
2. **Avg engaged listening time, per set.** `SetStats.avgSeconds` already
   existed and was already being fetched by the v2 per-set picker
   (`fetchSetStats`) but was never rendered anywhere in the app — a fully
   dead computed field until now. Surfaced as a new `TerminalRow` in the
   `per_set_plays` section using `utils/fmt.ts`'s existing `fmtDuration()`.
   Labeled `avg_engaged_listening`, deliberately not "% completed" or
   anything implying track position: the investigation found
   `listened_seconds` is cumulative playback time, not furthest position
   reached, and real data proves it — t.i.l.'s average is 292% of the
   track's own stated length (a listener who scrubs back and replays
   sections keeps adding to the total). A one-line caption under the row
   spells this out so it can't be misread as completion percentage later.
3. **60-day trend sparklines caption their real tracking start when the
   window is only partially real.** `install_funnel`, `app_launches`, and
   `push_subscribers`' growth trend all render a fixed 60-day window
   regardless of how much real history exists — real `events` history only
   goes back to 2026-07-15 (13 days at investigation time), real
   `push_subscriptions` history to 2026-07-19 (9 days) — so most of each
   sparkline was structural zero-padding, not "nothing happened". Two new
   pure/fetch function pairs close this: `fetchEventsTrackingStart`/
   `fetchPushSubscriptionsTrackingStart` (`admin-stats.ts`) each run one
   trivial `SELECT MIN(created_at)` — a genuine extra query, not derived
   from the already-window-limited trend rows, and deliberately so: a
   window-truncated guess can't tell "tracking started exactly at the
   window boundary" from "tracking started earlier but got cut off by the
   60-day filter", and an indexed `MIN` on a 110-row (`events`) or 4-row
   (`push_subscriptions`) table costs nothing worth trading that ambiguity
   away for. `computeTrackingStartDay()` (pure, unit-tested with a fixed
   `now`) turns that raw timestamp into either an ISO day to caption or
   `null` — `null` both when there's no data at all AND, cleanly, once real
   history reaches the full 60 days, at which point the caption disappears
   on its own with no separate "is this still needed" check required later.
   **Deliberately NOT applied to the per-set play trend** — `plays` genuinely
   spans ~84 days (since 2026-05-05), so that sparkline needed no caveat and
   still doesn't.
4. **Tab push-subscribers captioned as policy, not a data gap.** The
   investigation traced `PushOptInModal.tsx`'s browser-tab variant and
   confirmed it never calls `useSubscribeToPush()`/`postSubscription()` at
   all — "push subscriptions are app-only product policy" is the existing
   design comment there. So `pushSubscribers.tabCount` reading 0 (all 4 real
   subscribers are standalone) isn't "not enough data yet", it's guaranteed
   to always read 0 unless that product policy itself changes. The
   `push_subscribers` section now says so directly rather than leaving it
   looking like an evolving ratio.

Same visual treatment throughout: small `text-xs text-grey/70` captions
directly under the row they qualify, matching the `install_to_push`
caveat's existing style (the investigation flagged that caveat as the
correct precedent every other overconfident stat should be held to).
9 new unit tests (`admin-stats.test.ts`) — `excludedCount` arithmetic,
`computeTrackingStartDay`'s three boundary cases (no data / partial window
/ full window), and both new `fetchXTrackingStart` functions against the
fake `D1Database`. All pre-existing tests (23 before this pass) pass
unchanged.

### Migrated 2026-07-31 — dashboard moved to its own app, `apps/admin`

**Superseded the section above** — `/admin/dashboard` no longer exists in
`apps/web`. The whole feature moved to a standalone TanStack Start app,
`apps/admin`, deployed as its own Cloudflare Pages project at
`admin.formatglasgow.com`. Branch: `feat/admin-app`.

**Why a separate app, not just a separate route.** The path-level
Cloudflare Access policy this dashboard was always meant to sit behind
(see the "No in-app authentication" note above) was never actually
configured — the route was reachable by anyone who found the URL. A
subdomain-level Access application is a stronger, simpler boundary to
reason about (and to configure) than a path-level one on a domain that's
otherwise fully public. Julian configures the Access application and the
Cloudflare Pages project himself, outside this repo's scope — see the new
`apps/admin` section this session added to `CLAUDE.md` for the exact
manual dashboard steps.

**Data layer — one new shared package, not duplication.** `fetchSetStats`
(the per-set trend the dashboard's picker calls) already had a second real
consumer: the public `/sets/$setId` page. Duplicating that query (and the
static sets catalogue `fetchClickStats` joins against) across two apps
would have been the exact kind of drift risk this repo's design-system
work was extracted to avoid. Both moved to a new package, `packages/data`
(`@form-at/data`) — `apps/web`'s own copies became thin re-export shims
rather than a 33-file mechanical import sweep bundled into this migration
(see `TECH_DEBT.md` item 21 for the deferred follow-up). `admin-stats.ts`
itself has only ever had one consumer (this dashboard), so it moved
wholesale into `apps/admin` rather than into the shared package.

**ASCII sparklines dropped, not the trend data.** All 6 `asciiBar(...)`
render call sites (install funnel's three trends, app launches, per-set
plays, push subscriber growth) became a `chart pending` placeholder with a
`TODO(charting-phase)` comment. `admin-stats.ts` still computes and
returns every trend array exactly as before — only the rendering call was
dropped, so swapping in a real chart later is a pure presentation change,
no data-layer work. Every honesty caption from the v3 pass above carries
over verbatim; the per-set picker keeps its identical client-invoked
`fetchSetStats` pattern (see `dashboard.tsx`'s comments for how it now
resolves through `@form-at/data` instead of a relative import — the
mechanism was verified empirically, not just typechecked, since a
`createServerFn` defined in a shared package and built into two
independent apps was new territory for this repo).

**Access is a page-load gate, not a request-level one — record this for
later.** Cloudflare Access protects `admin.formatglasgow.com`'s page
loads. It does **not** automatically authenticate individual server-
function calls the way an application-level auth middleware would. This
dashboard is read-only today, so it's a non-issue — but **any future
admin endpoint that writes must verify the Access identity server-side
(the `Cf-Access-Jwt-Assertion` header, or Access's own token-validation
flow) rather than assuming the page being gated is enough.** A future
session adding, say, a "resend push notification" button should read this
note before wiring it up.

Migrated tests: all 23 `admin-stats.test.ts` unit tests move with the data
file, plus the one e2e smoke test (route path updated to `/dashboard`).
Both pass unchanged in their new home. apps/web's copies of the route,
data file, and both test files are removed in the same PR's final commit.

### Fixed 2026-08-01 — `pages.dev` exposure: Access can't cover it, added an app-level host guard

**Field verification found a gap the migration above didn't close.**
Cloudflare Access gates `admin.formatglasgow.com` at the subdomain
level — but Access self-hosted applications can only cover hostnames in
zones we own. Cloudflare's own `*.pages.dev` domain isn't ours to gate, so
the same deployment was also reachable, unauthenticated, at
`form-at-admin.pages.dev` and every per-deployment preview URL (e.g.
`cd9a05fe.form-at-admin.pages.dev`). Access being configured correctly on
the custom domain gave zero protection on those hosts — the dashboard was
fully public there.

**Fix: an app-level Host-header guard in `apps/admin/app/server.ts`.** The
first thing `fetch()` does now is check the request's hostname against an
allowlist (`apps/admin/app/utils/hostGuard.ts` —
`ALLOWED_HOST = "admin.formatglasgow.com"`, plus `localhost`/`127.0.0.1`
for local dev/preview/e2e/manual `wrangler pages dev` testing); anything
else gets a plain `404` (not a redirect, so the real hostname isn't
advertised to whoever hit the wrong one) before the request ever reaches
D1 access or the SSR handler. **This guard is now the only thing standing
between the dashboard and the public internet on `pages.dev` hosts —
Access alone does not cover them.** `hostGuard.ts` carries a comment to
this effect specifically so a future session doesn't remove it as
redundant with Access.

**Testing.** `isAllowedHost` is a pure function, fully unit tested
(`tests/unit/utils/hostGuard.test.ts`). The guard's rejection path is also
tested against the real `server.ts` export (`tests/unit/server.test.ts`)
— it 404s before `createStartHandler` ever runs. The allowed-host
pass-through (the actual SSR render) can't be exercised under vitest —
same harness gap as `sw.ts`: `createStartHandler` resolves a virtual
module (`#tanstack-router-entry`) that only exists under the
`tanstackStart` Vite plugin (confirmed by direct probe: it throws
`ERR_PACKAGE_IMPORT_NOT_DEFINED` outside that plugin). **Manual
verification step** (build + `wrangler pages dev`, then confirm a real
host renders and a spoofed one 404s):
```bash
pnpm build:admin
npx wrangler pages dev apps/admin/dist/client --config apps/admin/wrangler.toml
# note the local URL wrangler prints, then:
curl -sI http://<local-url>/dashboard -H "Host: form-at-admin.pages.dev"   # expect 404
curl -sI http://<local-url>/dashboard -H "Host: admin.formatglasgow.com"   # expect 200
```

### Added 2026-08-01 — Phase C: tabbed layout, centred grid, real charts

The dashboard was a single long vertical scroll of 6 sections with 6
`chart pending` placeholders. This phase restructured it into 3 tabs on a
centred, responsive grid, and replaced all 6 placeholders with real charts.
Branch: `feat/admin-charts`, two commits (layout, then charts).

**Layout conventions — researched, not invented.** Looked at Plausible,
PostHog, and Vercel's dashboard docs/templates (public docs only — no
authenticated access to compare against their live internals). The
consistent pattern across all three: tabs/sections switched from a menu at
the top (not one continuous scroll), card-grids that collapse to a single
column on narrow viewports, and summary numbers living inside the same card
as their chart. Adopted: a local tab strip (`DashboardTabs.tsx`) built from
the existing `BracketLabel`, matching `AdminNav`'s own active-state
convention rather than a new visual language — not folded into `AdminNav`
itself, since that component is documented as growing *horizontally*
(future top-level sections like notifications/sessions), a different
navigational scope than a tab strip nested inside one page.

**Section grouping — 3 tabs, not 6-tabs-for-6-headings.** `install_funnel` +
`push_subscribers` → **Growth** (both are "is the app spreading," and the
`install_to_push` approximation caption explains the relationship between
the two — grouped, it finally sits next to both numbers it's about, instead
of living only inside `install_funnel`). `app_launches` + `plays` →
**Usage** (aggregate volume, no per-set dimension). `per_set_plays` +
`clicks` → **Sets** (both already per-set-scoped).

**Charting library — visx, not Recharts/Chart.js/uPlot.** Evaluated against
real measured numbers (bundlephobia + npm registry, not blog estimates):

| Library | Real gzip | Type | Notable |
|---|---|---|---|
| **visx** (chosen) | ~25-30KB combined (axis 15.2KB incl. shape+scale, tooltip 3.1KB, responsive 1.8KB) | SVG | No default animation; trivially testable under jsdom (plain SVG DOM) |
| uPlot | 21.9KB | Canvas | Zero deps, but canvas testing would be a first-of-its-kind gap in this repo — `Waveform.tsx`, the only prior canvas component, has never had a test file |
| Chart.js + react-chartjs-2 | 69.4KB | Canvas | Animates by default (needs explicit disabling); same canvas-testing gap |
| Recharts v3.10.1 | 147.5KB whole-package | SVG | v3 rewrote its internals on Redux (`@reduxjs/toolkit`, `immer`, `react-redux`) — a lot of machinery for 9-point arrays |
| Recharts v2.15.4 | 120.4KB whole-package | SVG | Still heavy for this data shape |

Rejected uPlot specifically because canvas rendering can't be exercised
under this repo's jsdom test harness without inventing new mocking
infrastructure (`HTMLCanvasElement.prototype.getContext` returns `null` in
jsdom without the native `canvas` package, which this repo has never
installed) — visx's SVG output renders natively in jsdom, so "renders
without throwing" tests needed zero canvas-specific setup (just a
`ResizeObserver` stub for `@visx/responsive`'s `ParentSize`, which jsdom
also doesn't implement — a much smaller, standard gap to fill). Ended up
using only `@visx/axis` + `@visx/scale` + `@visx/group` + `@visx/responsive`
+ `@visx/tooltip` — plain `<rect>` elements for the bars themselves, so
`@visx/shape` was added then removed once it turned out unused.

**One `<rect>` per weekly bucket, not a line/area.** The 6 trends are all
`number[]`, 9 weekly buckets (60-day window ÷ 7-day buckets, confirmed
against `TREND_WINDOW_DAYS`/`TREND_BUCKET_DAYS` in
`packages/data/src/set-stats.ts`) — 9 discrete points don't genuinely
interpolate between each other, so bars are the honest shape, and discrete
bars make hover trivial (one `onPointerEnter`/`onPointerLeave` pair per bar,
no nearest-point math). This mirrors the ASCII-bar convention
`apps/web/app/utils/fmt.ts`'s `asciiBar` already uses on the public
set-detail page for the same shape of data — same idea, real rendering, no
shared code between the two apps (confirmed: zero `apps/admin` references
in `apps/web`, `asciiBar` untouched).

**SSR isolation — a real dynamic `import()`, not just `ClientOnly`.**
`ClientOnly` (from `@tanstack/react-router`) is a *render guard*, not a
code-splitting mechanism — a static top-level import of visx would still
land in the SSR bundle even inside it. `TrendChart.tsx` wraps a genuine
`lazy(() => import("./TrendChartInner"))` in `ClientOnly` + `Suspense`, so
the chart module is a separate chunk the SSR build never executes.
Verified, not just asserted — measured `apps/admin/dist/client/_worker.js`'s
gzip size before and after:

- Before: 217,937 bytes
- After: 218,448 bytes (+511 bytes — noise from the `ClientOnly`/`Suspense`
  wiring itself, not visx)
- The real cost lands entirely in a separate, lazy-loaded client chunk:
  `TrendChartInner-*.js`, 62.6KB raw / 23.0KB gzip, downloaded only when a
  user actually visits `/dashboard` and the chart mounts — never touching
  `_worker.js` or the initial `index-*.js` bundle.

**Colours from `@form-at/ui/tokens`, not hardcoded hex** — same JS
colour-mirror pattern `Waveform.tsx` already established for canvas use;
here it feeds `fill`/`stroke` props on SVG elements instead.

**Accessibility:** SVG bars carry nothing for screen readers (`aria-hidden`
on the `<svg>`), so each `TrendChart` renders a visually-hidden (`sr-only`)
text summary of the same data alongside it.

**Reduced motion:** no new handling needed — visx's static primitives don't
animate, and the one CSS `transition-colors` hover class added is already
covered by the existing global rule at `packages/ui/src/tokens.css:157-166`.

**State-lifting (Julian's review correction):** the per-set-picker's
selected-set state must stay owned by `dashboard.tsx`, not `SetsTab.tsx` —
otherwise switching tabs away and back would unmount it, losing the
selection and re-firing `fetchSetStats`. Verified with a real test
(`SetsTab.state-lifting.test.tsx`) that renders the actual `SetsTab`/
`DashboardTabs` components, clicks between tabs via `userEvent`, and asserts
the mocked fetch fires exactly once across the round trip — not just
reasoned about.

**e2e spec left deliberately unchanged.** Read `dashboard.spec.ts`'s
assertions first: both only exercise the `!stats` fallback branch, since
the dev server has no D1 binding and can never reach the `stats`-truthy
branch where tabs/charts live. The restructure never touches that branch,
so nothing needed updating — a comment records this reasoning so a future
session doesn't wonder why tabs aren't e2e-covered.

Tests: `DashboardTabs.test.tsx` (tab switching), `SetsTab.state-lifting.test.tsx`
(the regression above), `TrendChart.test.tsx` (renders without throwing —
9-point, empty, single-point, all-zero data), `trendDates.test.ts` (the pure
axis-label helper). `admin-stats.test.ts`'s 23 tests untouched — this was
presentation-only work.

### Added 2026-08-01 — sample-data fallback so the dashboard actually renders locally

Phase C's tabs/grid/charts were real, but invisible without D1 — `pnpm
dev:admin` and Playwright both hit the `!stats` fallback (no Cloudflare env
at all under plain `vite dev`), so nobody could actually see the layout
without deploying. Added a hand-written fixture (`app/data/sample-stats.ts`)
that `fetchAdminDashboardStats` falls back to instead of `null`.

**Gating signal — `hasCloudflareEnv`, not `env.DB` or `NODE_ENV`.**
`server.ts` now forwards `env !== undefined` through context alongside the
existing `env`/`safeEnv` coalescing. This is true under ANY real Cloudflare
runtime (production, or local `wrangler pages dev`, D1 bound or not) and
false only when `fetch()` runs entirely outside Cloudflare (`vite dev`/`vite
preview`, Playwright's e2e server). `admin-stats.ts`'s new
`pickStatsForMissingDb(hasCloudflareEnv)` returns the fixture only when this
is false — so a real deployment whose D1 binding is broken or not yet wired
up (a real scenario: CLAUDE.md's own "must also be added in the CF Pages
dashboard" manual step) still shows the honest "no data available" state,
never fake numbers. Gating on bare `env.DB` presence would have gotten this
wrong; `NODE_ENV` was rejected outright (baked into `_worker.js` at build
time via esbuild's `--define`, so it reads `"production"` for every built
worker regardless of where it actually runs).

**Fixture contents — invented, not a D1 dump**, at this project's real
scale (tens, not thousands), deliberately including shapes real data
doesn't currently have, to stress rendering the happy path wouldn't:
`installFunnel.dismissedTrend` is an empty array, `appLaunches.weeklyTrend`
is all zero, `pushSubscribers.weeklyGrowth` has a spike (15) next to
single-digit values, and `set-002-brandon-lee-vear`'s `weeklyPlays` is also
empty (a second, independent empty-array case in the per-set chart).
`installToPushConversion.ratio` intentionally exceeds 100% — a real
consequence of the two aggregates sharing no key (see that type's own doc
comment), demonstrated rather than hidden behind a tidier number. The
per-set fixture (`SAMPLE_SET_STATS`) is kept out of the shared
`@form-at/data/set-stats` package deliberately — `fetchSetStats` there is
also `apps/web`'s public set-detail page's data source, so gating it on
`hasCloudflareEnv` would require threading that context into `apps/web` too.
`dashboard.tsx`'s per-set effect instead checks `stats.isSampleData` (set
once, at the top-level loader) and substitutes the fixture locally when true
— the shared package is untouched.

**Marker:** a small `[bordered] sample data` tag next to the page title,
visible only when `isSampleData` is true, so nobody screenshots the fixture
thinking it's real.

**e2e finally exercises tabs/grid/charts** — with the fallback active, the
dev server Playwright boots against now returns real (fixture) stats
instead of `null`, so `dashboard.spec.ts`'s comment explaining "tabs are
unreachable from e2e" no longer held and was rewritten. New coverage: tab
switching, the per-set picker's state surviving a tab round trip (the same
regression `SetsTab.state-lifting.test.tsx` locks, now also observed
end-to-end), chart `<svg>`s actually rendering, and the card grid collapsing
to one column at 375px vs. two at desktop width.

**Hydration race found and fixed along the way:** the first e2e run of the
new click-driven tests failed — clicks were firing before React attached
event handlers to the tab buttons (a real, known class of flake, not a
fixture bug). Fixed with the exact pattern `apps/web` already established
for this (`HydrateStore.tsx`'s `data-hydrated` marker + `gotoAndHydrate`
helper) — `HydrateMarker.tsx` (new, no store to rehydrate here) stamps
`body[data-hydrated="true"]` on mount, and `tests/e2e/_helpers.ts` waits for
it before every `goto`.

### Added 2026-08-01 — Phase D1: send push notifications from the admin dashboard

**The first mutating admin feature.** Every admin endpoint before this was
read-only. `routes/dashboard.tsx`'s top-of-file comment and this file's own
"Migrated 2026-07-31" section both carried a note written for exactly this
moment: Cloudflare Access gates page loads, not individual server-function
calls, so a writing endpoint must verify the Access identity server-side
rather than assuming the page being gated is enough. That note's own
example — "a future session adding, say, a 'resend push notification'
button" — is this feature, named in advance.

**Access JWT verification — `apps/admin/app/utils/verifyAccessJwt.ts`.** No
first-party Cloudflare helper exists for this (checked Cloudflare's current
docs directly, not memory: the `cloudflare-one/.../validating-json/` and
`access/setting-up-access/validate-jwt-tokens/` pages). Both recommend the
same thing this uses: the `jose` package (v6, zero dependencies, lists
Cloudflare Workers as a supported runtime in its own description) with
`createRemoteJWKSet` + `jwtVerify` against
`https://<team-domain>/cdn-cgi/access/certs`, checking `iss` (team domain),
`aud` (the Access Application's AUD tag), and `exp` (implicit). The token is
read from the `Cf-Access-Jwt-Assertion` header first, falling back to the
`CF_Authorization` cookie — Cloudflare's own docs prefer the header since
the cookie "is not guaranteed to be passed." `payload.email` (confirmed via
Cloudflare's own Workers example code on that docs page) is logged as who
sent it. Everything collapses to `null` — missing config, missing token,
bad signature, wrong issuer/audience, expired — no distinction surfaced
beyond "not authorized."

**Deliberately no dev-mode bypass — different from the sample-data
gating, and that's the right call, not an oversight.** The sample-data
dashboard fallback (above) exists because showing placeholder numbers
locally is harmless. This endpoint, if it ran, sends real notifications to
real subscribers' devices — irreversible, real-world blast radius. Local
dev has no D1 binding at all (same fact the sample-data fallback is built
on), so there's nothing genuine to unlock with a bypass — no subscribers
are reachable locally either way. The workable local path instead: the JWT
verification logic is unit-tested against a locally-generated keypair and a
mocked `fetch` for the JWKS endpoint (the real `jose` code path, zero
network dependency — valid/expired/wrong-audience/wrong-issuer/missing-email
cases all covered), the confirm-before-send UI flow is tested with a mocked
`fetch("/api/send-push")` response, and **`apps/web/scripts/send-push.ts`,
the original CLI script, stays exactly as it was** — the fallback for
anyone who needs to actually send locally against real D1.

One real bug surfaced while writing the JWT tests: signing a second test
JWT after a `vi.stubGlobal`/`unstubAllGlobals` cycle threw `payload must be
an instance of Uint8Array` from inside jose's own sign path — a jsdom/Node
cross-realm mismatch (jsdom's global `Uint8Array` is a distinct constructor
from Node's). Fixed by forcing `// @vitest-environment node` on that one
test file (it has zero DOM surface anyway) rather than presigning around
the interaction — Node is also the more honest environment for a module
that never touches a browser API.

**`webPush.ts` moved to `packages/data`.** It was always written to be
reusable (its own header comment already said "intended for the future
admin panel to import directly"), but it lived in `apps/web`, and apps
never import each other's code directly in this monorepo — only
`packages/*` are shared. Moved verbatim to `packages/data/src/webPush.ts`,
`apps/web/app/utils/webPush.ts` becomes a re-export shim (added to
`TECH_DEBT.md` item 21's existing sweep list, not a new item). Its test
suite moved with it unchanged — `packages/data` had no test setup at all
before this (only `lint`/`tsc`), so a minimal `vitest` config (`node`
environment — nothing in this package touches the DOM) was added alongside
it, now wired into both CI workflows' `unit` jobs.

**`admin_push_sends` — a new table, proposed not applied.** One row per
send: `sent_at`, `sent_by_email` (the verified Access identity, never a
client-supplied value), `title`, `body`, `url`, `image`,
`recipient_count`/`sent_count`/`failed_count`/`dead_removed_count`. Added to
`apps/web/schema.sql` — the canonical schema file for the one shared
`form-at-analytics` database (`push_subscriptions` already set this
precedent: a table only `apps/admin` writes to, defined in a file that
lives under `apps/web`). **Not yet applied to the remote database** — same
"Julian runs it" pattern as every other migration in this file. The
whole-file command does NOT work here either, same reason as
`push_subscriptions`'s own note (the one-time, non-idempotent
`ALTER TABLE plays ADD COLUMN is_offline` duplicate-column-errors on
re-run):
```bash
npx wrangler d1 execute form-at-analytics --remote --command "CREATE TABLE IF NOT EXISTS admin_push_sends (id INTEGER PRIMARY KEY AUTOINCREMENT, sent_at INTEGER NOT NULL, sent_by_email TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, image TEXT, recipient_count INTEGER NOT NULL, sent_count INTEGER NOT NULL, failed_count INTEGER NOT NULL, dead_removed_count INTEGER NOT NULL)"
# verify it landed:
npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(admin_push_sends)"
```

**Recent-sends list, added on review — surfaces a duplicate before it
happens, not after.** Three people have Cloudflare Access; nothing stops
two of them sending the same announcement minutes apart, or a page refresh
resubmitting. The notifications page shows the last 10 sends (timestamp,
sender email, title, sent/failed/dead-removed counts) directly above the
form — one extra query (`fetchRecentPushSends`) against a table already
being built for the send record itself.

**The endpoint** (`routes/api/send-push.ts`, `server.handlers` POST — the
established mutating-route pattern, `CLAUDE.md`'s documented replacement
for `createAPIFileRoute`, modeled on `api/push-subscribe.ts`'s
exported-`validate()` convention): verifies the Access JWT, validates the
payload, `SELECT`s subscriptions, loops `sendWebPush` sequentially
(matching the CLI script's own sequencing), deletes dead subscriptions via
the real D1 binding (`.bind()`, not the script's manual SQL-string escaping
— that only existed because the script talks to D1 through the `wrangler`
CLI, not a binding), records the send, returns
`{ total, sent, failed, deadRemoved }`.

**Scale limit — documented, not solved.** This loop runs inside one
Worker/Pages Function request. Cloudflare's current docs: the free plan
caps CPU time at **10ms per request** (paid: 30s default, up to 5 min), and
CPU time explicitly **excludes** time spent waiting on `fetch()` — so the
wall-clock POST to each push service isn't the constraint. The constraint
is the VAPID JWT **signing** `@pushforge/builder` does per subscriber (real
Web Crypto ECDH/ECDSA work), which *is* CPU time and scales with subscriber
count. No precise per-signing-operation benchmark could be produced without
an actual Workers deploy to measure — so treat "breaks at N subscribers" as
an estimate, not a verified fact: typical ECDSA P-256 Web Crypto signing is
commonly low single-digit milliseconds, which would put the free plan's
10ms budget under real pressure somewhere in the tens of subscribers, well
before "thousands." Fine at today's 5. **Revisit trigger:** if subscriber
count climbs into the tens, check the actual Cloudflare dashboard CPU-time
metric on a real send (or add a temporary timing log) before assuming it
still works — the likely fix at that point is chunking the loop across
multiple invocations (a Cloudflare Queue consumer, or batching the
subscriber list across separately-triggered runs), not something built now.

**The UI** (`routes/notifications.tsx` + `components/SendPushForm.tsx` +
`PushPreview.tsx` + `RecentPushSends.tsx`): `AdminNav.tsx`'s `links` array
gained `{ to: "/notifications", label: "notifications" }` — exactly what
its own comment said adding a new section would be. Subscriber count and
recent-sends list load before the form. The preview is a plain,
clearly-labeled text block (title/body/deep-link), deliberately **not** a
skeuomorphic OS-notification mockup — real notification rendering varies by
OS/browser (Android/iOS/desktop Chrome all differ), so faking pixel
fidelity would be dishonest; the same block is reused, frozen, inside the
confirm modal. No single-click send: clicking "send" opens
`@form-at/ui`'s `Modal` echoing the exact payload and subscriber count,
requiring an explicit "confirm send" click. The confirm button disables
and reads "sending…" for the duration of the request — a second click
during that window fires zero additional requests (locked by
`SendPushForm.test.tsx`). A real bug surfaced writing that test: the
preview's title/body fallback text was `<Muted>` (renders a `<p>`) nested
inside another `<p>` — invalid HTML, caught by a React console warning
during the test run, fixed by switching the wrapping elements to `<div>`
and passing `as="span"` to the nested `Muted`.

### Fixed 2026-07-05 — M3: `_headers` caching + CSP (TECH_DEBT 19 itself still blocked)

The launch-blocker session ran into hard preconditions: the custom domain
is not connected to the bucket (neither candidate host resolves) and the
local wrangler token has no R2 scopes — so the host sweep (TECH_DEBT 19),
the IDB migration decision, and the `.mp3.mp3` rename (TECH_DEBT 14) are
all blocked on Julian's dashboard access (exact steps in both TECH_DEBT
items). M3 was host-independent and shipped:

- **`public/_headers`:** `/assets/*` → `public, max-age=31536000,
  immutable` (content-hashed, safe forever); `/sw.js` → `no-cache`
  (browsers cap SW freshness at 24h regardless — this is belt-and-braces so
  an update never waits on HTTP caching).
- **CSP, split by where documents come from:** Cloudflare Pages `_headers`
  applies to STATIC ASSETS ONLY — SSR documents from `_worker.js` never see
  it. So the document policy is set in `app/server.ts` (attached to
  `text/html` responses only), and `_headers`' `/*` rule covers
  `offline.html`, the one static document. The two strings carry
  keep-in-sync comments; server.ts is the source of truth.
- **Policy shape** (restrictive-first, audited against real usage):
  `default-src 'self'` + `'unsafe-inline'` for script/style (inline SW
  registration + beforeinstallprompt stash + TanStack's per-request SSR
  hydration scripts — unhashable; inline font CSS + style attributes),
  `img-src 'self' data:`, R2 host in `media-src`/`connect-src` (the ONLY
  external fetch origin — all social/calendar URLs are link navigations),
  `worker-src/manifest-src/base-uri/frame-ancestors 'self'`. Nothing had
  to be loosened beyond the audited list.
- **Verified against the production preview** (SW active, Playwright +
  violation listeners): all four pages + detail load, SW registers, audio
  streams from R2, peaks fetch → waveform renders, artwork loads — ZERO
  CSP violations.
- **Needs live-deploy confirmation:** (1) whether `_headers` applies to
  assets served via `env.ASSETS.fetch` from the advanced-mode `_worker.js`
  (docs say the asset layer honours `_headers`; confirm `cache-control` on
  a deployed `/assets/*.js` and `/sw.js`); (2) the `.ics` calendar download
  under CSP (blob: anchor — no directive we set governs it, but the sweep
  couldn't reach the button; one manual download click suffices).

### Fixed 2026-07-03 (evening) — field bugs from on-device testing

All three diagnosed with CDP touch-event reproductions against the
production preview (mobile viewport), fixed, and re-verified the same way.
Branch: `fix/playback-gate-m1`.

- **[FIXED] FullPlayer opens/peeks during upward scrolls near the bottom.**
  RCA: the mini-player strip's follow-finger drag is the ONLY writer of
  partial FullPlayer transforms (proven: list-originated scrolls never move
  it). The accident was `shouldSnapOpen`'s velocity commit — a normal
  scroll flick starting on the strip is a high-velocity ~100–200px gesture,
  indistinguishable from a "flick open"; CDP-reproduced: a 210px fling (25%
  of viewport) committed fully open. Fix: `shouldSnapOpen` is distance-only
  (>30% pull opens), plus a `canceled`-gesture guard on both drag handlers
  (never commit a browser-canceled gesture — belt-and-braces, not
  CDP-exercisable). Preserved interactions, all re-verified: tap opens,
  deliberate >30% pull opens, sub-threshold drags snap back (ended OR
  canceled), header/artwork drag-down + downward flick still close.
  Transient follow-finger peek DURING a strip-origin flick remains — that's
  the follow-finger design; it now always snaps back.
- **[FIXED] open_set_details → black screen at /sets.** Two stacked causes,
  both CDP-confirmed pre-fix (URL bounced to `/sets`, `main` opacity stuck
  at 0): (1) the overlay's history-marker cleanup raced TanStack's
  MICROTASK-DEFERRED `window.history.pushState` (@tanstack/history
  `queueHistoryAction`) — `history.state` still read as the marker after a
  route change, so cleanup fired `history.back()` and undid the navigation;
  fixed with an explicit closed-by-route-change ref in
  `useFullPlayerLifecycle` instead of racing history state. (2) Any second
  navigation inside `useRouteTransition`'s 500ms fade window stranded
  `isVisible=false` forever (`previousPathRef` only updated inside the
  cleared timer) — content at opacity-0 under visible chrome; fixed by
  updating the ref when the fade is scheduled. Regression-locked at both
  levels: `useRouteTransition.test.tsx` (double-nav recovery) and a mobile
  e2e (`player.spec.ts`: open_set_details → detail URL + content reaches
  opacity 1). Post-fix CDP run: lands on `/sets/set-002-til`, opacity 1.
- **[FIXED] Install CTA entrance animation.** Replaced the generic 0.6s
  `animate-fade-in` with the home page's staged opacity-transition entrance
  (5s on the session's true first paint via `useFirstLoad`, 0.6s
  otherwise), running from the CTA's ACTUAL mount. With the pre-hydration
  prompt stash the CTA normally mounts with the first render and joins the
  page's slow entrance; a genuinely late-arriving prompt gets the 0.6s
  fade — a lone button crawling in over 5s long after the page settled
  would read as broken.

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

Remaining from the review's next-PR plan: ~~M1~~ (playback-gate
centralization — done 2026-07-03, `fix/playback-gate-m1`, see the
retry-storm-gate Reference section), M3 (`_headers` + CSP, bundled with
TECH_DEBT 19's custom domain), N3 (maskable icon check), N4 (set-card
extraction, backlog).

On-device addition for the pending pass (M1): install the PWA, play any
NON-saved set, lock the phone, enable airplane mode, tap play on the lock
screen. PASS: nothing plays, lock-screen UI stays paused, and unlocking
shows the "not saved for offline listening" toast. FAIL: audio stutters into
the retry storm or the lock screen shows "playing".

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
  gold "new version ready [ update ]" toast (`UpdateToast` → `useSwUpdate`),
  tap posts `SKIP_WAITING`, and only the consenting tab reloads on
  `controllerchange` (first-install claims don't reload — guarded).
  Decisions locked: toast is deferred while a set download is in flight
  (reload would abort it); other open tabs do NOT auto-reload (no consent —
  they accept the same stale-chunk risk as before, now bounded by an
  explicit user action). E2E is scoped out honestly: the dev server
  Playwright boots never serves the SW, so the flow is unit-tested against
  a mocked `navigator.serviceWorker` only.
  **Field bug + fix (2026-07-04):** the 2026-07-03 Android report ("tap does
  nothing; works on desktop") was CDP-reproduced and root-caused: a PLAYING
  track streams through the OLD service worker's fetch handler as a
  long-lived response, and the waiting worker's activation — even after
  `skipWaiting()` — is deferred until the active worker's functional events
  settle, i.e. until the track ends. Tap → SKIP_WAITING → nothing activates
  → no controllerchange → no reload. Desktop "worked" only because nothing
  was playing (hit-target / gesture / tap-vs-click hypotheses all killed by
  probes: the tap reached the button and fired click even in the failing
  case). Three-part fix in `useSwUpdate.applyUpdate`:
  1. `releaseAudioStream()` (playerSlice) tears down the audio connection at
     consent — we're reloading anyway — which unblocks activation
     immediately (verified: controllerchange + reload with a track playing).
  2. The SKIP_WAITING target is re-resolved from `reg.waiting` at tap time —
     the captured worker object can have gone redundant across multiple
     deploys, and postMessage to a redundant worker is silently dropped.
  3. A 2s fallback reload guarantees a consent tap always visibly converges
     even if activation wedges.
  Affordance also fixed at the time: the toast became "new build ready
  [ reload ]" — bracketed CTA per the design system, ~44px touch target,
  active-state feedback. (It was already a real `<button>`; it just read
  as a passive status pill.)
  **Superseded — the toast is gone (see "SW update flow" below).** The
  no-`skipWaiting` constraint this entry established still holds and is now
  structural rather than policy; only the consent UI was removed. Kept here
  because it records WHY a forced reload is not an acceptable alternative.
  **Polished 2026-07-18** (copy + style only — the tap-handler chain,
  deferral, and button/touch-target guarantees above are untouched):
  copy is now "new version ready [ update ]" — jargon-free message, the
  action verb is the user's goal (update) not the mechanism (reload).
  Visual hierarchy: grey message + gold bracketed action instead of an
  all-gold strip; press feedback lands on the action label. Comfortable
  padding (px-5 py-3.5 → exact 44px target), fadeInUp entrance shared
  with the toast family, reduced-motion collapsed globally.
  **On-device check (updated):** load the app (prod), START A SET PLAYING,
  deploy any change, let the update check run → gold "new version ready
  [ update ]" toast → tap WHILE audio plays → playback stops, single
  reload, new build live. Confirm NO toast and NO reload on a genuinely
  first visit.

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

### Cosmetic backlog

**All four original items here are now shipped** (verified against code +
git log while cleaning up this doc): toast redesign (`935ebb4`, `4c978b2` —
no brackets on message text, whole-surface click-to-dismiss, `[ x ]` kept
only where the toast persists, 2026-07-06); web-offline message unification
(`playerSlice.ts:73` — `tab-offline-needs-network` is already the single
reason for every tab offline-block, regardless of downloaded-or-not,
2026-07-06); SaveGateModal escape hatches (`SaveGateModal.tsx:64-75` —
`handleAlreadyInstalled` / `handleNotInstalledAfterAll` confirmed NOT
calling `onClose`, 2026-07-06); **Set card abstraction — resolved
2026-07-23.** Re-verified the file:line claims fresh before touching
anything (the entry had drifted slightly: `djs/$djId.tsx:129-130` was by
then `:127-138`, still the same underlying gap) — `/sets/index.tsx` and
`/djs/$djId.tsx`'s "played by this DJ" list rendered two different card
implementations; the DJ page had no `SaveForOfflineIconButton` at all.
Extracted `components/SetCard.tsx` — takes only `set` + `index`, owns
navigation/`playTrack`/`isThisPlaying` internally rather than accepting
them as props (both call sites did identical wiring before, so
internalizing it makes parity structural, not conventional); action slot
is unconditionally save-offline → share → play. One deliberate visual
change, not a silent one: standardized both surfaces on `/sets/index.tsx`'s
more truncation-resistant mobile body layout (3-line mobile / 2-line sm+)
rather than forking body markup per consumer, which would've reintroduced
the same drift this extraction exists to remove. Tests: `SetCard.test.tsx`
(new, action-slot parity + navigation + playback wiring) plus an e2e
regression lock in `djs.spec.ts` asserting the save-for-offline button role
now renders on a DJ page — the exact gap this item existed to close.

**Not the same as the DJ-image-loading bug** that used to be listed here
— that one is a different, already-fixed issue: `warmSetVisuals`
(`offlineSlice.ts:185-199`) resolves the DJ from the saved set and warms
the exact photo variants `/djs/$djId`'s `<Image>` requests, with the
coupling locked by `warmSetVisuals.test.ts`. Verified against current
code — no repro needed, this was already closed by the 2026-07-02
post-merge review's fix.

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
- **TECH_DEBT 14** — Brandon Lee Vear R2 object has `.mp3.mp3`. Deferred
  indefinitely (2026-07-06, Julian's call) — R2 has no rename op, cosmetic
  only, no re-visit condition.
- **TECH_DEBT 15** — browser-side HEAD against R2 fails mysteriously.
  Sidestepped by Option B; only chase if a future feature needs HEAD.
- **TECH_DEBT 16** — orphan artwork prune. Coupled with the deferred manage
  offline sets view above; not a standalone item.

---

### Added 2026-08-02 — calendar-add tracking + surfacing collected-but-unshown events

Two commits, `feat/calendar-tracking-and-dashboard`. Followed a no-code audit
this session that found: `AddToCalendarButton` fired zero tracking events,
and all four `notify_*` event types were collected in D1 but never read by
`apps/admin`.

**Commit 1 — `calendar_add_click`.** One new `event_type`, fired identically
for all three destinations (google/outlook/.ics) in `AddToCalendarButton.tsx`
— same minimal-cardinality precedent `save_click`/`share_click` already set
for not differentiating method, even though (unlike `share_click`, which
genuinely can't see past `navigator.share()`'s OS picker) this button *could*
know the destination. Deliberately carries **no** `set_id`/event-id: `events`
has no generic entity-id column — `set_id` is validated against `getSet()`
in `routes/api/event.ts` and is sets-only, so an event's id would never
resolve there. Carrying it would need a genuinely new column; flagged here
as a separate, not-yet-needed decision rather than forced in (the button
only ever appears in the context of one event per page load — no known
report needs a per-event breakdown today).

**Commit 2 — display.**
- **`notify_funnel`** — new 3rd card in `GrowthTab.tsx`, own card rather than
  merged into `install_funnel` or `push_subscribers` (it's the push
  *permission* funnel, a different feature from the PWA *install* funnel,
  despite the structural resemblance). Shows `prompt_shown` (standalone
  subscribe soft-prompt) and `install_nudge_shown` (browser-tab install
  nudge shown instead) as two separate rows, never summed — `declined` is
  fired by closing *either* variant with no distinguishing field, so it
  can't be attributed to one surface from the data alone; keeping the two
  "shown" counts visible is what lets a reader notice `install_nudge_shown`
  far exceeding `prompt_shown` and infer most declines are nudge-side.
- **Small-n honesty.** Added `MIN_SAMPLE_FOR_RATE = 10` (`admin-stats.ts`) —
  `notify_funnel.accepted_rate` renders `—` (not a computed percentage)
  below that many `prompt_shown` impressions. Motivating case: today's real
  remote counts have `notify_accepted ÷ notify_prompt_shown` = 2 ÷ 2, and a
  bare ratio would show "100%" — confident-looking off two people. The
  existing `null`-when-zero pattern (`InstallFunnel.conversionRate`) doesn't
  catch this, since 2/2 isn't zero. Suppressing (not just captioning next to
  the number) stops the misleading figure from rendering at all. This is
  additive, not a retrofit — every other `conversionRate`/`ratio` field in
  `admin-stats.ts` keeps its existing null-vs-zero-only behavior.
- **`calendar_adds`** — new 3rd card in `UsageTab.tsx` (fits its "aggregate
  volume, no per-set dimension" framing — `calendar_add_click` carries no
  set/event id, same shape as `app_launches`). No trend chart yet (nothing
  to bucket — collection had zero deploy history at merge time). Shows a
  `Muted` "nothing recorded yet" note when `total === 0`, so the honestly-
  empty state reads as "not yet tracked," not broken — this card will read
  zero for a while after deploy.
- **Grid layout.** Both tabs went from 2 to 3 cards; checked visually
  (screenshots at 1280px/1600px/375px, not just reasoned about) before
  picking a treatment — a bare 3rd item in `md:grid-cols-2` wrapped to its
  own row with a large empty gap beside it. Landed on `lg:grid-cols-3` (all
  three cards evenly sized at desktop width; still 1 column on mobile, 2 on
  `md`) — reads cleanly at both widths tested, no orphaned gap.
- **Sample fixture** (`sample-stats.ts`) uses `notifyFunnel` values *above*
  `MIN_SAMPLE_FOR_RATE` (30/45/12/18 → 40% accepted_rate) so the rendered-
  rate case is visible during a local dev pass; the suppressed (`null`)
  case is covered by `admin-stats.test.ts` instead, not the fixture.
  `calendarAdds.total: 0` demonstrates the empty state, matching reality at
  merge time.

### Added 2026-08-03 — admin set-upload feature, PR3: swapped remaining synchronous catalogue consumers onto the merged live+snapshot source

Context: the catalogue moved from a hardcoded compile-time array to a D1-backed
system (PR1: `sets` table + migration; PR2: build-time snapshot
`sets.generated.ts` + live-D1-overlay loaders for the `/sets` pages, with a
client-side offline-catch fix and a Turborepo strict-env-mode CI fix found
along the way). PR3 is the third phase: five remaining code paths still read
the old synchronous `sets` array/`getSet()` directly — `Player.tsx`,
`useAudioPlayer.ts`, `store/index.ts`'s persist `merge()`, `offlineSlice.ts`,
`SaveForOfflineButton.tsx` — plus two API routes (`routes/api/event.ts`,
`.../signal.ts`) whose anti-spam `validate()` called `getSet()` synchronously.

**New `apps/web/app/store/catalogueSlice.ts`** — a Zustand slice: `catalogueSets`
(starts as the bare build-time snapshot, replaced wholesale by the live-merged
result once the boot fetch in the new `CatalogueSync.tsx` component succeeds),
`catalogueReady`, and `catalogueConfirmed` (both **never** persisted, **never**
inferred from `catalogueSets` being non-empty — see item 1 for why there are
two flags, not one). `getCatalogueSet`/`getAdjacentSets` are the plain lookup
helpers all five consumers now call instead of touching `sets` directly.
`store/index.ts` composes the slice into `AppStore`, persists `catalogueSets`
(so a later fully-offline boot has more than the bare snapshot to work with)
but deliberately not either readiness flag, and its `merge()` forces both to
`false` on every rehydrate regardless of what's in the persisted blob.

**Item 1 — the reconciliation danger (highest risk item; closed with a
structural guard, then had a real hole found and fixed one review pass
later).** `offlineSlice.ts`'s `reconcileFromIdb` treats "id not found in the
catalogue" as "removed, safe to purge the user's saved offline bytes" (pass 2
of its two-pass IDB sync). Under the old compile-time array this was always
safe — the catalogue was always complete. Under the new merged async source,
`catalogueSets` can be non-empty (the bare snapshot default) while still not
having had a chance to load the live overlay.

First pass at the fix: `reconcileFromIdb` gated its whole body on
`get().catalogueReady !== true`. **This had a hole**, caught in review:
`catalogueReady` goes true once the boot fetch has *settled* — on success,
on failure, **or on an 8s timeout** — so it says nothing about whether
`catalogueSets` is actually complete. Booting offline (or with a flaky
connection) makes the fetch fail, `catalogueReady` flips true anyway, and
`catalogueSets` is left at whatever was already known (persisted, or the
bare snapshot) — not confirmed. A set uploaded since the last deploy,
genuinely saved by this user, on a device whose persisted `catalogueSets`
had been cleared, is missing from that catalogue for a reason that has
nothing to do with removal — and the original guard would have let pass 2
permanently delete its real IDB bytes. This is the same edge case PR2's own
docs already named ("uploaded and saved within the same deploy window, on a
device whose persisted cache was then cleared") — but escalated from a
*rendering* gap ("that set won't show up") to a *data-destruction* gap
("that set's saved bytes get deleted"), which was never the intent.

Fix: split the question in two. `catalogueReady` keeps its original meaning
("the boot fetch has stopped, for any reason") and still gates whether
`reconcileFromIdb` runs its non-destructive work at all (pass 1's
IDB-vs-persisted eviction check doesn't depend on catalogue completeness).
A new `catalogueConfirmed` flag — true **only** on a successful live fetch,
set inside `CatalogueSync.tsx`'s `.then()` and deliberately never in its
`.catch()`/`.finally()` — is the one pass 2's actual purge branch (`!catalogueSet`
→ queue for deletion) now checks. If the catalogue isn't confirmed, that
branch does nothing at all: no purge, no state change, the id is left
exactly as it was. Both flags live in `catalogueSlice.ts` as a guard *inside
the slice itself*, not just in the calling component (`OfflineReconciler.tsx`,
which still gates its effect on `catalogueReady` as a second, redundant
layer, since there's no point calling a function that will immediately
no-op) — so the safety property holds even if some future call site forgets
to check.

Tests, `tests/unit/store/reconcileUrlMigration.test.ts`: the original
"catalogueReady: false" case (no-ops entirely, nothing read from IDB) stayed
as one layer; two new cases lock the actual fix — `catalogueReady: true,
catalogueConfirmed: false` with an unrecognized id proves nothing is purged
and the persisted state is untouched, and a complementary `catalogueReady:
true, catalogueConfirmed: true` case proves the purge still correctly fires
once the catalogue really has been confirmed complete (so the fix narrows
the gate rather than disabling the purge outright).
`tests/unit/store/persistRehydrate.test.ts` gained the same "always false
even against a maliciously-seeded true" defensive test for `catalogueConfirmed`
that `catalogueReady` already had — arguably more important here, since this
is the one flag standing between an offline boot and permanent data loss.

**Item 1, round 2 — the split was right, but the WIRING that sets
`catalogueConfirmed` was still broken (caught one review pass later).** The
flag itself is correct; the bug was in what fed it. `CatalogueSync.tsx`
originally called the same `fetchAllSets` every other consumer uses — but
`fetchAllSets`/`getAllSetsWithFallback` *resolve successfully* with the bare
snapshot in two cases: no D1 binding at all (`getDb(context)` returns
`undefined` — true for every plain local `pnpm dev` session, since there's
no Cloudflare env), and a genuine D1 outage server-side (`fetchUploadedSets`
throws, caught and swallowed into the snapshot). Neither of those is a
network failure the client can see — the HTTP round-trip to the server
function still succeeds, it's just that the *handler* substituted a
fallback internally. So `CatalogueSync`'s `.then()` couldn't tell "a live D1
read actually succeeded" apart from "some fallback was substituted
server-side," and called `markCatalogueConfirmed()` in both cases — arming
`reconcileFromIdb`'s destructive purge against a snapshot-only catalogue via
exactly the class of case item 1 was written to prevent, just reached
through a server-side D1 failure (or plain local dev) instead of a
client-side network failure. The earlier reconciliation test suite didn't
catch this because it seeded `catalogueConfirmed` directly — nothing
exercised how the flag actually gets set.

Verified directly (not assumed): confirmed via `pnpm dev`'s reality that
`getDb(context)` returns `undefined` with no Cloudflare env, and via
`getAllSetsWithFallback`'s own source that both its `!db` and `catch`
branches return `sets` — a successful resolution either way. Also confirmed
against `@tanstack/start-client-core`'s actual `createServerFn` client
wrapper source (`if (result.error) throw result.error;`) that a handler
throwing server-side genuinely rejects the client-side call, rather than
assuming that from memory — the fix depends on that being true.

Fix: added `getAllSetsLive`/`fetchAllSetsLive` (`apps/web/app/data/sets.ts`)
— a non-swallowing sibling to `getAllSetsWithFallback`/`fetchAllSets` that
**rejects** (throws `NO_D1_BINDING` synchronously, lets `fetchUploadedSets`'s
error propagate) instead of substituting the snapshot, in exactly the two
cases the existing function swallows. `CatalogueSync.tsx` now calls this
instead — its `.then()`/`.catch()` split is now a trustworthy success/failure
signal, so `markCatalogueConfirmed()` only ever fires on a genuine live
success. Kept as an entirely separate function rather than changing
`getAllSetsWithFallback`'s contract, since that function (and `fetchAllSets`)
has other real consumers (`fetchAllSetsForRoute`, the `/sets` route loader)
that legitimately want the swallow-to-snapshot behavior and would have
broken from a shape change.

Answering the specific question this raised: **yes, before this fix, every
plain local `pnpm dev` session (no Cloudflare env, so no D1 binding) marked
the catalogue confirmed** — the purge branch was armed against a
snapshot-only catalogue on every local dev boot with saved sets in IDB, not
just in a production D1-outage scenario. Locked by a new test in
`tests/unit/components/CatalogueSync.test.tsx` mocking exactly that
rejection.

Tests, new `tests/unit/components/CatalogueSync.test.tsx` (the first test
file for this component) — renders the real component against a mocked
`fetchAllSetsLive` rather than seeding flags directly, so it exercises the
actual wiring: a genuine live success adopts the result and marks
`catalogueConfirmed`; a rejection (`NO_D1_BINDING`, or any other error) does
neither, and pre-existing `catalogueSets` (persisted-from-before or the bare
snapshot) is left untouched rather than regressed. `tests/unit/data/sets.test.ts`
gained a parallel `getAllSetsLive` describe block asserting rejection in
both cases `getAllSetsWithFallback` resolves in.

**Item 2 — validation precedence, deliberately the opposite of PR2's
"live wins" read-path rule.** New `isKnownSetId(db, id)` in
`apps/web/app/data/sets.ts`: checks the free, always-available static
snapshot first, only queries D1 on a miss, and fails closed (rejects) on a
D1 error. This is the opposite precedence from `getSetByIdWithFallback`
(D1-first, snapshot-fallback) — deliberately, because validation only cares
whether an id *exists at all*, never which copy is fresher, so resolving the
overwhelming majority of real traffic (every set that existed at the last
deploy) with zero D1 reads is strictly better than PR2's read-path rule
would be here. `plays` sits around ~300 rows total, so D1 read volume was
never the real concern — this is about not paying a D1 round-trip on every
beacon for sets that resolve for free. Both `routes/api/event.ts` and
`.../signal.ts`'s `validate()` are now `async` and take `db` as a second
parameter, threaded in from the handler (which now extracts `context.cloudflare`
*before* calling `validate`, rather than after). `signal.ts`'s `validate` is
now exported too, matching `event.ts`'s existing convention (both had a
"pre-existing gap" note about this predating the convention; closed here
since both are now async and worth testing symmetrically) — that symmetry
claim was initially unbacked (`api-event.test.ts` got the precedence tests,
`signal.ts` had no test file at all), caught in the same review pass as item
1's guard hole; new `tests/unit/routes/api-signal.test.ts` now covers
`signal.ts`'s own field validation (setId/setTitle/setArtist/listenedSeconds
bounds, `isOffline`'s null-fallback) plus the identical snapshot-hit/
snapshot-miss-then-D1/D1-miss precedence coverage `api-event.test.ts` has.

**Item 3 — offline degradation, folded into item 1's design rather than a
separate mechanism.** All five swapped consumers read `catalogueSets`, which
is *always* populated (bare snapshot at minimum) — none of them can render
empty or throw from a slow/failed boot fetch. Specifics: `Player.tsx` and
`useAudioPlayer.ts`'s media-session prev/next handlers use
`getAdjacentSets(catalogueSets, ...)`, degrading to the snapshot's ordering
if the live fetch hasn't resolved. `SaveForOfflineButton.tsx`'s "downloading"
modal title looks up `getCatalogueSet(catalogueSets, set.id)?.artist ?? set.artist`
— falls back to the prop it already has if the id isn't resolvable yet (e.g.
a very recent upload this device's catalogue fetch hasn't picked up).
`store/index.ts`'s `merge()` resolves a persisted `nowPlayingId` via
`getCatalogueSet(catalogueSets, id) ?? getSet(id) ?? null` — the second
fallback covers a payload persisted before `catalogueSets` existed at all.

Tests: full existing player/offline/tracking suites stayed green with the
swap (two isolated-store test files —
`tests/unit/store/reconcileUrlMigration.test.ts`,
`tests/unit/store/offlineFailureClassification.test.ts` — needed their
`makeStore()` helpers updated to compose `CatalogueSlice` alongside
`OfflineSlice`, since `startDownload`/`reconcileFromIdb` now read
`catalogueSets` off `get()`). New: `tests/unit/store/catalogueSlice.test.ts`
(pure `getCatalogueSet`/`getAdjacentSets` behaviour); a `catalogueSlice`
describe block in `tests/unit/store/persistRehydrate.test.ts` (restores from
a seeded payload, falls back to the bare snapshot for a pre-PR3 payload,
`catalogueReady` **and** `catalogueConfirmed` both always start false even
against a maliciously-seeded `true`); `isKnownSetId` precedence tests in
`tests/unit/data/sets.test.ts` + `tests/unit/routes/api-event.test.ts` +
new `tests/unit/routes/api-signal.test.ts` (fake D1 proving a snapshot-hit
never calls `db.prepare`, a snapshot-miss makes exactly one D1 query); and
the two `catalogueReady`/`catalogueConfirmed` combination tests in
`reconcileUrlMigration.test.ts` described above.

### Added 2026-08-04 — admin set-upload feature, PR4: the upload flow, direct-to-R2 via presigned URLs

`feat/admin-set-upload`, branched off `main` after PR3 merged. `apps/admin` gains
a third nav section (`sets`) — an Access-gated form that writes new rows into
the D1 `sets` table (PR1) via presigned direct-to-R2 uploads, appearing on
the public `/sets` page without a deploy. Six things were flagged for
resolution before/while implementing; two of them (upload progress, the
peaks JSON's real shape) weren't in the original high-level plan and
materially changed the implementation. All were verified, not assumed —
grounded claims below, file:line-level where it matters.

**Item 1 — upload progress on a 220MB file.** Confirmed via web search
(2026): `fetch()` still has no upload-progress API — no `onUploadProgress`,
and the ReadableStream-request-body workaround has inconsistent
cross-browser support. `XMLHttpRequest.upload.onprogress` is the mechanism
that actually works, and is what `apps/admin/app/utils/uploadWithProgress.ts`
uses for all three PUTs (a small Promise wrapper — this repo had no
XHR-based upload helper before this). `UploadSetForm.tsx` uploads
sequentially (audio → artwork → peaks, simpler progress math than parallel)
and shows both which file is uploading and an overall percentage weighted
by each file's byte size, so the 220MB audio file dominates the bar
realistically. A `beforeunload` handler is registered for the duration of
the upload and removed in a `finally` — the direct mitigation for orphaned
R2 objects, since most orphans come from an admin thinking the tab hung and
closing it, not a genuine create-step failure. Stated limitation: a single
presigned PUT (not multipart) has no resume — verified R2's single-PUT
limit is 35 GiB (Cloudflare's docs), so multipart isn't *required* at
220MB, but a dropped connection restarts that file's PUT from zero. Accepted
for v1.

**Item 2 — peaks JSON's actual shape, fetched from real R2, not assumed.**
Pulled the t.i.l. set's real peaks file
(`https://cdn.formatglasgow.com/002/Form_at%20002%20-%20t.i.l.json`) and
inspected it directly: `{ "peaks": [1.042, 0.831, ...] }` — a single top-level
key, exactly **1000** elements (confirmed against `scripts/generate-peaks.mjs`'s
`const PEAKS = 1000`, not duration-dependent), values **not bounded to
[0,1]** (real observed max: 1.137, min: 0.026 — the block-max-of-absolute-PCM-
sample computation in that script can exceed 1.0). The originally-planned
`Array.isArray` check alone was an under-check; a very-natural-seeming
`[0,1]` range guess would have actively rejected real files.
`validateUpload.ts`'s `validatePeaksFile` checks: parses, has a `peaks` key,
`Array.isArray`, `length === 1000` (exact — the one tool that produces these
files is hardcoded to that count), every element finite and in `[0, 2]`
(generous headroom above the observed max).

**Item 3 — double-submit / in-flight state mirrors `SendPushForm.tsx`
exactly**, not a new interaction invented for this form: a hard confirm-modal
second step, a `uploading` boolean that (once true) entirely replaces the
confirm/cancel buttons with the progress display rather than merely
disabling them, and result/error state that persists rather than being
silently discarded. A failed upload keeps the modal open with the error
visible and the confirm button available again — retrying restarts the
whole presign→3-PUTs→create sequence from scratch (re-presigning first,
since URLs may have partially been consumed/expired) rather than tracking
partial per-file completion across a retry — a deliberate scope cut, not a
silently-built partial-resume system.

**Item 4 — the success screen's three claims, each verified against the
actual merge/build code, not assumed:**
- *"Appears on `/sets` immediately"* — confirmed true: `fetchUploadedSets`
  (`packages/data/src/sets.ts`) runs `SELECT * FROM sets ORDER BY created_at
  DESC` live against D1 on every request, no caching layer between. One real
  nuance found: `routes/sets/index.tsx`'s `staleTime: 5 * 60 * 1000` means a
  browser tab *already sitting on* `/sets` won't re-run the loader and show
  the new set until reloaded or revisited after that window — worded
  precisely on the success screen rather than an unqualified "immediately."
- *Responsive artwork vs. OG banner — two different truths.* The OG banner
  is fixed by the next deploy (`generate-og.ts` reads the build-time
  snapshot, which `deploy.yml`'s `deploy` job regenerates live from D1
  before every production build). Responsive artwork variants are **not**
  "next deploy" — see the `Image.tsx` section below; that gap needed its own
  fix, landed in this PR rather than left open until PR5.
- *DJ-page linkage* — confirmed unchanged from the original plan: `djs.ts`'s
  `setIds` array has zero structural link to `sets.artist`. Stated on the
  success screen: which DJ, which id, which file to edit.

**Item 5 — the id slug matches the real convention, not an invented one.**
Read the actual migrated rows (`schema.sql`, `sets.generated.ts`):
`set-002-til`, `set-002-hubey`, `set-002-brandon-lee-vear`,
`set-002-julz-lever` — the pattern is `set-{eventSequence}-{artistSlug}`,
where `002` is the *event* number (shared across all 4, all titled "Form:at
002"), not a slug of the title. `slugifySetId.ts` extracts the sequence from
a `/Form:at\s+0*(\d+)/i`-matching title (zero-padded to 3 digits) and
kebab-slugifies the artist; falls back to a plain title+artist slug for a
non-matching title (a one-off event). The field stays editable regardless —
the fallback path doesn't need to be bulletproof, and in fact doesn't
reproduce one real legacy artist's unusual naming (`t.i.l.` → `t-i-l`, not
the hand-typed `til`) — an accepted, minor, expected mismatch given that
constraint. Scoping note: the 4 legacy sets share one `artwork` value
(`sets/002`, one photo per *event*); going forward each upload gets its own
artwork key derived from its own id (`sets/{id}/artwork.{ext}`) — a
deliberate simplification, not an attempt to replicate the legacy
one-photo-per-event convention.

**Item 6 — manual Cloudflare steps** (R2 API token scoped to `form-at-sets`
Object R/W; a *new, separate* bucket CORS rule for the admin app's
presigned PUTs — `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["*"]`,
production + `localhost:5174` origins; three new `form-at-admin` Pages
secrets, `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) were
handed to Julian before implementation started, so they ran in parallel
with the build. No new D1 binding, no R2 *binding* (`[[r2_buckets]]`) —
presigned URLs are pure REST/SigV4 signing against R2's S3-compatible
endpoint, so upload bytes never pass through the Worker.

**`Image.tsx` fallback — pulled into this PR, not left for PR5, with three
follow-up findings.** Reviewing item 4(b) surfaced a gap not in the original
plan at all: `Image.tsx` had zero `onError` handling, so an uploaded set's
artwork — no optimized AVIF/WebP variants exist for it until
`optimize-images.mjs` gains D1-awareness — would 404 and render as a
genuinely broken image (not just "non-responsive") on `/sets`, the set
detail page, and the full player, for as long as the gap between this PR
and that future one lasted. Decided: pull the fallback-*rendering* half of
PR5's already-designed fix into this PR; leave `optimize-images.mjs`'s
D1-awareness (generating the real variants) as PR5's sole remaining scope.

1. **State-tree replacement, not a `src` swap** — a `<picture>`'s `<source>`
   elements govern the `<img>`'s resolved URL for as long as they're in the
   DOM, so mutating `src` directly is a no-op. `Image.tsx` now flips a
   boolean state to replace the whole `<picture>`/`<source>` subtree with a
   bare `<img src={originalUrl}>` on failure.
2. **`artwork_original_url` didn't reach `MusicSet` at all** — confirmed by
   re-reading `packages/data/src/sets.ts`: `SetRow`'s own comment said this
   field "aren't part of the public `MusicSet` type... at all call sites
   don't need to know about them," a deliberate prior exclusion PR4 now
   reverses. Added `MusicSet.artworkOriginalUrl?`, mapped it through
   `SetRow`/`mapD1RowToMusicSet`, and updated
   `generate-sets-snapshot.ts`'s own *duplicated* `SetRow` type (doesn't
   import the shared one) to match, or its `rows.map(mapD1RowToMusicSet)`
   call stops typechecking. The 4 legacy rows have this column `NULL` (the
   migration `INSERT` never listed it) — harmless, since legacy artwork
   already has committed optimized variants and never hits the fallback.
   `originalUrl` is optional throughout; DJ-photo/event-flyer callers of
   `Image`/`CardArtwork` simply omit it, unaffected.
3. **Pre-hydration race, confirmed real for this app.** `app/server.ts`
   (`createStartHandler({ handler: defaultStreamHandler })`, comment "all
   SSR documents") confirms this app genuinely SSRs, with no `ssr: false`
   opt-out anywhere — so the optimized `<img src>` ships in the
   server-rendered HTML, and the browser can start (and finish failing)
   that request before React hydrates and attaches `onError` (`error`/
   `load` don't bubble, so React can only catch them via a listener wired
   up at hydration). Whether a given real page load's 404 actually "wins"
   that race is a runtime timing fact, not provable statically either way
   — so the mitigation is unconditional: a mount effect checks
   `img.complete && img.naturalWidth === 0` (the standard "already failed,
   no error event coming" signal) and flips the same fallback state
   `onError` would.
4. **SW `cacheWillUpdate` guard — checked directly against the pinned
   source, found unnecessary.** The original plan flagged this as needing
   verification ("whether Workbox's current default already excludes
   non-ok responses... not confident enough in that default from memory").
   Read `workbox-strategies@7.4.1`'s actual installed source (the exact
   pinned version): `StaleWhileRevalidate`'s constructor auto-prepends
   `cacheOkAndOpaquePlugin` whenever no plugin defines `cacheWillUpdate`,
   and that plugin's `cacheWillUpdate` returns `null` (don't cache) for any
   non-`200`/non-`0` response. `artwork-v1`'s route passes no `plugins`
   option, so a 404 is already never cached — confirmed, not assumed. No
   SW change made; an explicit guard would have been dead code duplicating
   an already-correct default.

Tests: `apps/web/tests/unit/components/Image.test.tsx` (new — no test file
existed for this component before); `packages/data/tests/unit/sets.test.ts`
gained the `artworkOriginalUrl` mapping case. `apps/admin`: `r2Sets.test.ts`
(`isValidSetId`/`deriveSetR2Keys`, including the fail-closed throw on an
invalid id and explicit path-traversal-shaped rejection cases —
see the id-validation section below); `slugifySetId.test.ts`; `fmt.test.ts`
(`fmtSetDuration` against the real stored row values); `validateUpload.test.ts`
(peaks/artwork/audio, including an `Audio()`-instance-capture technique
for jsdom, which doesn't decode real media); `api-sets-presign.test.ts` and
`api-sets.test.ts` (`validate()`, the conflict-before-any-presign path via a
fake-D1 `.prepare` spy, and `insertSetWithRetry`'s retry-then-fail
semantics); `UploadSetForm.test.tsx` (the full presign→3-PUTs→create
sequence, with a small reusable fake `XMLHttpRequest` class — this repo had
no XHR mock harness before this PR).

### Id validation — the client-controlled structural input, closed with defense in depth

Review flagged: the upload id is client-generated (`slugifySetId`) but
user-editable, and becomes both an R2 object key path segment
(`sets/{id}/...`) AND a public URL path segment (`/sets/{id}`) — the one
place in this whole flow the client controls something structural. A slash,
a `..`, a percent-encoded byte, or a unicode lookalike is a
path-traversal-shaped risk, not a cosmetic one.

`isValidSetId` (`apps/admin/app/utils/r2Sets.ts`): a strict allowlist —
lowercase ASCII `a-z0-9` and single hyphens only, bounded length, no
leading/trailing hyphen, no empty segments. No denylist, no
encoding-aware special-casing — the allowlist rejects slashes, `..`,
percent-encoded bytes, uppercase, whitespace, and non-ASCII by construction.

Enforced at three deliberately redundant points: (1) `validate()` in both
`/api/sets/presign` and `/api/sets` rejects a bad id before anything else
runs; (2) `deriveSetR2Keys` — the function that actually turns an id into a
key/URL — calls `isValidSetId` itself and throws if it fails, so it fails
closed even if some future call site or refactor forgets to validate first;
(3) the create endpoint re-derives public URLs from `{id, exts}` via this
same function rather than trusting any client-supplied URL string. Tested
explicitly against a slash, a literal `..` segment, a percent-encoded byte,
uppercase, whitespace, a unicode-lookalike digit/letter, and leading/
trailing/empty hyphen segments.

### Security decisions — server-derived keys, the real race guarantee, orphan policy

- **R2 keys are entirely server-derived** from a validated id — never a
  client-supplied path. `deriveSetR2Keys` is the single source of truth,
  used by both the presign and create endpoints, so there's no path where a
  client-controlled string becomes a bucket key or public URL without
  going through the id allowlist.
- **The `sets.id` `PRIMARY KEY` constraint at the create step's `INSERT` —
  not the presign step's earlier uniqueness check — is the actual
  race-proof guarantee.** The presign check is a UX-friendly early signal
  (a fast 409 before an admin does any uploading), not the safety story:
  two admins racing the same id could both pass the presign check if timed
  right, but the second `INSERT` fails on the constraint and that admin
  gets a 409 at the create step instead. `insertSetWithRetry` distinguishes
  a `UNIQUE constraint failed` error (the real thing, returned as `conflict`
  immediately, never retried) from a generic/transient D1 error (retried
  twice with backoff, `failed` only after both retries are exhausted).
- **Orphaned R2 objects on a genuine (non-retryable) create failure** —
  accepted, documented, manual-cleanup gap, same as the original plan.
  Mitigated in practice by item 1's `beforeunload` warning, which addresses
  the more common real-world cause (an admin closing the tab mid-upload),
  and by the retry logic absorbing transient create failures before they'd
  ever reach that state.

### PR5, now shrunk to exactly one thing

Originally scoped as the responsive-artwork gap closure in full. After this
PR pulled `Image.tsx`'s fallback-rendering fix forward, PR5's remaining
scope is just: teach `optimize-images.mjs` to read the snapshot, fetch R2
originals for uploaded sets, and generate their real AVIF/WebP responsive
variants at build time. No `Image.tsx` changes, no SW changes — both
already landed here.

**Done — see the PR5 entry below.** `optimize-images.mjs` → `optimize-images.ts`
(needed real TS imports, see that entry for why) gained exactly this scope
and nothing else.

### Added 2026-08-04 — admin set-upload feature, PR5: responsive artwork variants for uploaded sets

`feat/uploaded-artwork-variants`, branched off `main` after PR4 merged. Last
piece of the set-upload arc: `optimize-images.ts` now generates real
AVIF/WebP responsive variants for uploaded-set artwork, closing the gap
`Image.tsx`'s fallback (PR4) has been covering since it landed. Four things
were flagged for resolution first; all four changed the plan once actually
checked rather than assumed.

**Item 1 — was `optimize-images` even in the automated build? No — confirmed
by reading `apps/web/package.json` directly.** `"build"` was
`generate-sets-snapshot && og && sitemap && vite build && ...` — PR2 only
ever added `generate-sets-snapshot`; `optimize-images` remained a standalone
manual script Julian runs locally before committing `images-source/`
originals, exactly as `CLAUDE.md` already documented. Wiring it in was
genuinely part of this PR's scope, not a check that came back clean.

Confirmed the script already skips up-to-date output (mtime comparison,
`optimize-images.ts`'s `processOne`) before relying on that for the
build-time-cost argument — then measured, not guessed: ran
`pnpm optimize-images` against this repo's real `images-source/` (9 real
git-tracked images) — **0.357s total, "Processed 0, skipped 9 (up-to-date)."**
More importantly: in a **fresh CI checkout, `images-source/` doesn't exist
at all** (it's gitignored, never committed) — `main()`'s own `tryStat(SRC)`
guard means the git-tracked-image half of the script no-ops almost
instantly in CI regardless of mtime logic. The only real cost CI ever pays
is the uploaded-sets half, and only once per NEW upload (existence-only
skip after that — see item 2's design). Net: adding this to the build costs
effectively nothing today (zero uploaded sets, `images-source/` absent in
CI) and stays small going forward, bounded by upload count, not catalogue
size. `"build"` is now
`generate-sets-snapshot && optimize-images && og && sitemap && vite build && ...`
— ordered first among the three snapshot-consuming scripts, matching the
original plan. No `turbo.json` env changes needed: unlike
`generate-sets-snapshot` (needs `wrangler d1 execute`, hence
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`), this script only fetches
each set's *public* `artworkOriginalUrl` over plain HTTPS — no credentials
of any kind.

**Item 2 — the gitignore problem, the one genuinely hard part.** Legacy
sets' variants live in `public/images/sets/` and are **committed**.
Uploaded sets' variants would need to land in the same directory (same
`{something}-{w}.{ext}` shape) but must **never** be committed — CI
generates them fresh from R2 every build and can't commit back, and a
path-based `.gitignore` cannot distinguish an uploaded set's
`{id}-640.avif` from a legacy set's `002-640.avif` in the same folder —
they're identical in shape.

**Decision: uploaded-set variants get their own directory,
`public/images/uploads/`, gitignored wholesale** — not a gitignore pattern
keyed off something structural within `sets/`. Reasoning: this repo already
has the exact precedent for "a whole build-regenerated directory, ignored
wholesale, living beside committed content" — `public/og/` (per-route OG
banners, regenerated every build, gitignored as a directory) sits right next
to committed static assets with zero ambiguity. The alternative (an
allowlist-based gitignore naming the 4 legacy ids, or a manifest file
tracking which ids are "legacy" vs "uploaded") is strictly worse: fragile
(needs updating if a legacy image were ever hand-added again), and
semantically backwards for `.gitignore`'s exclude-by-default model.

**What this means for `Image.tsx`: nothing — zero changes needed, confirmed
by re-reading it.** `Image` only ever resolves whatever base path
`MusicSet.artwork` hands it (`/images/${artwork}-${w}.${ext}`); it has no
opinion about directory structure. The actual change is one line, in
already-shipped PR4 code: `apps/admin/app/routes/api/sets.ts`'s create
handler set `artwork: \`sets/${body.id}\`` — changed to
`artwork: \`uploads/${body.id}\``. Safe to change now, before this PR:
**zero uploaded sets exist in the table yet**, so there's no existing row
using the old convention that would need a migration. (The R2 *object* key
convention — `sets/{id}/audio.mp3` etc., `deriveSetR2Keys` in
`apps/admin/app/utils/r2Sets.ts` — is unrelated and unchanged; that's the
bucket's own key structure, not the local `/images/` path.)

**Item 3 — failure policy: skip and warn, never fail the build.** Argued
explicitly, not picked silently: `generate-sets-snapshot.ts` fails loudly by
design (`process.exit(1)` on any error) because a bad snapshot ships a
broken catalogue to every visitor — unacceptable. This is a different
shape of consequence: a missing/failed variant degrades to `Image.tsx`'s
already-shipped fallback (PR4), which renders correctly — just the plain,
un-optimized original instead of a responsive variant. Failing the whole
build over one set's bad artwork (R2 unreachable, a 404'd
`artworkOriginalUrl`, a file sharp can't decode) would block every other
set's deploy over a degrade-gracefully case. `processUploadedSet` catches
per-set, logs the reason, and continues — mirrors this same script's own
existing precedent (`processOne`'s undersized-source case is also a
warning, not a thrown error).

**Item 4 — honest about what's actually tested vs. what needs a real
upload.** With zero uploaded sets in the table today, the genuine
production path — a real `artworkOriginalUrl`, fetched over a real network
from R2, through a real deploy, with `Image.tsx` actually picking up the
generated variant instead of its fallback — is unexercisable by any
automated test. What's meaningfully covered in
`apps/web/tests/unit/scripts/optimize-images.test.ts` (new — no test file
existed for any `scripts/*` file before this PR): `fetch` mocked (no real
network dependency in CI), but **sharp itself is real** — a synthetic
in-memory PNG goes through the actual resize/encode/write pipeline, not a
re-implemented stand-in. Covers: real variant files written to
`public/images/uploads/{id}-{w}.{ext}`; confirms nothing is ever written
into `public/images/sets/`; skip-if-exists (existence-only, not mtime,
confirmed correct for R2-fetched bytes with no local source to compare
against); the failure policy against a mocked non-ok response AND a
rejected fetch, both returning a `failed` outcome rather than throwing; a
set with no `artworkOriginalUrl` skipped without ever calling `fetch`; the
no-upscale behavior for a narrow source. Before writing that suite, manually
verified the real end-to-end mechanism once, live (not assumed): served a
real repo image over a local HTTP server, pointed `processUploadedSet` at
it, confirmed a real fetch → real sharp decode → real file write round
trip, then confirmed skip-on-second-run and both failure paths — the exact
thing the automated suite now covers with a mocked fetch. **Genuinely
unverifiable pre-production, added to the manual checklist below.**

**Also fixed while here (found during this work, not scope creep — same
file, same review pass):**
- `processOne`'s undersized-source warning referenced an undefined `file`
  variable (should have been `rel`) — a real latent bug that would have
  thrown a `ReferenceError` the first time any git-tracked source narrower
  than 1080px was processed. Fixed.
- Converted `optimize-images.mjs` → `optimize-images.ts`, run via `tsx`
  (matching `generate-og.ts`/`generate-sitemap.ts`'s own convention) —
  required because this script now needs a real import of the committed
  snapshot (`../app/data/sets`), which plain `node` can't load from a `.ts`
  file without a build step.
- Guarded the script's `main()` auto-execution behind an
  `import.meta.url === file://${process.argv[1]}` check — without it,
  importing `processUploadedSet` for the new unit tests re-ran the ENTIRE
  git-tracked-image pipeline as a side effect every time the module loaded
  (caught while writing the manual verification script, before it ever
  reached the automated suite).
- Extracted the shared per-width-per-format sharp resize/write loop
  (`generateVariants`) used by both the git-tracked path and the new
  uploaded-set path — the loop itself was substantial enough (not "three
  similar lines") that duplicating it wholesale risked the two copies
  drifting if `WIDTHS`/`FORMATS` ever changed.

**Set-upload arc, closed out — what's verified in production vs. still
waiting on a first real upload:**
| Piece | Status |
|---|---|
| D1 `sets` table + 4 legacy sets migrated (PR1) | ✅ Live in production, serving real traffic |
| Live D1 + snapshot merge on `/sets`, `/sets/$id` (PR2) | ✅ Live in production |
| Remaining catalogue consumers on the merged source; `catalogueConfirmed` fix (PR3) | ✅ Live in production |
| Access-gated presign/create endpoints, id validation, R2 existence check (PR4) | ✅ Deployed, Access-gated — **never exercised by a real upload yet** |
| `Image.tsx` fallback + the state-leak fix (PR4 review) | ✅ Deployed — currently a no-op in production (no uploaded set exists to trigger the fallback path), verified only by the unit suite's simulated failures |
| `optimize-images.ts` uploaded-set variant generation (PR5) | ✅ Deployed, wired into every build — **has never run against a real uploaded set**; the `sets.filter(s => s.artworkOriginalUrl)` check will simply keep finding zero until then |
| DJ-page linkage for an uploaded set (`djs.ts`'s `setIds`) | Manual step, unautomated by design (§4 of the original plan) — untested because nothing has been uploaded to link yet |

**On-device / manual checklist for the first real upload** (the one thing
no test suite here can prove):
1. Upload a real set through the admin form. Confirm the 3 R2 objects land
   (audio, artwork, peaks), the presign→PUTs→create sequence completes, and
   the row appears in D1.
2. Confirm it appears on a fresh load of `/sets` (per PR4's staleTime
   caveat — a tab already open on `/sets` needs a reload).
3. Before the next deploy: confirm the artwork renders via `Image.tsx`'s
   fallback (the plain original, not broken) on both `/sets` and the set
   detail page.
4. Run (or wait for) a deploy. Confirm `optimize-images.ts` actually finds
   the new set (`sets.filter(s => s.artworkOriginalUrl)` picks it up from
   the regenerated snapshot), fetches its real R2 artwork, and writes real
   variants to `public/images/uploads/`.
5. Confirm `Image.tsx` now renders the OPTIMIZED `<picture>` (not the
   fallback) for that set post-deploy — the actual proof this whole PR
   exists for.
6. Confirm a second, no-op deploy after that doesn't regenerate the same
   set's variants (skip-if-exists working against real files, not just the
   unit-tested synthetic case).

### Added 2026-08-11 — RUM archiver: a cron Worker, and why it isn't a Pages Function

Step 2 of IMPROVEMENTS #12. `apps/rum-archiver` is a standalone Worker on a
daily cron that captures Web Analytics rows into `rum_daily` before Cloudflare
degrades them.

**Pages cannot run cron — verified, not assumed.** Pages Functions' API
reference exposes only HTTP handlers (`onRequest`, `onRequestGet`, …) with no
scheduled handler in the surface at all, and Cloudflare's guidance is to use a
Worker instead. That's what makes this a third deploy target rather than an
endpoint on `apps/admin`.

**GitHub Actions was rejected on its failure mode, not its cost.** It needs no
new target and the secrets already exist — but scheduled workflows are disabled
after **60 days without a commit**, and only commits reset the clock (tags,
issues and PR merges don't). On a project heading toward low activity that means
the archive stops quietly and permanently about two months after the last push,
which is precisely the scenario it exists to survive. Cloudflare has no notion
of repository activity.

**Every run re-fetches the whole 7-day unsampled window and upserts.** A missed
run then costs nothing provided another lands within the week. Worth being
precise about what that buys: it absorbs TRANSIENT failures — a timeout, a
missed tick — and would not have rescued the GitHub option, whose failure is
permanent. It lowered the reliability bar for whichever trigger was chosen; it
didn't change which one survives neglect.

**The query moved to `packages/data/src/rumArchive.ts`**, shared by the cron and
the live card. Apps never import each other, but the stronger reason is drift:
`confidence(level:)` is a required argument whose omission fails inside an HTTP
200, and that bug ran undetected until a live diagnostic caught it. A second
copy of the query in the Worker would be a second place for that class of
mistake to hide.

**Two narrow tokens, not one duplicated.** The Worker's Cloudflare API token
carries only `Account → Account Analytics → Read`; the dashboard's also carries
`Zone → Analytics → Read` for `edge_traffic`, which the Worker never touches.
D1 writes go through a binding, so no D1 permission is needed at all. Better for
rotation than duplicating: two copies of one token must roll together, while two
independent narrow tokens roll separately and neither can do the other's job.

**A failed read writes nothing.** In `rum_daily` a missing row and a zero row
are indistinguishable after the fact, so a partial write would manufacture a gap
that looks like a quiet week. Locked by a test.

**`CF_ACCOUNT_ID` is not wrangler's deprecated variable.** Wrangler now warns
that its own `CF_ACCOUNT_ID` env var is superseded by `CLOUDFLARE_ACCOUNT_ID`.
The repo is unaffected: everything wrangler itself reads (turbo.json,
deploy.yml, generate-sets-snapshot's error text) already uses the new name, and
the repo's `CF_ACCOUNT_ID` is a `[vars]` BINDING name we chose, read as
`env.CF_ACCOUNT_ID` at runtime. The collision is coincidental. Renaming the
binding to satisfy the warning would break `apps/admin` and the
`diagnose-visits` script, which reads it out of `wrangler.toml` by regex — so
both wrangler.toml files carry a comment saying so.

### Added 2026-08-09 — admin dashboard: a `visits` card from Web Analytics (RUM), beside `edge_traffic`

Built on `feat/rum-visitors-card`. The point of the pairing: `edge_traffic` and
`visits` disagree by a lot, and showing them side by side makes that legible
instead of relying on a caption nobody reads. It's also the number actually
wanted — roughly how many people arrive — which two of the three collective
members can't see at all, having no Cloudflare account.

**Schema pinned by introspection, not guessed.** Against
`rumPageloadEventsAdaptiveGroups`, account-scoped (`viewer.accounts`, keyed on
the Web Analytics site tag) rather than zone-scoped like the edge dataset.
Confirmed by introspection: `sum { visits }` exists and there is **no
`pageViews`** under `sum` — `count` is the pageload-event count, which is the
page-view equivalent since Cloudflare defines a page view as an HTML document
load and one beacon fires per load. Filters include `siteTag` and
`date_geq`/`date_leq`; dimensions include `date`, `bot`, `deviceType`,
`countryName`, `refererHost`, `requestPath`.

**Bots are IN the RUM data — the assumption going in was backwards.**
Cloudflare's own dimension docs describe "Exclude Bots" as making the dataset
"a closer representation of real user traffic", which only makes sense if bots
are present by default. The beacon is JavaScript so it misses non-JS crawlers,
but headless ones execute it. So bot exclusion is required for the card to mean
what it says, not a "just in case" filter.

Implemented by grouping BY the `bot` dimension and summing only non-bot rows,
rather than filtering server-side: the filter's value encoding isn't
documented, and reading the dimension back needs no assumption about whether
it's `0/1`, `"0"/"1"` or a boolean (`isBotRow` normalises all three, and a unit
test covers each). It also yields the bot share for free, which is shown —
concrete evidence for why the two cards differ.

**The uncertainty disclosure is a confidence interval, not a sample rate.**
The first cut showed `avg { sampleInterval }` (1 = unsampled, N = roughly
1-in-N). That was replaced after introspecting the `confidence` field, which
turned out to be far better suited: `Confidence` is an OBJECT (output only)
carrying `estimate`, `lower`, `upper`, `sampleSize`, and — the find —
`isValid`: *"True if the confidence interval is valid, i.e. there is enough
samples at low enough sample interval"*. `AccountRumPageloadEventsAdaptiveGroupsSumConfidence`
has exactly one field, `visits: Confidence`, so the number the card actually
shows is the one with an interval attached.

`sampleInterval` was then REMOVED rather than shown alongside. Both disclose the
same uncertainty, but the rate only proxies the question a reader has ("how much
can I trust this?") while the interval answers it. Showing both invites
reconciling two figures that say the same thing, and the simpler, weaker one
wins attention.

**`isValid` is the gate, not a threshold invented here.** True → show the
estimate with its bounds and plot the trend. False → show neither bounds nor
chart, and say the sample is too small to characterise. Cloudflare is better
placed than we are to judge whether its own interval means anything, and a
hand-picked cutoff would have been a guess dressed as rigour.

Per-row confidence is aggregated for the window total: bounds add, and
`isValid` is **ANDed** — a window is only as trustworthy as its least
trustworthy day, and reporting a valid interval across a mixed window would
launder the bad one. `sum { visits }` is still queried and used as a fallback
for any row without a confidence block, so the card never shows a hole, but it
is never displayed beside the estimate.

**Independent fetch, not merged with `edge_traffic`.** Two deferred round-trips
instead of one, both already off the critical path. They query different scopes
needing DIFFERENT token permissions — zone Analytics:Read versus account
Analytics:Read — so a token missing one blanks one card rather than both. That
was the live failure mode at build time, and one card working while the other
explains itself is the more informative outcome.

**Labelling.** `visits`, matching Cloudflare's own term, with the definition
stated on the card: a page load arriving from a different site or a direct link,
so moving between pages here or reloading doesn't add one; not sessions, and not
people, because Web Analytics stores no cookie or identifier and therefore
cannot count distinct humans at all.

### Added 2026-08-08 — admin dashboard: usage as landing tab, a totals card, and live Cloudflare edge traffic

Three things, on `feat/usage-default-dashboard`.

**`usage` is now the landing tab**, with `usage` first in `DashboardTabs`. The
dashboard is opened to answer "how is it doing?", which is a totals question,
not a funnel question. Growth keeps the funnels and ratios; Sets keeps per-set
detail.

Worth knowing for future changes here: **the default tab is encoded in e2e, not
in unit tests.** `pnpm test:admin` passed cleanly after the switch while five
`dashboard.spec.ts` specs were broken — one asserting "growth tab is selected by
default", and four growth-tab tests (chart dimensions, empty trend, y-axis
ticks, card sizing) that had relied on Growth being what loads. The
tab-switching spec also needed rewriting: it opened by clicking `usage`, which
had become a no-op that proved nothing.

**Two cards per row, not three.** `md:grid-cols-2` in both `UsageTab` and
`GrowthTab`, matching `SetsTab`. Three columns left each card too narrow for its
`TerminalRow` label/value pairs. The `totals` card spans both columns
(`md:col-span-2`) — it's a summary, and splitting it would create two scan
paths.

**Cloudflare edge traffic — `data/cf-analytics.ts`.**

*Why it exists at all.* The number was already visible in the Cloudflare
dashboard, which argued against building anything. The deciding reason is
product, not preference: the other two collective members have no Cloudflare
account, so "check the Cloudflare dashboard" isn't available to them. Inside the
Access-gated admin dashboard is the only place the number exists for two of the
three people who want it.

*Scope: a live read, no persistence.* Queried on each dashboard load; nothing is
archived into D1. If Cloudflare ages the data out it's gone from the card too —
accepted, because the first-party D1 metrics are the ones we actually own.

*Edge vs RUM — why the card is labelled the way it is.* `httpRequests1dGroups`
counts HTTP requests at Cloudflare's **edge**, including bots, crawlers, uptime
pingers and asset requests. Cloudflare Web Analytics counts **real browsers
running a beacon** and excludes bots. The two disagree substantially — plausibly
by an order of magnitude on a site this size. Both are correct; they measure
different things. So the card is labelled `edge_traffic` with rows
`requests` / `page_views`, **never "visitors"**, and carries a caption naming
the difference explicitly. Without that caption, anyone comparing this card to
Cloudflare's own dashboard sees two wildly different numbers for what looks like
the same thing and reasonably concludes one is broken.

*Retention is read, not assumed.* Cloudflare does not publish per-plan retention
— their docs direct you to the settings node per zone, which returns
`notOlderThan` in seconds. `resolveWindowDays` reads it, converts to whole days
and clamps to the 60-day chart window. The rendered `windowDays` is then the
number of rows that actually came back, not the number requested, so a
short window can't be presented as a full one. Padding a chart to 60 buckets
would render "not retained" as "no traffic" — the same failure mode the
`tracking since` captions already guard against for `app_launches`.

*Degradation.* Every failure path returns `null`: missing token or zone id,
non-2xx (a 403 is the likely token-scope misconfiguration), a GraphQL `errors`
array inside a **200** body, timeout via `AbortSignal.timeout`, and an empty row
set. The UI renders an explicit "no data" state for `null` and **never
substitutes 0** — a zero states "no traffic", which is a wrong fact rather than
a missing one.

*Deferred, not merely non-throwing.* The first version of this awaited the
Cloudflare call inside `fetchAdminDashboardStats` and claimed in a comment that
a slow API "costs one card, not the dashboard". That was false: returning `null`
instead of throwing means it can't FAIL the loader, but a plain `await` still
made the whole page wait, up to the 8s timeout. Slowness and failure are
different properties and the comment promised the one it didn't deliver. Fixed
by making the claim true rather than narrowing it: `fetchEdgeTrafficStats` is its
own server fn, and `dashboard.tsx`'s loader returns it through `defer()` — the
same pattern apps/web's `/sets` loader already uses for `fetchOverallStats`. The
dashboard renders immediately; the traffic card and the `edge_requests` row in
`totals` each read the promise through their own `<Await>` inside `<Suspense>`.
Two boundaries on one promise, so neither blocks the other, and the totals
fallback is the same em-dash it shows for a null result — no layout shift.

*Chart-units bug, found live.* The first version passed `dailyRequests`
straight to `TrendChart`, which takes ALREADY-BUCKETED weekly data — every
other card feeds it `bucketByWeek(fillDailyWindow(...), TREND_BUCKET_DAYS)`
first. `TrendChart` doesn't validate the shape, and its axis is reconstructed
as `length x bucketDays` back from now (`utils/trendDates.ts`'s
`bucketStartDates`), so 60 daily values drew a **413-day** span, captioned
"60 weeks" by `TrendChartInner`'s sr-only line, with tick labels running past
today. The row values (`requests`, `page_views`, `window: 60d`) were all
correct — only the chart was wrong, and wrong in the way that's hardest to
catch: it still looked like a plausible chart.

Fixed at the source: `fetchEdgeTraffic` now returns `weeklyRequests`, built
with the SAME shared two-step as every D1 trend rather than a second
implementation. `fillDailyWindow` also anchors the series to today and inserts
0 for any day Cloudflare omitted, so the reconstructed axis lines up with the
data. A unit test asserts 60 days collapse to 9 buckets (8 full weeks + a
4-day tail, matching `app_launches`' "9 weeks"), and an e2e test asserts the
rendered caption reads "5 weeks" for the 30-day fixture and that no chart
claims 30 or 60 weeks.

*Should the component defend against this?* Judged no — the convention is
fine and this was a call-site mistake. What was missing was that nothing at the
boundary stated the unit: the prop is called `data` and `bucketDays` silently
defaults to 7. Both a branded `WeeklyBuckets` type and making `bucketDays`
required would catch it at compile time, but each means touching ~10 healthy
call sites to fix one bad one. Instead the unit is now documented on the prop
itself and on `EdgeTraffic.weeklyRequests`, and the fixture uses a realistic
5-bucket array so a daily series can't sneak back in through the sample path.

*Retention boundary is now observable.* `window: 60d` coming back as exactly
the maximum has two possible causes — genuine retention >= 60 days, or the
settings read failing and the full-window fallback firing — and they looked
identical from outside. `resolveWindowDays` now returns
`{ days, fromBoundary }`, and the card discloses when the cap was never
confirmed. Note the window claim itself was never unsubstantiated:
`windowDays` counts rows Cloudflare actually returned, so 60 rows for a 60-day
request proves retention >= 60 days either way. What was hidden was whether the
settings query works at all — if it never does, it's a wasted round-trip and
the clamping logic is dead code.

*`confidence` takes a REQUIRED `level` argument — and the query never once
succeeded until this was found.* Omitting it returns **HTTP 200** carrying
`error parsing args for "confidence": level: not a number`. `postGraphQL`
correctly treats a body-level `errors` array as a failure and returns null, so
the card sat in its failure branch from the moment it shipped — not the
empty-window branch, and not because of the token. Two guesses (mine: "no data
yet"; the token scope) were both wrong, and only running the real query settled
it. `level` is now pinned to `RUM_CONFIDENCE_LEVEL = 0.95` rather than left to a
default: an unstated level makes an interval uninterpretable, since a 99% and a
50% interval are very different widths on identical data, and a default that
shifted under us would silently change what the card claims.

*The diagnostic lives in the repo now* — `apps/admin/scripts/diagnose-visits.mjs`,
run with `pnpm -C apps/admin diagnose-visits`. The card deliberately collapses
every failure into one state, which is right for a dashboard and useless for
debugging, so the diagnosis has to live somewhere. It runs the app's exact
query, reads the account id and site tag from the same committed files the app
reads (so a stale copy can't send someone chasing a phantom difference), and
names the cause: token scope, a bad `level`, a renamed field, or genuinely no
data. It has already settled two questions that guesswork got wrong.

*Empty window vs failed read.* An empty window now returns a real zero carrying
`noDataInWindow`, not null; only an unreadable response stays null. §1's
never-substitute-0 rule forbids substituting 0 for a FAILED read — a window with
no rows is a successful read of zero, and conflating the two had the card
telling a reader to check credentials when the honest answer was "the beacon
started collecting today". Wrong for this dataset specifically: unlike
edge_traffic, whose window is never legitimately empty, a beacon starts empty by
definition.

*First live run — three things settled with data, not inference.*

1. **`estimate` is identical to `sum { visits }`** (12 vs 12), so the plain sum
   was dropped from the query. One number beats two a reader has to reconcile.
   It had been serving as a fallback for a row with no confidence block; without
   it, such a response now returns **null** rather than 0 — there is no visit
   count to report, and §1 forbids substituting 0 for a metric that didn't load.

2. **`isValid` is false on every day**, and not because of sampling — the
   samples are simply tiny (n = 4, 6, 1, 1), so the intervals come back
   degenerate: `[4,4]`, `[6,6]`. The card suppresses bounds and chart, which is
   the design working rather than failing. The interval machinery stays in place
   precisely because it self-corrects: it re-appears when volume makes it
   meaningful, so removing it would only mean rebuilding it later. The
   suppression caption now says so explicitly, because "too few samples" alone
   reads like a fault.

3. **RUM records bots — confirmed in our own data**, not just inferred from
   Cloudflare's docs: the 2026-08-09 rows include a `bot=1` group. The original
   assumption ("the beacon is JavaScript, so bots won't run it") was wrong twice
   over — first contradicted by the docs' "Exclude Bots" dimension, then by our
   own dataset. **The bot exclusion is load-bearing, not precautionary**: without
   it this card would silently include crawler traffic while claiming to count
   real browsers.

*The `isValid` AND rule could never unlock — found on the live card.* Validity
was aggregated as `conf.every(c => c.isValid !== false)` across every daily row.
Sound-sounding ("a window is only as trustworthy as its least trustworthy day")
and wrong in practice: over ~57 days there is always a quiet day with n=1, so
the AND was permanently false and the chart could never appear however much
traffic grew. A permanent suppression wearing a temporary one's clothes.

Split into two questions that were being conflated:
- **Does the window total's interval say anything?** Now `upper > lower` on the
  SUMMED bounds — degenerate bounds carry no information whatever Cloudflare
  says about them, and one quiet day can't veto the rest. Summing per-day bounds
  is a conservative containment: if each day's true value lies in its own
  bounds, the total lies in the sum.
- **Is the daily trend honest?** That depends on sampling, not on interval
  width. `avg { sampleInterval }` is queried again for exactly this: at 1 the
  daily figures are EXACT COUNTS and the shape is real, however small the
  numbers — smallness makes an interval meaningless, not a count wrong. Only
  extrapolated figures with no usable interval make the shape an artefact, and
  only then is the chart withheld.

*The "too few samples (12)" beside "visits: 120" was a real bug, not wording.*
The two figures reduce over the SAME rows, so they could never disagree by
window — ruling that out left the data. Two causes, both fixed: `sampleSize` was
summed with `?? 0`, so rows that omit it contributed silently and produced a
small, confident, meaningless total (now `null` when no row reports one, and the
caption omits it rather than printing a fabricated number); and it was being
compared to the wrong quantity in the first place — Cloudflare defines it as
"samples that contributed to the estimate", i.e. pageload EVENTS, so it tracks
`pageloads`, not `visits`. Two different quantities placed side by side as
though comparable.

*Sampling is a property of the data's AGE, not the query — and the visits
window is now 7 days because of it.* An initial 7-day probe showed
`estimate == sampleSize` on every row and was read as "unsampled". A 60-day
probe returned intervals of 10 and 16.67. The tempting conclusion — "the width
of the query decides" — is wrong and implies a lever that doesn't exist:
Cloudflare retains beacon data **unsampled for 7 days, then aggregates it to
around 10%**, so rows simply degrade as they age. ANY window past a week drags
in already-degraded data, permanently, and no width recovers it.

So the `visits` window is pinned at `RUM_WINDOW_DAYS = 7`, entirely inside the
unsampled period. What the 60-day window was actually reporting: 120 visits
extrapolated from **12 real observations**, with only **11 of 55 days** carrying
any rows — sampling had deleted whole days. That isn't history worth keeping
over exactness. At 7 days: exact counts, every day present, a real chart, and no
extrapolation caveats. `edge_traffic` keeps its 60 days, since zone request data
isn't sampled this way.

That also settles what `sampleSize` means: `sampleSize x sampleInterval ~= visits`
(11 x 1 = 11 at 7 days; 12 x 10 = 120 at 60). It is the RAW count behind the
extrapolated estimate — not a page-load count, and not comparable to `visits`
directly. An intermediate fix asserting it tracked `pageloads` was wrong too
(11 vs 23 raw), and its test was corrected rather than left passing on a false
premise.

*Two more corrections from re-running the diagnostic, both understating or
overstating precision.* The card reported the MAXIMUM per-row `sampleInterval`,
so with live rows at 10 and 16.67 it would have said "1-in-17" about a total
that was actually scaled by exactly 10 (120 visits from 12 samples). And the
window "span" was measured to TODAY, while the newest row was two days older —
so a "spread across 57d" caption overstated coverage by exactly that gap.

Both fixed by separating questions that had been sharing one number, the same
pattern as the interval/chart split above:
- **"Was any of this extrapolated?"** → `countsAreExact`, from the coarsest
  row. Conservative on purpose: understating sampling would chart an artefact
  as real traffic. The two can disagree — a row can advertise an interval its
  own estimate doesn't reflect — and each answer is right for its own question.
- **"By how much was the number on screen scaled?"** → `sampleInterval`, now
  the effective factor `visits / sampleSize`. It describes the total a reader
  is looking at rather than one row.
- **"What period does the data cover?"** → the `startDay`–`endDay` pair, shown
  directly instead of a computed span that silently ran to "now".

*What the narrowing made dormant, and what it deleted.* Nothing sampling-related
was removed: Cloudflare's query-time sampling is volume-driven as well as
age-driven, so a high-traffic future could sample even a 7-day window. So
`countsAreExact`, the `sampleInterval` reporting and the chart-suppression
branch all stay — currently unreachable, deliberately kept, and covered by unit
tests rather than by any live path.

What DID go is the RUM retention read. `resolveRumWindowDays` queried the
account settings node to clamp the window against `notOlderThan`; with a fixed
7-day window that clamp can never bind, since retention runs to at least 56 days
(the 60-day probe returned rows from 55 days back). It was a round-trip on every
dashboard load that could not change the answer. Deleted, along with
`boundaryKnown`, which existed only to disclose that read failing. `edge_traffic`
keeps its own boundary read — 60 days genuinely can exceed a zone's retention.

*Span is not coverage.* `windowDays` measures from the oldest row to today: on
the live card a 57-day span carried only **11 days** of rows. A caption reading
"57 of 60 retained days have data" off that span was false. `daysWithData` now
counts distinct days that actually returned rows, and the caption states both —
noting that a day with no rows isn't necessarily a day with no traffic, since
sampling drops low-volume days from wide windows.

*Two captions asserted causes they couldn't know.* The suppression caption said
"too few samples (12)" beside "visits: 120" — two numbers with no stated
relationship, implying they described the same thing. And the coverage caption
claimed "the beacon started collecting recently" for a 57-of-60-day window, when
the beacon had in fact been collecting for months via edge injection and had
only just stopped. Both now state what is observable and claim no cause: why the
earlier days are empty is not knowable from this data.

*Small-n honesty for the bot share.* At a dozen page loads, one extra bot moves
the share from 8% to 17% — a swing that reads as a finding when it's noise. The
data layer therefore reports raw counts (`botPageloads` / `totalPageloads`) and
the card only adds a percentage above its own
`MIN_PAGELOADS_FOR_BOT_SHARE`.

That constant is deliberately separate from `MIN_SAMPLE_FOR_RATE`, despite
being the same shape of rule. The first instinct was to share it — one
mechanism, no new threshold to justify — but the two live at different orders
of magnitude: `MIN_SAMPLE_FOR_RATE`'s 10 is a floor over PROMPT IMPRESSIONS,
where double digits is a real sample, while page loads accumulate far faster,
so 10 of them is a fraction of an hour and would stop suppressing long before
the percentage settles. Sharing the name would also mean tuning one metric
silently retunes the other. Same reasoning as §1 not taking one entry per
feature: a shared name implies a shared meaning. 100 is chosen so one extra bot
moves the figure by about a percentage point rather than eight.

*Credentials.* `CF_ANALYTICS_TOKEN` is a Pages secret. `CF_ZONE_ID` is a plain
`[vars]` entry in `apps/admin/wrangler.toml`, deliberately NOT a secret: it's a
public identifier like the Access AUD tag, reading analytics with it still needs
the token, and storing it as a secret would imply it needs protecting.

*Verification honesty.* Unit tests cover the happy path, retention clamping, the
requested date range, no-credentials, 403, GraphQL-errors-in-200, throw/timeout
and empty-window — all against a mocked `fetch`, because the API is unreachable
from tests and CI. **The integration was not end-to-end verified.** The first
real proof is loading the dashboard after the Pages secrets exist.

**Found while checking 375px, and fixed:** `AdminNav` was a non-wrapping flex
row (wordmark + three links) that pushed the document 10px wider than a 375px
viewport — horizontal scroll on *every* admin page, pre-existing and unrelated
to this work. Now `flex-wrap` with tighter mobile gap/padding, desktop spacing
unchanged from `sm:` up. Measured before and after: `scrollWidth` 385 → 375, no
offending elements. A regression test asserts zero overflow at 375px.

### Added 2026-08-05 — admin set-upload feature, PR6: minimal edit/delete, and why delete needed six things resolved first

`feat/admin-set-edit-delete`, branched off `main` after PR5 merged. Closes
the set-upload arc: a list of existing sets on the admin `/sets` page, a
metadata-only edit form, and a delete action. Edit is the easy half — delete
interacts with three systems that don't know about each other (offline-
download reconciliation, the build-time snapshot's merge semantics, and the
analytics tables), and each interaction was traced precisely before deciding
what to build. Two more findings surfaced mid-review, on top of the six
originally flagged, and are folded in below at the point they apply.

**Items 1 + 2 — the delete timeline, traced through the actual merge/
reconciliation code, not assumed.** `mergeSets(live, snapshot)`
(`packages/data/src/sets.ts`) is a *union* keyed by id: an id present in the
snapshot and absent from live still appears in the merged result, because a
union has no memory of what it doesn't contain — it can't tell "not yet
uploaded" apart from "removed." Same shape of gap in `fetchSetById`: a D1
miss falls back to the snapshot's stale copy. Precise consequence: at
delete time, the currently-deployed JS bundle still ships the old
snapshot, so the deleted set keeps appearing on `/sets`, the detail page,
and — critically — in the client-side `catalogueSets` store, *regardless
of whether the client's boot fetch succeeds* (a successful fetch computes
`mergeSets(freshLive, staleSnapshot)`, and the stale half still has the
entry). `reconcileFromIdb`'s destructive purge (PR3) therefore does **not**
fire on any device, no matter how fresh its boot is, until the *next
deploy* regenerates the snapshot without the deleted row — and even then,
only for a device that gets the new bundle and completes a
`catalogueConfirmed` boot. An installed PWA that stays offline can hold a
"deleted" set's saved bytes for an arbitrarily long time past that.

**Decision: this is the correct behavior, not a bug — the fix is honesty in
the UI, not a redesign.** Eventually reclaiming a stale download once a set
is genuinely gone is the right outcome; anything faster means either a
synchronous cross-device purge mechanism or an immediate local delete with
no server record to reconcile against later (worse). **The tombstone
alternative — a deleted-ids table the merge step also consults, making
delete take effect before the next deploy — was named explicitly and
declined**, per the standing instruction not to build a scope increase
without flagging it first: a union has no way to close this gap on its own,
and closing it needs a real, standalone mechanism this PR doesn't build.
The delete confirmation modal states the full chain in plain language
instead (see the UI section below).

**Item 1a (new, surfaced during review) — the admin list makes no
distinction between a set uploaded five minutes ago and one of the 4
legacy sets with hundreds of real plays.** `fetchUploadedSets` returns
every row identically. A hardcoded "these 4 ids are legacy" check was
rejected as the signal — it's coincidental and stops meaning anything once
more sets accumulate real history. **Actual play count is the real
signal**, and `admin-stats.ts` already computes it per set. The sets-list
loader (`fetchSetsWithPlayCounts`, `apps/admin/app/data/sets-admin.ts`)
joins it in with one extra query (`SELECT set_id, COUNT(*) AS n FROM plays
GROUP BY set_id`), not one query per set. A zero-play set gets the normal
single-confirm modal; any recorded plays requires typing the set's exact id
before the confirm button enables — proportionate friction for a delete
that isn't soft, scaling automatically as history accumulates instead of a
list that needs remembering to extend.

**Item 2a (new, surfaced during review) — nothing recorded what was
deleted, so "recoverable in principle" (item 3's R2 objects survive) wasn't
actually recoverable in practice.** Two options were on the table: return
the deleted row in the response and display it for the admin to copy
before navigating away, or log it persistently. **Chose the persistent
log** — the display-only approach depends on the admin actually copying the
data in that exact moment, in that tab; one accidental navigation and the
surviving R2 objects become unrecoverable anyway for lack of the metadata
needed to reconstruct the row. A new `admin_deleted_sets` table
(`apps/web/schema.sql`, proposed — Julian applies it himself via
`--command`, same convention as every table in that file) mirrors
`admin_push_sends` exactly: full row data, who deleted it (the verified
Access identity, never client-supplied), when, and the play count at
deletion for context. `SetsList.tsx` also renders a `RecentlyDeletedSets`
list below the main list — mirroring `RecentPushSends`'s exact placement
reasoning (visible before a new delete, so an accidental repeat is caught
the same way an accidental duplicate send already is) — so the log is
actually visible day-to-day, not a table Julian would need `wrangler` to
inspect. **Update (2026-08, one-click restore feature, entry below):** the
log's actual recovery path is no longer "read this via `wrangler`, hand-
write an `INSERT`" — `RecentlyDeletedSets` now has a `[ restore ]` action
that does exactly that automatically.

**Post-review fix — item 2a's log was written in the wrong order, and the
first real delete would have hit it.** The initial version issued `DELETE
FROM sets` then `INSERT INTO admin_deleted_sets` as two separate `.run()`
calls. `admin_deleted_sets` doesn't exist in the remote DB until Julian runs
the migration — so the first delete after deploy, before that migration
runs, would have deleted the row and then thrown on the missing table:
gone, unlogged, exactly what item 2a exists to prevent. The tests didn't
catch it because they only asserted both statements were issued
(`calls.some(...)`), which is order-blind.

Fixed two ways:
- **Real atomicity via `db.batch()`**, confirmed against Cloudflare's docs
  rather than assumed from the name: batched statements run as one SQL
  transaction — any statement's failure rolls back the entire batch, not
  just that statement. `deleteSetWithAudit` now passes `[insertAudit,
  deleteRow]` to a single `db.batch()` call, so a failing INSERT (e.g. the
  un-migrated-table case) leaves the DELETE uncommitted too, by
  construction — not by luck of statement ordering.
- **Log-first ordering kept anyway**, as the fallback: the array order is
  INSERT then DELETE, so even if D1's atomicity guarantee were ever weaker
  than documented, this still fails in the safe direction (row intact,
  error surfaced) rather than the reverse.
- **The play-count read no longer aborts the delete on failure** — it's
  metadata about the deletion, not a precondition for it, so it's wrapped
  in its own `try`/`catch` and defaults to 0.
- **New tests lock the ordering directly**: one asserts the exact array
  passed to the fake `db.batch()` (`[INSERT, DELETE]` in that order, not
  just "both were called somewhere"); another sets the fake batch to throw
  and asserts the whole call rejects with both statements still bundled in
  the one batch invocation that failed; a third asserts a throwing
  play-count read still results in `"deleted"` with `0` logged.

**Item 3 — R2 objects on delete: left in place, documented, same policy as
PR4's create-failure orphans.** Deleting the objects immediately would
break anyone mid-playback via the live network stream and anyone whose
device still has the set from the stale snapshot (items 1/2). R2 storage
is cheap; a few orphaned files cost nothing meaningful. No code for this —
it's a decision not to build R2 cleanup, same class of accepted gap PR4
already established for the other direction.

**Item 4 — orphaned analytics rows: verified already handled, not built.**
Checked both places a `set_id` resolves to a display title.
`fetchPlayStats` (the dashboard's "top sets" widget) denormalizes
`set_title`/`set_artist` directly into each `plays` row at write time and
never touches the catalogue — deleting a set has zero effect here,
historical titles keep showing correctly forever, exactly right for
"historical data is the point." `fetchClickStats` does map through
`getSet()`, but already has a graceful fallback (`setTitle: set?.title ??
setId`, `setArtist: set?.artist ?? "unknown"`) that was already tested
before this PR. **No code changes needed.** One minor, accepted cosmetic
gap found and left alone: the dashboard's per-set picker seeds its initial
selection from the top set's id, and if that set was since deleted, no
picker button highlights as selected — but the stats themselves still load
correctly by raw id regardless. Cosmetic, not a data-integrity issue, out
of scope for "minimal."

**Item 5 — id immutability: enforced structurally, not by validation.**
`updateSet` (`apps/admin/app/routes/api/sets.ts`) never includes `id` in
its `UPDATE ... SET` clause — it appears exactly once, in the final
`WHERE`. Even a client-sent mismatched id has no code path that could act
on it as anything other than "which row to update." Tested by asserting
the actual SQL text, not just the observable outcome — the only way to
prove `id` never reaches the `SET` position regardless of what's passed.

**Item 6 — edit precedence: confirmed via source, zero new data-layer
code.** `fetchSetById` (D1-first) and `mergeSets` (live-wins) already read
the live table on every request — this precedence was fixed in PR2
specifically so a direct-SQL edit shows up immediately. An edit through the
new `PATCH` endpoint is just another `UPDATE` against the same table these
already-shipped functions query, so it shows up on both the list and the
detail page the moment the request completes. Same `staleTime: 5 * 60 *
1000` caveat from PR4 still applies — stated in the edit success UI.

**Scope decision: edit is metadata-only — title/artist/date/venue/
description/duration, no file replacement — for a reason beyond smaller
scope.** Replacing a set's audio/artwork/peaks at the *same id* means the
R2 key and public URL are unchanged, so every user who already saved that
set offline keeps the *old* bytes forever: `reconcileFromIdb` only checks
catalogue *membership* by id, never content freshness, so a same-id file
swap is entirely invisible to it (unlike delete, which eventually evicts
the id). Replace the audio without the peaks and the waveform silently
stops matching what's playing, with no error anywhere. A real fix needs
versioned R2 keys or a forced-eviction path — recorded here specifically so
a future file-replacement PR starts from the actual hard part instead of
assuming it's just "the upload flow again, for an existing row."

**Item 6a (new) — verified PATCH/DELETE dispatch on the same route as
POST, empirically, before writing any real logic.** This repo had only
ever had single-method API routes. Read `@tanstack/start-server-core`'s
actual dispatch code (`handlers[requestMethod] ?? handlers["ANY"]` — a
plain object keyed by HTTP method) as first evidence, then proved it live:
added temporary `PATCH`/`DELETE` handlers returning a distinguishable fixed
response, started the real dev server, and `curl -X PATCH`/`-X DELETE`
against `/api/sets` — both reached their own handler correctly, and a
`POST` in the same run still reached the real (401-returning) create
logic, confirming the three methods dispatch independently on one route
file. Only after that did the real Access/validate/D1 logic replace the
stubs.

**Security/enforcement summary**: R2 keys are entirely server-derived
(unchanged from PR4); the `PRIMARY KEY` constraint remains the real
create-time race guarantee; id immutability on edit is structural (item 5);
delete never touches R2, `plays`, or `events`, only reads a play count from
`plays` for context and the audit log.

**Set-upload arc, now fully closed.** PR1 (D1 groundwork) → PR2 (live
overlay) → PR3 (remaining consumers + the `catalogueConfirmed` fix) → PR4
(upload, Access-gated, R2-verified) → PR5 (responsive artwork for uploaded
sets) → PR6 (edit/delete, with the delete-consequences chain made explicit
in the UI rather than left implicit). Everything from PR4 onward is
deployed but has never been exercised by a real upload — the on-device
checklists in PR5's and this entry's own manual-verification sections are
what close that gap, not anything further to build.

**Manual verification for this PR** (mirrors PR4/PR5's "waiting on a real
event" honesty): edit a real set, confirm the change appears immediately
on both `/sets` and its detail page without a deploy; delete a zero-play
test set, confirm the single-click flow; delete (or attempt to delete) a
set with real plays, confirm the type-to-confirm gate actually blocks the
button until the id matches; confirm the deleted row appears in
`RecentlyDeletedSets`, and — since one-click restore now exists (entry
below) — confirm it can also be restored via the UI, and that a second
restore attempt on the same (now-restored) entry 404s; confirm the
deleted set keeps rendering on the public site until the next deploy,
then disappears after it (the one part of this PR that only a real deploy
boundary can prove).

---

## One-click restore for deleted sets (2026-08)

PR6 shipped a delete audit log (`admin_deleted_sets`) specifically so a
delete would be "recoverable in practice" — but the only recovery path was
manual: read the log row via `wrangler`, hand-write an `INSERT INTO sets`.
This closes that gap with a `[ restore ]` action on each entry in
`RecentlyDeletedSets`.

**Restore-from-log, explicitly NOT soft delete.** `admin_deleted_sets`
already stores every column needed to reconstruct a `sets` row (all of
them except `peaks_status`, which is `DEFAULT 'ready'` and — confirmed via
grep before writing any code — never set to anything else anywhere in the
codebase; omitting it from the restore `INSERT` lets it default correctly).
R2 objects were deliberately never deleted (PR6 item 3). So a restore is
just: read the log row, `INSERT` it back into `sets`, mark the log entry
restored. **Nothing about `mergeSets`, `fetchUploadedSets`, `fetchSetById`,
or the snapshot generator changed** — a soft-delete/tombstone design would
have needed all of those touched; restore-from-log needed none of them,
which is the whole reason this didn't become a bigger feature than it is.

**New route, not a 4th handler on the existing one.** `POST
/api/sets/restore` lives in `routes/api/sets/restore.ts`, a nested file
alongside the existing flat `routes/api/sets.ts` — a genuinely different
path needs its own route. Verified live (temporary stub handler + `pnpm
dev` + curl against both `/api/sets` and `/api/sets/restore`) that this
coexists with the flat route with zero collision, before any real logic
was written — same rigor PR6 item 6a used to verify multi-method dispatch
on a single route file.

**Four real failure modes, each surfaced with an actual message, not a
generic "restore failed":**
1. **The id may have been reused.** Someone could upload a new, unrelated
   set reusing the deleted id since the delete happened. The restore
   `INSERT` hits the same `PRIMARY KEY` constraint the create endpoint
   already relies on for its own race-safety (PR4) — caught via the same
   `isUniqueConstraintError` check `insertSetWithRetry` uses, now exported
   and shared rather than duplicated — and returns a 409 with an explicit
   "a set with this id already exists" message. The existing row is never
   touched or overwritten under any circumstance.
   **Verified empirically, not assumed**: restore's INSERT runs inside a
   `db.batch()`, not a standalone `.run()` like `insertSetWithRetry`'s —
   `batch()` could plausibly have wrapped or reshaped the thrown error
   into something `isUniqueConstraintError`'s string check misses, quietly
   turning this 409 into a 500. Checked against a real local D1 database
   (`wrangler dev --local`, genuine miniflare/SQLite, not docs alone), with
   the conflicting `INSERT` in the same first-statement position
   `restoreSetFromLog` uses: the thrown error's message was byte-for-byte
   identical to a direct `.run()`'s (`D1_ERROR: UNIQUE constraint failed:
   <table>.id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_PRIMARYKEY)`),
   and identical regardless of which position in the batch array the
   conflict came from. The unit test's fixture string was updated to this
   exact real value rather than an approximation.
2. **`created_at` uses the log's ORIGINAL value, not `Date.now()`.** A
   restore undoes a mistake; it isn't a new upload. Using the current time
   would visually announce "just uploaded" on a set that's actually been
   live for months, misleading anyone reading the catalogue by recency —
   the log already stores the original value specifically for this reason
   (see PR6's `admin_deleted_sets` schema comment).
3. **The log entry needs its own `restored_at` marker, not a `sets`-
   membership check.** Considered filtering `RecentlyDeletedSets` by "is
   this `set_id` currently in `sets`" instead of a new column — rejected,
   because that check goes stale the instant someone uploads a *different,
   unrelated* set reusing the same id (a real scenario now that failure
   mode 1 exists): the old log entry would silently vanish from the list
   even though nothing was restored. A nullable `admin_deleted_sets
   .restored_at` column, set only by restoring THIS specific log row (its
   own autoincrement id, not just `set_id`, since the same set id can be
   deleted-then-restored more than once over time), has no such ambiguity.
   The log row itself is never deleted — the audit trail survives, only
   this specific entry drops out of the "still needs attention" view.
4. **R2 objects are re-verified before inserting**, reusing PR4's
   `verifyR2ObjectsExist` — extracted its HEAD-check loop into a lower-level
   `verifyUrlsExist(urls: string[])` (zero behavior change for the create
   path, same exported name/signature, existing PR4 tests untouched) so
   restore can check however many URLs a given log row actually recorded.
   **The null-handling is structural, not a loose truthy filter**: legacy
   sets never had an `artwork_original_url` (`NULL` in the log, copied
   verbatim from the live row at delete time) — that's "never had one,"
   skipped. A URL the row DID record that now 404s is a genuine
   `r2_missing`, never silently skipped. The two cases can't collapse into
   each other because the log's nullness is a byte-for-byte copy of what
   was true of the original row at deletion time.

**Considered whether restore needed delete's typed-confirmation gate —
decided no, but not because "it's not destructive."** Restore republishes
the set to the public site **immediately** (confirmed: `getAllSetsWithFallback`
reads live D1 on every `/sets` request, not just at build time — unlike
delete, there's no snapshot-staleness delay working in restore's favor).
If a set was deleted for a reason — wrong file, a rights issue, an artist's
takedown request — one careless click puts it back live, which is a real
consequence. The reason it still doesn't get a typed-id gate: that gate
scales friction with a *measurable* signal (play count — how much history
is at stake). Restore has no analogous per-entry metric; whether it
*should* come back is a binary human judgement no count could express, so
gating on an arbitrary typed field would be friction without a signal
behind it. The actual mitigations: reaching the restore button requires
deliberately opening "recently deleted" and clicking a specific named
entry (not a bulk action or a stray click in a busy list), and the confirm
modal leads with the real consequence — *"Restoring makes `<title>` by
`<artist>` live on the public site again, immediately"* — rather than
burying it under the two honesty caveats that follow it (same register as
the delete modal):
- Restoring the row does not bring back copies already purged from
  someone's offline downloads before the restore (item 5).
- **The set's optimized artwork variants may not exist either, if a deploy
  happened while it was deleted.** `optimize-images.ts` (PR5) only
  processes sets it finds in the freshly-regenerated build-time snapshot,
  and writes into `public/images/uploads/` — gitignored, and NOT cached
  between deploys (checked `.github/workflows/deploy.yml`: only pnpm's
  dependency cache and the Playwright browser cache persist across runs),
  so it starts empty on every single deploy. If a deploy ran while this
  set was deleted, that deploy's build never saw it in the snapshot, so it
  never generated its variants — they simply don't exist in the currently-
  deployed static assets, restore or no restore. `Image.tsx`'s existing
  fallback (PR4 — falls back to the raw `artworkOriginalUrl` when the
  optimized `-1080.webp` 404s) is exactly the mechanism this relies on:
  the restored set renders correctly via the original image, not broken,
  just not yet responsive/optimized — until the next deploy's
  `optimize-images` run sees it in the snapshot again and regenerates
  them. Correct behavior, not a bug — worth stating plainly so it doesn't
  read as one the first time it happens. Doesn't apply to the 4 legacy
  sets, whose variants are committed to git, not gitignored.

**Manual verification for this feature**: delete a zero-play test set,
restore it, confirm it reappears in the sets list immediately and drops
off `RecentlyDeletedSets`; attempt a second restore on that same (now-
restored) entry, confirm the 404; delete a set, upload a new unrelated set
reusing that same id, then attempt restoring the original deletion,
confirming the 409 names the conflict rather than failing generically.

---

## Archiving Cloudflare RUM into D1 before it degrades (2026-08)

Cloudflare keeps Web Analytics beacon data exact for 7 days, then aggregates
it to roughly 10%. That's a property of the data's **age**, not of how wide a
query is — a distinction that cost a round of wrong reasoning here, because a
60-day query and a 7-day query returning different `sampleInterval`s looks
like the query width deciding it. It isn't: the older rows had already
degraded in place. Past a week the numbers stop being recoverable, so the
only way to keep an accurate long-run record is to copy each day out while
it's still exact.

Shipped as four separate reviewed steps: the `rum_daily` table, a standalone
Worker on a cron, the `visits_history` card reading D1, and the staleness
disclosure.

**Pages Functions cannot run cron** — only `onRequest*` handlers exist, so
`apps/admin` could not host the capture no matter how it was written. Hence
`apps/rum-archiver`, a standalone Worker with `crons = ["17 3 * * *"]`. It
was worth checking rather than assuming: the alternative design (a scheduled
GitHub Actions workflow) also carries a trap — **Actions disables a scheduled
workflow after 60 days without a commit**, and only a commit resets that
clock, so a quiet repo silently stops capturing.

Two Cloudflare API tokens, deliberately not one: the dashboard's needs
`Zone Analytics:Read` + `Account Analytics:Read`; the archiver's needs only
`Account Analytics:Read`, because its writes go through the D1 **binding**
rather than the API. Reusing one token would hand each job permissions it
has no use for.

**The upsert guard is the subtle part.** Each run re-fetches the trailing 7
days, so a day gets written repeatedly — and a late run can see a *degraded*
version of a day an earlier run captured exactly. Blind upsert would let the
worse copy overwrite the better one. Hence
`WHERE excluded.sample_interval <= rum_daily.sample_interval`: equal-quality
refreshes and degraded→exact upgrades both apply, exact→degraded doesn't.
Verified against in-memory SQLite rather than reasoned about, because it
fails silently and only in hindsight.

### Real zeros vs days nobody looked at

The history card's load-bearing distinction. A day with no row means one of
two completely different things: it was captured and genuinely had no
traffic, or no capture ever covered it. Rendering both as `0` would draw an
outage as a week of confident flat traffic — wrong in a way that looks
entirely normal.

So coverage is reconstructed as a **union of each run's trailing 7-day
window** (`coveredDays` in `apps/admin/app/data/rum-history.ts`), and only
days inside that union can be zero; the rest are `null`. `TrendChart` was
changed to take `(number | null)[]` for this — it previously couldn't express
a hole at all, and mapping unknown to 0 to fit the component would have been
the bug itself. Nulls paint as faint grey full-height bands and are excluded
from latest/peak/all-zero. Two captures a fortnight apart must leave the
middle uncovered; that case has a direct test, since the failure mode is
invisible until someone compares against Cloudflare months later.

**Cross-validation worth recording, not just "it passed":** the archiver's
first live capture and the independently written diagnostic script
(`apps/admin/scripts/diagnose-visits.mjs`) agreed to the unit — 11 visits, 23
page loads, 4 days carrying rows (Aug 7–10), 3 human rows and the single
Aug 9 bot row. Two separately authored query/aggregation paths landing on the
same numbers is the strongest evidence this integration has that the GraphQL
query, the bot split and the day bucketing are all right; a single path
agreeing with itself would have proved nothing.

### Coverage has to be recorded, not inferred — `rum_capture_runs`

The first version derived coverage from `SELECT DISTINCT captured_at FROM
rum_daily`, which was appealing because it needed no extra bookkeeping. It was
wrong, in exactly the shape this card exists to prevent, and it arrived through
the back door.

A run over a window with **no traffic** writes no rows — `captureWindow` treats
`rowsWritten: 0` as a valid outcome — so it leaves no `captured_at` and is
indistinguishable afterwards from a run that never happened. Reconstructed
against a healthy cron and a genuinely quiet week, seven observed days rendered
as seven "nobody looked" gaps. At this volume (single-digit daily visits, days
that are already zero) a quiet week is entirely plausible, not a thought
experiment.

Two more defects fell out of the same root: `lastCapturedAt` actually meant
"last run that *wrote a row*", so a quiet stretch would make the card assert the
cron had stopped; and `coveredDays` applied *today's* `RUM_UNSAMPLED_DAYS` to
every historical run, so changing that constant would retroactively rewrite what
past runs were claimed to have observed.

So the archiver now writes `rum_capture_runs` — one row per run, on every path,
including failures — and coverage is the union of the windows of runs where
`ok = 1`. The window is stored per run rather than recomputed. Backfilled from
the runs already evidenced by `rum_daily`, so the change preserved the existing
rendering exactly and left no dual-read path behind.

**Rejected alternatives:** a sentinel row in `rum_daily` (say `is_bot = -1`) to
carry a `captured_at` on empty windows — no new table, but it puts non-data in
the data table, every future reader needs a filter it can silently forget, and
it still can't record a failed run distinctly. And materialising explicit zero
rows for observed days — there's no `sample_interval` to claim for a row
Cloudflare never returned, it collides with the upsert guard, and the archive
stops being a faithful copy of the source.

**Staleness needs two signals, not one.** Logging failures and then collapsing
them back together at read time would waste the distinction. `lastRunAt` answers
*is the cron firing?*; `lastSuccessAt` answers *is it capturing anything?* A cron
that fires daily and fails every read is fresh by the first and stale by the
second — the exact scenario the warning exists for, and one that a single
"last run" figure would render as perfectly healthy. Conversely a single "last
successful capture" figure would render a quiet week as a dead cron. The card
warns on either being too old and **names which**, because "cron last ran today
but hasn't succeeded in 9 days" (check the token) and "cron hasn't run in 9 days"
(check the trigger) send you to completely different places.

The threshold is 8 days — one unsampled window plus a day of slack, since inside
the window a missed run costs nothing because the next one re-fetches it.

**It stays pull-only, deliberately.** Nothing pushes an alert; a stopped cron is
discovered by someone opening the dashboard. That's an accepted limit for an
internal page three people read, and the card says so in its own text rather than
leaving the reader to assume they'd be told. Both figures render
unconditionally — an earlier version showed the disclosure only when the archive
was fresh, hiding it at exactly the moment it mattered.

**Rejected:** stitching the archive and the live Cloudflare read into one
series. They have different provenance (D1 rows from a cron vs a live API
call) and one number spanning both would hide precisely the seam this
dashboard has repeatedly got wrong. Two cards, stated separately.

## Reference — key design decisions from the PWA work

### App-gated capability pattern (2026-07-17)

The recurring shape for "this capability lives in the installed app":
detect context → either enable the feature or convert interest into an
install with the right message per situation. Two instances exist
(save-for-offline; push opt-in). Build the NEXT one from these layers
instead of rediscovering them:

1. **Decision — `useSaveGate()`** (`hooks/useSaveGate.ts`). One hook, all
   inputs: hydration (`pending`), `isStandalone()` (`allow: true`),
   persisted `pwaInstalled` (`open-app`), `detectPlatform()` + stashed
   `beforeinstallprompt` (`needs-install` chromium/ios-safari +
   `canPrompt`), else `cannot-install`. Feature-agnostic despite the
   name.
2. **Action — `useTriggerInstallPrompt()`** (same file). Fires the native
   prompt, handles choice, clears the single-use event + stash, tracks
   `install_dismissed`. Shared by InstallCta + both modals.
3. **Guidance mechanics — `InstallInstructions.tsx`** (`ManualInstallHint`
   hedged Chromium copy — Opera field finding 2026-07-02 — and
   `IosInstallSteps`) **+ `TextButton`** for the mutual
   already-installed/not-installed escape hatches (which flip
   `pwaInstalled` WITHOUT closing, so the modal re-renders the corrected
   branch in place).
4. **Feature skin — a per-feature modal** (`SaveGateModal`,
   `PushOptInModal`) owning: lead copy per gate branch, close-time
   analytics + suppression semantics, and any feature-only variant
   (push's standalone subscribe phases). This layer is deliberately NOT
   generic — see the 2026-07-17 decision above; extract an
   `AppGateGuidance` branch-ladder component only when a third feature
   lands.
5. **Entry point — a CTA with feature-appropriate gating.** Three
   coexisting policies, all deliberate: always-visible user-initiated
   action (`SaveForOfflineButton` — taps always answer), passive nudge
   hidden after dismissal (`InstallCta`), passive nudge with a
   permission/subscription lifecycle + session-decline tier
   (`PushOptInCta`). Do not unify these; the divergence IS the design
   (uiSlice.ts documents the dismiss-semantic split).

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

### Retry-storm gate — centralized (M1, 2026-07-03)

One predicate, one resume writer, every play path:

- **Predicate:** `canFetchPlaybackBytes(trackId, offlineSets)` in
  `playerSlice.ts` — true when online, or standalone AND saved (the only
  context the SW serves IDB to). Exported, pure environment reads.
- **Funnel:** `resumePlayback()` is THE single gated "make paused audio
  play" action. Player-bar button, Space, lock-screen Media Session,
  waveform scrub-release, the isPlaying bridge effect, and `playTrack`'s
  same-track branch all delegate to it. The only other raw `audio.play()`
  is `playTrack`'s new-track start, behind the same predicate.
- **Feedback:** blocked → `playbackBlockedReason` set →
  `PlaybackErrorToast` (renders trackless since 2026-07-02). The Media
  Session handler additionally pins `mediaSession.playbackState = "paused"`
  on block so the lock screen can't show a lying "playing".
- **Pause is NEVER gated** — `audio.pause()` fetches nothing; blocking it
  would trap the user with a stalled stream.
- **No bridge loop:** a blocked resume sets `isPlaying: false`; element is
  paused; store and element agree; the bridge effect's next run takes
  neither branch.

The original TECH_DEBT 11 fix put this only in `playTrack` (tap-time); the
2026-07-02 review (M1) found five `audio.play()` writers bypassing it —
worst case, lock-screen resume offline re-spawned the retry storm.

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

### SW update flow — silent, on next cold start

The SW has NO `skipWaiting()` at all, and no update prompt. A new build
installs, sits in `waiting`, and activates via the lifecycle's own default:
once every client controlled by the old worker is gone, the waiting worker
takes over, so the next cold start runs the new version. Nothing is pushed
at a live session.

`clientsClaim()` stays in the SW. Its reason is first install only — there
is no previous worker and no old client running hashed chunks, so claiming
immediately is what makes offline capability live without a reload on the
very first visit. It is not an activation trigger: it runs *at* activate, so
for an update there is nothing stale left to claim by the time it fires.

**Why there is no prompt and no auto-reload.** The H2 entry above is the
history: an unconditional `skipWaiting()` activated a new worker mid-session,
pruned the running build's hashed chunks, and 404'd the old client's next
lazy route-load. It also cut off playback — a forced reload mid-set kills a
90-minute listen. The consent toast that replaced it was itself the wrong
shape: it interrupted the same session it was trying to protect, and its tap
handler had to tear down the audio stream (`releaseAudioStream`), re-resolve
a possibly-redundant worker, and carry a 2s fallback reload just to converge.
Removing the `SKIP_WAITING` message handler deletes the only path by which a
worker can activate over a live client, so H2's hazard is now impossible by
construction rather than avoided by policy.

**If you revisit this, do not "fix" it with an auto-reload.** A forced reload
is precisely what this design exists to prevent. Deferring the reload until
playback stops is the same trap wearing a hat — it still reloads a session
the user didn't ask to reload.

**Accepted trade-off, and what actually clears it.** A client that stays open
keeps running the old version, and there is now NO mechanism to push an
urgent fix to an open session. Mobile PWAs are the realistic worst case: a
backgrounded app can hold its client alive for days.

A plain reload does NOT pick up the new version. This is the counter-intuitive
part and the reason DevTools has an "Update on reload" checkbox at all: the
outgoing and incoming documents overlap, so the registration never drops to
zero clients and the waiting worker has no reason to activate. Measured
against two real production builds (v1 controlling, v2 deployed, same origin,
Chromium):

| action | outcome |
| --- | --- |
| plain reload, once | v2 installed but stuck in `waiting`; v1 still active |
| plain reload, twice | unchanged — v2 still `waiting` |
| hard reload (bypasses the SW for the navigation) | v2 activates |
| close every client, then reopen | v2 activates |

So, to force the new version:

- **Installed app / mobile — fully close it and reopen** (swipe it out of
  recents on Android). There is no hard-reload gesture in a standalone PWA;
  pull-to-refresh is a plain reload, which does nothing here. This is the
  instruction to give a user, because it's the one that holds everywhere.
- **Desktop browser — a hard reload (Cmd/Ctrl+Shift+R) is enough**, because
  it loads the document bypassing the SW, which releases the old worker.

Verified in Chromium only; iOS/Safari wasn't measured, which is a further
reason to lead with close-and-reopen. If an urgent client-side fix ever
genuinely needs to reach already-open sessions, that's a deliberate new
decision to make with these constraints in view — not a default to restore.

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
1. `git branch --show-current` — confirm which branch you're actually on.
   There is no single long-lived feature branch anymore; recent sessions
   have each worked on a short-lived `fix/*` / `docs/*` branch off `main`
   (see the branch-model note at the top of this file), and this repo has
   a history of sessions accidentally committing to the wrong branch — check
   before you assume.
2. `git log --oneline -10` on both that branch and `main` to confirm where
   HEAD is on each and what's already merged.
3. `git status` — any working-tree files from a partial change are
   recoverable; just read them.
4. Re-read the relevant TECH_DEBT entry (top-of-file glance section shows
   open vs resolved) and the file map above.
5. Continue from whichever file is incomplete.

Dev (`pnpm dev`, port 5173) does NOT serve the SW. All PWA / offline
testing is production-preview only:

```bash
pnpm --filter @form-at/web build
pnpm --filter @form-at/web start   # port 4173, real Chrome
```

The command is `pnpm start`, not `pnpm preview` (which doesn't exist).
