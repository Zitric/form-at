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
| 4 — List-card download icon | not started | — | Optional polish; reuses the 3c slice + button infra |
| 4.5 — Beacon queue (Background Sync) | deferred — polish | TECH_DEBT 4 | Independent infra, lower stakes |

---

## What's actually left

Engineering-wise, the branch is shippable. Items below are the punch list:

### Higher-impact polish (consider before PR to main)

- **Phase 4 polish** (TECH_DEBT 7) — visual pass on `offline.html` (currently
  functional-minimal). Zero-bundle constraint applies.
- **Manage offline sets view** — list of saved sets with remove + storage
  totals. The slice + `removeOfflineSet` are already wired in 3c; this is
  pure UI. Would also enable proper artwork-v1 union-prune cleanup
  (TECH_DEBT 16).
- **List-card download icon** (chunk 4) — a save indicator on `/sets/`
  cards so users can save without opening the detail page. Cheap with the
  existing infra.

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
- **TECH_DEBT 16** — orphan artwork in `artwork-v1` after `removeOfflineSet`.
  Intentional; revisit when the manage-offline view ships.

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

### Install gating

The `save_for_offline` flow requires `pwaInstalled === true` before download
fires. Capable-but-not-installed branches always open `InstallPromptModal`.
Reason: iOS WebKit's 7-day ITP eviction rule — standalone PWAs are exempt,
plain Safari tabs aren't. An in-tab download would evaporate after ~7 days
of no visits, breaking the feature's promise.

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
