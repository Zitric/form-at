import { beforeEach, describe, expect, it } from "vitest";
import { sets } from "~/data/sets";
import { useStore } from "~/store";

// Regression tests for the first-visit hydration failure (2026-07-02 Android
// field testing). zustand v5's persist calls `merge(undefined, current)` when
// the storage key doesn't exist yet — a true first visit. A merge that
// destructures its first argument unconditionally throws, persist swallows
// the error in its own .catch, `hasHydrated` never flips, and every surface
// gated on `useStoreHydrated()` (InstallCta, save-for-offline buttons,
// OfflineReconciler) stays hidden for the entire session.
//
// Relies on tests/setup.ts replacing Node 25's broken `localStorage` global
// with a working in-memory Storage — that's what lets persist's read/write
// path actually run under vitest at all.

describe("persist rehydration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("completes on a true first visit (no storage key)", async () => {
    await useStore.persist.rehydrate();
    expect(useStore.persist.hasHydrated()).toBe(true);
  });

  it("completes and restores state from a seeded storage key", async () => {
    const seeded = sets[0];
    if (!seeded) throw new Error("test needs at least one set in the catalogue");
    localStorage.setItem(
      "format-player",
      JSON.stringify({
        state: {
          nowPlayingId: seeded.id,
          positions: { [seeded.id]: 42 },
          peaksCache: {},
          durations: {},
          pwaInstalled: true,
          pwaInstallDismissed: false,
          offlineSets: {},
          hasRequestedPersist: false,
        },
        version: 0,
      }),
    );
    await useStore.persist.rehydrate();
    expect(useStore.persist.hasHydrated()).toBe(true);
    expect(useStore.getState().nowPlaying?.id).toBe(seeded.id);
    expect(useStore.getState().positions[seeded.id]).toBe(42);
    expect(useStore.getState().pwaInstalled).toBe(true);
  });
});
