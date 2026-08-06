import { type MusicSet, sets } from "@form-at/data/sets";
import type { StateCreator } from "zustand";

// The app's read path for the sets catalogue: `catalogueSets` starts as the
// build-time snapshot and is replaced by the live-merged D1 result once
// CatalogueSync's boot fetch succeeds. On failure it's left as-is, never
// regressing to something worse than what was already known.
//
// Two readiness flags, deliberately not one:
//   catalogueReady     — the boot fetch SETTLED (success, failure, or timeout)
//   catalogueConfirmed — the boot fetch SUCCEEDED
//
// Never collapse them, and never gate a destructive purge on `catalogueReady`:
// it's true after a failed offline boot, where `catalogueSets` can be missing
// sets the user genuinely saved, and purging on that basis deletes real IDB
// bytes. Never infer either flag from `catalogueSets` being non-empty — the
// snapshot default is already non-empty. Neither is persisted (store/index.ts's
// partialize); both must start false every session.
// Full rationale: PWA_PROGRESS.md's PR3 entry.
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
