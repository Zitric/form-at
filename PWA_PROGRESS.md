# Phase 4 — PWA / Offline progress

Session-resumption note. If a session breaks mid-implementation, read this + the
relevant TECH_DEBT entries + the last commit on `transform-the-web-app-in-a-pwa`
and you have everything needed to continue.

Authoritative reference for design decisions: `IMPROVEMENTS.md` (product), this
file (engineering state), `TECH_DEBT.md` items 4–13 (engineering follow-ups).

---

## Phase 4 chunks — status

| Chunk | Status | Commit / location | Notes |
|-------|--------|-------------------|-------|
| 1 — SWR navigations + offline fallback | ✅ committed | `1d76211` | pages-v1 SWR + offline.html + activate cache-clear |
| 1.5 — Offline navigation cache | deferred — polish | TECH_DEBT 6 | Direct reload works offline already; only click-nav is broken. Audio chunks took priority. |
| 2 — Artwork runtime SWR | ✅ committed | `aa6f9f9` + paperwork `3cd1dd3` | artwork-v1 SWR, unbounded (TECH_DEBT 8) |
| 3a — Audio read-path SW handler | ✅ committed | `335f29d` | workbox-range-requests, R2 hostname matcher, originally Cache Storage |
| 3b — IDB-backed audio download + offline slice | ✅ committed | `b428c58` + paperwork `f62343c` | idb dep, offline-audio.ts wrapper, offlineSlice, OfflineReconciler, sw.ts swapped to IDB read |
| 3c — UI: button state machine + retry-storm gate + size hint | 🔨 implementing | this session | See "3c decisions" below |
| 4 — List-card download icon | not started | — | Will reuse the 3c slice + button infra |
| 4.5 — Beacon queue (Background Sync) | deferred — polish | TECH_DEBT 4 | Independent infra, lower stakes |
| Phase 4 polish | not started | — | Manage offline sets view, new-build toast, iOS heartbeat, offline.html polish (TECH_DEBT 7) |

---

## 3c decisions (locked 2026-06-27)

**Q1 — Install gates download.** Capability must be `installed` before the button triggers download. Capable-but-not-installed branches always open `InstallPromptModal`. Decision driven by iOS WebKit's 7-day ITP eviction rule: standalone PWAs are exempt, plain Safari tabs are NOT. An in-tab download would evaporate after ~7 days of no visits, breaking the feature's promise. Sources cited in conversation; canonical WebKit refs are [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/) and [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/).

**Q2 — Cancel UX.** `CancelDownloadModal` — small confirm modal using existing `Modal` shell. `[ cancel ]` and `[ keep downloading ]` actions.

**Q3 — Saved tap.** `SavedManageModal` — small modal with `[ remove from library ]` action. Ships in 3c (not deferred) to give `removeOfflineSet` UI coverage and provide save/un-save symmetry. The full "Manage offline sets" list view stays Phase 4 polish.

**Q4 — Quota copy.** Shortfall framing: `[ ✗ need NNMB more ]`, derived from `state.quotaShortfallBytes`. More actionable than the "required total" framing.

**Q5 — `sizeBytes` hint.** Optional `sizeBytes?: number` field on `MusicSet` in `apps/web/app/data/sets.ts`. Pre-populated for all four existing sets at chunk-3c launch from real HEAD `Content-Length`. Display-only hint for the not-saved label (`[ save_for_offline · 104MB ]`); HEAD at download time remains source of truth for quota pre-flight.

**Q6 — Retry-storm gate.** Lives in `playerSlice.playTrack` before `audio.src` is set: if `!navigator.onLine && offlineSetState !== "saved"`, refuse to attach src + surface via extended `PlaybackErrorToast` (new `playbackBlockedReason: "not-saved-offline"` field). Fixes the TECH_DEBT-11 retry storm at its source — `<audio>` never gets a source it can't fetch.

---

## File map for 3c

NEW:
- `apps/web/app/components/CancelDownloadModal.tsx`
- `apps/web/app/components/QuotaInfoModal.tsx`
- `apps/web/app/components/SavedManageModal.tsx`
- `apps/web/app/utils/fmt.ts` (extend or create — `formatBytes(n)` helper)

MODIFIED:
- `apps/web/app/components/SaveForOfflineButton.tsx` — full state-machine rewrite
- `apps/web/app/components/InstallPromptModal.tsx` — remove `installed` branch, refine iOS copy to communicate the 7-day-eviction rationale
- `apps/web/app/data/sets.ts` — add `sizeBytes?` to `MusicSet`, populate 4 sets
- `apps/web/app/store/playerSlice.ts` — `playbackBlockedReason` field + gate
- `apps/web/app/components/player/PlaybackErrorToast.tsx` — branch on `playbackBlockedReason`

---

## 9-step verification plan (3b + 3c together, real UI, after build)

Pre-state: clear site data, fresh SW, online.

1. Install path (capable, not installed) — button shows `[ save_for_offline ]`; tap → `InstallPromptModal` (no "coming soon" branch); install.
2. Download path (installed, online) — button `[ save_for_offline · 104MB ]`; tap → progresses `[ downloading · NN% ]` → `[ saved · 104MB ]`; IDB has 2 entries for the set (proves 3b's Q3b-1 transaction-commit through real UI).
3. Offline playback — Network → Offline, reload, `play_set` plays from IDB; seek mid-track → 206 Partial Content.
4. Retry-storm gate — offline, visit an unsaved set, tap `play_set`; `[ ✗ not saved for offline listening ]` toast; ZERO `net::ERR_FAILED` in Network panel.
5. Cancel — mid-download, tap `[ downloading · NN% ]`; `CancelDownloadModal`; confirm; state → `not-saved`, no partial IDB.
6. Single-concurrency — start download on set A, tap save on set B → toast "one download at a time".
7. Quota fail — monkey-patch `navigator.storage.estimate` to return tight quota; tap save → `failed/quota`; button `[ ✗ need NNMB more ]`; tap → `QuotaInfoModal`.
8. Reconciliation paths — (a) saved → reload → still saved; (b) delete IDB entries → reload → `[ ↻ re-save · was 104MB ]`; (c) clear localStorage only → reconciliation adopts orphan as saved.
9. Remove — tap `[ saved · 104MB ]` → `SavedManageModal` → tap remove → state → `not-saved`, IDB cleared.

All nine pass → commits.

---

## Pending TECH_DEBT items relevant to this work

- **6** — Chunk 1.5 offline navigation (polish, not blocker; reload works offline)
- **7** — Polish offline.html (visual pass, zero-bundle constraint)
- **8** — artwork-v1 cache bounds (add workbox-expiration only if pressure observed)
- **11** — Audio retry storm UX gate — **RESOLVED by 3c**, will close out in 3c commit notes
- **12** — Audio download memory peak — iOS validation pass when device access exists
- **13** — Orphan offline entries (auto-purge live in 3b; revisit if `sets.ts` ever gains "archived" status)

---

## How to resume mid-3c

If this session breaks:
1. `git log --oneline -10` to confirm chunk-3b commit is still at HEAD.
2. `git status` — any working-tree files from a partial 3c are recoverable; just read them.
3. Re-read this file's "3c decisions" + "File map for 3c" sections — all design calls are locked, no rework.
4. Continue from whichever file is incomplete.

The 9-step verification is the hand-off gate. Don't commit until Julian verifies through the real UI.
