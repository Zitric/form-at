import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { sets } from "~/data/sets";
import { type CatalogueSlice, createCatalogueSlice } from "~/store/catalogueSlice";
import {
  type OfflineSlice,
  classifyDownloadFailure,
  createOfflineSlice,
} from "~/store/offlineSlice";

// M2 + M4 (2026-07-02 review): quota-shaped failures must surface as
// "quota" (retrying can't fix them), and a missing
// `navigator.storage.estimate` must skip the pre-flight instead of blowing
// up into a bogus "network" failure.

describe("classifyDownloadFailure", () => {
  it("maps AbortError to aborted", () => {
    expect(classifyDownloadFailure(new DOMException("x", "AbortError"))).toBe("aborted");
  });

  it("maps QuotaExceededError (IDB write ran out of disk) to quota", () => {
    expect(classifyDownloadFailure(new DOMException("x", "QuotaExceededError"))).toBe("quota");
  });

  it("maps RangeError (large buffer preallocation failed) to quota", () => {
    expect(classifyDownloadFailure(new RangeError("Array buffer allocation failed"))).toBe("quota");
  });

  it("maps everything else to network", () => {
    expect(classifyDownloadFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyDownloadFailure(new Error("HTTP 500"))).toBe("network");
    expect(classifyDownloadFailure("weird throw")).toBe("network");
  });
});

describe("startDownload quota pre-flight", () => {
  const testSet = sets.find((s) => s.sizeBytes !== undefined);
  if (!testSet) throw new Error("test needs a catalogue set with sizeBytes");

  // Composes CatalogueSlice alongside OfflineSlice (PR3) — `startDownload`
  // resolves the target set via `getCatalogueSet(get().catalogueSets, ...)`
  // now, so an isolated OfflineSlice-only store would find no set at all.
  // The default `catalogueSets` (the bare snapshot) already contains `sets`,
  // so no extra seeding is needed beyond composing the slice.
  const makeStore = () =>
    create<OfflineSlice & CatalogueSlice>()((...a) => ({
      ...createOfflineSlice(...a),
      ...createCatalogueSlice(...a),
    }));

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips the pre-flight when estimate is unavailable and reaches the fetch (M4)", async () => {
    // jsdom exposes no navigator.storage — exactly the environment M4
    // guards. The stubbed fetch rejection proves control flow got PAST the
    // pre-flight instead of crashing on `navigator.storage.estimate`.
    expect(navigator.storage?.estimate).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const store = makeStore();
    await store.getState().startDownload(testSet.id);

    expect(store.getState().offlineSets[testSet.id]).toMatchObject({
      status: "failed",
      reason: "network",
    });
  });

  it("fails as quota with a measured shortfall when estimate reports no room", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      storage: { estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 900 }) },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const store = makeStore();
    await store.getState().startDownload(testSet.id);

    const state = store.getState().offlineSets[testSet.id];
    expect(state).toMatchObject({ status: "failed", reason: "quota" });
    expect(state?.status === "failed" ? state.quotaShortfallBytes : undefined).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
