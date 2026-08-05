import { type MusicSet, sets } from "@form-at/data/sets";
import type { StateCreator } from "zustand";

// The app's read path for the sets catalogue, in place of a plain
// `import { sets }` synchronous read. The catalogue is a merged live-D1 +
// build-time-snapshot source (see packages/data/src/sets.ts's `mergeSets` and
// apps/web's `getAllSetsWithFallback`/`fetchAllSets`) — fetched over the
// network at boot, which can fail or simply not have resolved yet when other
// code wants an answer.
//
// `catalogueSets` starts as the bare snapshot (imported below — a plain,
// synchronous, zero-network array, always current as of the last deploy)
// and gets REPLACED by the live-merged result once the boot-time fetch in
// CatalogueSync.tsx succeeds. On failure, `catalogueSets` is left exactly as
// it was (see CatalogueSync's comment for why) — it never regresses to a
// worse state than whatever was already known.
//
// `catalogueReady` and `catalogueConfirmed` answer two DIFFERENT questions,
// and conflating them is a real bug (see below). Both are
// deliberately NOT persisted (see store/index.ts's partialize) — they must
// start false every session, regardless of what a previous session managed
// to learn.
//
// `catalogueReady` — "have we finished TRYING to learn the truth this
// session" — true once the boot fetch has settled, for ANY reason: success,
// failure, OR an 8s timeout (see CatalogueSync.tsx). This only answers "can
// we stop waiting and do something," not "is it safe to conclude an absence
// is real." NEVER based on whether `catalogueSets` happens to be non-empty
// (the bare snapshot default is already non-empty, but that alone doesn't
// mean the live overlay has had its chance to load).
//
// `catalogueConfirmed` — "did we actually SUCCEED in learning the true,
// complete catalogue this session" — true ONLY on a successful live fetch,
// never on failure or timeout. This is the gate `reconcileFromIdb`
// (offlineSlice.ts) checks before ever treating "not found in the
// catalogue" as "removed, safe to purge the user's saved bytes" for an id
// that isn't in `catalogueSets` at all.
//
// Why the split is load-bearing, and why the two must never be collapsed:
// gating a destructive purge on `catalogueReady` alone is wrong, because
// `catalogueReady` goes true on a FAILED fetch too (e.g. booting offline) —
// at that point `catalogueSets` is whatever was already known (persisted, or
// the bare snapshot), which is NOT confirmed complete. A set uploaded since
// the last deploy, genuinely saved by this user, on a device whose persisted
// `catalogueSets` was cleared, is missing from that catalogue for a reason
// that has nothing to do with removal — and purging on that basis
// permanently deletes its real IDB bytes. `catalogueConfirmed` is the
// guarantee the destructive branch actually needs; `catalogueReady` remains
// correct for anything that only needs "the boot fetch is done, one way or
// another" (e.g. gating when reconciliation's non-destructive work runs at
// all).
//
// The wiring carries a matching constraint: `markCatalogueConfirmed()` is
// only ever safe to call from a caller that can actually tell "a live D1 read
// succeeded" apart from "some fallback got substituted." The swallowing
// `fetchAllSets` cannot — it resolves successfully with the bare snapshot
// both when there's no D1 binding at all (plain local `pnpm dev`) and when
// the live D1 query throws server-side, and neither of those is a network
// failure the client can see, so a plain `.then()` can't tell them apart from
// a genuine merged result. So `CatalogueSync.tsx` uses
// `fetchAllSetsLive`/`getAllSetsLive` (apps/web/app/data/sets.ts), the
// non-swallowing sibling that rejects instead of substituting. See that
// file's comment.
export type CatalogueSlice = {
  catalogueSets: MusicSet[];
  catalogueReady: boolean;
  catalogueConfirmed: boolean;
  setCatalogueSets: (sets: MusicSet[]) => void;
  markCatalogueReady: () => void;
  markCatalogueConfirmed: () => void;
};

export const createCatalogueSlice: StateCreator<CatalogueSlice, [], [], CatalogueSlice> = (
  set,
) => ({
  catalogueSets: sets,
  catalogueReady: false,
  catalogueConfirmed: false,
  setCatalogueSets: (newSets) => set({ catalogueSets: newSets }),
  markCatalogueReady: () => set({ catalogueReady: true }),
  markCatalogueConfirmed: () => set({ catalogueConfirmed: true }),
});

// `catalogueSets` is already the full live+snapshot merge (or the bare
// snapshot, pre-fetch/on failure) — this is a plain lookup, not a re-merge.
export function getCatalogueSet(catalogueSets: MusicSet[], id: string): MusicSet | undefined {
  return catalogueSets.find((s) => s.id === id);
}

// Shared by Player.tsx (render-time prev/next) and useAudioPlayer.ts (Media
// Session prev/next handlers + auto-advance on track end) — one copy of the
// findIndex-then-neighbor logic rather than one per caller.
export function getAdjacentSets(
  catalogueSets: MusicSet[],
  currentId: string | undefined,
): { prev: MusicSet | null; next: MusicSet | null } {
  if (!currentId) return { prev: null, next: null };
  const i = catalogueSets.findIndex((s) => s.id === currentId);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? (catalogueSets[i - 1] ?? null) : null,
    next: i < catalogueSets.length - 1 ? (catalogueSets[i + 1] ?? null) : null,
  };
}
