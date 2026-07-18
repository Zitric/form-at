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
lands directly on "setting up notifications…" → success copy, still no
native dialog → `SELECT endpoint FROM push_subscriptions` now shows TWO
rows (the other device's plus this one's). Also confirms whether live
permission read `"granted"` (direct subscribe, as expected) or
`"default"` (soft prompt shown first) — note which, to settle the
inference above.

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

Three of the four original items here shipped weeks ago and are removed
from this list (verified against code + git log while cleaning up this doc,
2026-07-06): toast redesign (`935ebb4`, `4c978b2` — no brackets on message
text, whole-surface click-to-dismiss, `[ x ]` kept only where the toast
persists); web-offline message unification (`playerSlice.ts:73` —
`tab-offline-needs-network` is already the single reason for every tab
offline-block, regardless of downloaded-or-not); SaveGateModal escape
hatches (`SaveGateModal.tsx:64-75` — `handleAlreadyInstalled` /
`handleNotInstalledAfterAll` confirmed NOT calling `onClose`). One item
remains, re-scoped per 2026-07-06 field testing to separate it cleanly from
a DIFFERENT, already-fixed bug:

- **Set card abstraction — DJ page card vs `/sets/` card unification.** The
  set list on `/sets/` and the "played by this DJ" list on `/djs/$djId`
  render similar cards via two different component paths, and they've
  drifted: `/sets/index.tsx:116` renders `SaveForOfflineIconButton` in the
  action slot; `djs/$djId.tsx:129-130` only renders `ShareIconButton` +
  `CirclePlayButton` — no save-for-offline icon on the DJ page at all
  (field-confirmed 2026-07-06). Consolidating into one reusable `SetCard`
  component would prevent this kind of per-surface drift going forward.
  Needs its own plan (props shape, action-slot semantics, artwork variant
  selection) before implementation.

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

### SW update flow — user-consented skipWaiting (2026-07-02, H2)

The SW has NO unconditional `skipWaiting()`. Pattern:

1. New build installs → sits in `waiting` (old clients keep their precache,
   so their lazy route chunks stay servable).
2. `useSwUpdate` detects it (both `registration.waiting` at mount and
   `updatefound` → `statechange` while open; "installed + has controller"
   distinguishes an update from a first install).
3. `UpdateToast` shows "new version ready [ update ]" — deferred while a
   set download is in flight.
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
