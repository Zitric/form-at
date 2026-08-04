import { sets } from "@form-at/data/sets";
import { beforeEach, describe, expect, it } from "vitest";
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
    // merge() falls back to `current.catalogueSets` when a payload omits the
    // field — reset to the bare snapshot so an earlier test's seeded value
    // can't leak into a later test via the shared store singleton.
    useStore.setState({ catalogueSets: sets });
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

  // Push opt-in dismissal (Phase 2, 2026-07-15) — same "soft dismiss, hide
  // forever" persistence as pwaInstallDismissed above, mirrored not reused
  // (see uiSlice.ts). Locks both directions: an absent key defaults to
  // false (pre-Phase-2 storage / a cached client mid-rollout), and a seeded
  // `true` survives the round trip so a "not now" is actually remembered.
  it("defaults pushOptInDismissed to false when absent from a seeded key (pre-Phase-2 storage)", async () => {
    localStorage.setItem(
      "format-player",
      JSON.stringify({
        state: {
          nowPlayingId: null,
          positions: {},
          peaksCache: {},
          durations: {},
          pwaInstalled: false,
          pwaInstallDismissed: false,
          offlineSets: {},
          hasRequestedPersist: false,
        },
        version: 0,
      }),
    );
    await useStore.persist.rehydrate();
    expect(useStore.getState().pushOptInDismissed).toBe(false);
  });

  it("restores a seeded pushOptInDismissed: true", async () => {
    localStorage.setItem(
      "format-player",
      JSON.stringify({
        state: {
          nowPlayingId: null,
          positions: {},
          peaksCache: {},
          durations: {},
          pwaInstalled: false,
          pwaInstallDismissed: false,
          pushOptInDismissed: true,
          offlineSets: {},
          hasRequestedPersist: false,
        },
        version: 0,
      }),
    );
    await useStore.persist.rehydrate();
    expect(useStore.getState().pushOptInDismissed).toBe(true);
  });

  // Admin set-upload feature (PR3) — catalogueSlice persist/hydrate.
  describe("catalogueSlice", () => {
    it("restores catalogueSets from a seeded payload", async () => {
      const uploadedSet = {
        id: "set-999-persisted",
        title: "Form:at 999",
        artist: "Persisted Artist",
        date: "2026-09-01",
        venue: null,
        description: null,
        duration: null,
        src: "https://cdn.formatglasgow.com/sets/set-999-persisted/audio.mp3",
        artwork: null,
        peaks: null,
        sizeBytes: undefined,
      };
      localStorage.setItem(
        "format-player",
        JSON.stringify({
          state: {
            nowPlayingId: null,
            positions: {},
            peaksCache: {},
            durations: {},
            pwaInstalled: false,
            pwaInstallDismissed: false,
            pushOptInDismissed: false,
            offlineSets: {},
            hasRequestedPersist: false,
            catalogueSets: [uploadedSet],
          },
          version: 0,
        }),
      );
      await useStore.persist.rehydrate();
      expect(useStore.getState().catalogueSets).toEqual([uploadedSet]);
    });

    it("falls back to the bare snapshot when catalogueSets is absent (pre-PR3 payload)", async () => {
      localStorage.setItem(
        "format-player",
        JSON.stringify({
          state: {
            nowPlayingId: null,
            positions: {},
            peaksCache: {},
            durations: {},
            pwaInstalled: false,
            pwaInstallDismissed: false,
            pushOptInDismissed: false,
            offlineSets: {},
            hasRequestedPersist: false,
          },
          version: 0,
        }),
      );
      await useStore.persist.rehydrate();
      expect(useStore.getState().catalogueSets).toEqual(sets);
    });

    it("always starts catalogueReady false, even against a maliciously/stale-seeded true", async () => {
      localStorage.setItem(
        "format-player",
        JSON.stringify({
          state: {
            nowPlayingId: null,
            positions: {},
            peaksCache: {},
            durations: {},
            pwaInstalled: false,
            pwaInstallDismissed: false,
            pushOptInDismissed: false,
            offlineSets: {},
            hasRequestedPersist: false,
            catalogueSets: sets,
            catalogueReady: true,
          },
          version: 0,
        }),
      );
      await useStore.persist.rehydrate();
      expect(useStore.getState().catalogueReady).toBe(false);
    });

    // Same defensive assertion for `catalogueConfirmed` — the flag
    // `reconcileFromIdb`'s destructive purge actually gates on (see
    // catalogueSlice.ts). A stale/malicious `true` here would be far worse
    // than for `catalogueReady`: it's the one thing standing between an
    // offline boot and permanently deleting a user's saved sets.
    it("always starts catalogueConfirmed false, even against a maliciously/stale-seeded true", async () => {
      localStorage.setItem(
        "format-player",
        JSON.stringify({
          state: {
            nowPlayingId: null,
            positions: {},
            peaksCache: {},
            durations: {},
            pwaInstalled: false,
            pwaInstallDismissed: false,
            pushOptInDismissed: false,
            offlineSets: {},
            hasRequestedPersist: false,
            catalogueSets: sets,
            catalogueConfirmed: true,
          },
          version: 0,
        }),
      );
      await useStore.persist.rehydrate();
      expect(useStore.getState().catalogueConfirmed).toBe(false);
    });
  });
});
