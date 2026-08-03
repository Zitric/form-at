import type { StateCreator } from "zustand";
import { type MusicSet, sets } from "~/data/sets";

// Admin set-upload feature, PR3 (2026-08): replaces the plain `import {
// sets }` most of the app used to read the catalogue synchronously. The
// catalogue is now a merged live-D1 + build-time-snapshot source (see
// packages/data/src/sets.ts's `mergeSets` and apps/web's
// `getAllSetsWithFallback`/`fetchAllSets`) — fetched over the network at
// boot, which can fail or simply not have resolved yet when other code
// wants an answer.
//
// `catalogueSets` starts as the bare snapshot (imported below — a plain,
// synchronous, zero-network array, always current as of the last deploy)
// and gets REPLACED by the live-merged result once the boot-time fetch in
// CatalogueSync.tsx succeeds. On failure, `catalogueSets` is left exactly as
// it was (see CatalogueSync's comment for why) — it never regresses to a
// worse state than whatever was already known.
//
// `catalogueReady` is the answer to "have we finished trying to learn the
// truth this session" — true once the boot fetch has settled (success,
// failure, or timeout), NEVER based on whether `catalogueSets` happens to be
// non-empty (the bare snapshot default is already non-empty, but that alone
// doesn't mean the live overlay has had its chance to load). This is the
// gate `reconcileFromIdb` (offlineSlice.ts) checks before ever treating "not
// found in the catalogue" as "removed, safe to purge the user's saved
// bytes" — seeing this flag `true` is offlineSlice's whole justification for
// treating an absence as real. Deliberately NOT persisted (see
// store/index.ts's partialize) — it must start false every session,
// regardless of what a previous session managed to confirm.
export type CatalogueSlice = {
  catalogueSets: MusicSet[];
  catalogueReady: boolean;
  setCatalogueSets: (sets: MusicSet[]) => void;
  markCatalogueReady: () => void;
};

export const createCatalogueSlice: StateCreator<CatalogueSlice, [], [], CatalogueSlice> = (
  set,
) => ({
  catalogueSets: sets,
  catalogueReady: false,
  setCatalogueSets: (newSets) => set({ catalogueSets: newSets }),
  markCatalogueReady: () => set({ catalogueReady: true }),
});

// `catalogueSets` is already the full live+snapshot merge (or the bare
// snapshot, pre-fetch/on failure) — this is a plain lookup, not a re-merge.
export function getCatalogueSet(catalogueSets: MusicSet[], id: string): MusicSet | undefined {
  return catalogueSets.find((s) => s.id === id);
}

// Shared by Player.tsx (render-time prev/next) and useAudioPlayer.ts (Media
// Session prev/next handlers + auto-advance on track end) — same
// findIndex-then-neighbor logic, previously duplicated across both files
// against the plain static `sets` array.
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
