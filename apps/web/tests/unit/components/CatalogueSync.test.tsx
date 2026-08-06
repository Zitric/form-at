import { sets as staticSnapshot } from "@form-at/data/sets";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogueSync } from "~/components/CatalogueSync";
import { useStore } from "~/store";

// Covers the WIRING between CatalogueSync and the data layer, not
// catalogueSlice.ts's flags themselves: seeding `catalogueConfirmed` directly
// would never exercise how the flag actually gets set.
// `getAllSetsWithFallback`/`fetchAllSets`
// resolve successfully with the bare snapshot on both "no D1 binding" and
// "the live query threw," which is indistinguishable from a genuine live
// result to a plain `.then()`. These tests mock `fetchAllSetsLive` (the
// non-swallowing sibling CatalogueSync now calls) directly, so they exercise
// the real success/failure signal this component depends on.

vi.mock("~/data/sets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/data/sets")>();
  return {
    ...actual,
    fetchAllSetsLive: vi.fn(),
  };
});

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  useStore.setState({
    catalogueSets: staticSnapshot,
    catalogueReady: false,
    catalogueConfirmed: false,
  });
  await useStore.persist.rehydrate();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CatalogueSync", () => {
  it("marks the catalogue confirmed and adopts the live result on a genuine live success", async () => {
    const { fetchAllSetsLive } = await import("~/data/sets");
    const live = [
      { id: "set-999-live", title: "Live", artist: "Live Artist", date: "2026-09-01", src: "s" },
    ];
    vi.mocked(fetchAllSetsLive).mockResolvedValue(live);

    render(<CatalogueSync />);
    await flushMicrotasks();

    expect(useStore.getState().catalogueSets).toEqual(live);
    expect(useStore.getState().catalogueConfirmed).toBe(true);
    expect(useStore.getState().catalogueReady).toBe(true);
  });

  // This is the exact scenario the wiring bug reached production through:
  // no D1 binding at all (plain local `pnpm dev`) or a server-side D1
  // outage. `getAllSetsWithFallback`/`fetchAllSets` would have resolved
  // successfully with the bare snapshot in this case; `fetchAllSetsLive`
  // must instead reject, and this component must NOT confirm the catalogue.
  it("does NOT mark the catalogue confirmed when the live fetch rejects (no D1 binding / D1 outage)", async () => {
    const { fetchAllSetsLive } = await import("~/data/sets");
    vi.mocked(fetchAllSetsLive).mockRejectedValue(new Error("NO_D1_BINDING"));

    render(<CatalogueSync />);
    await flushMicrotasks();

    expect(useStore.getState().catalogueSets).toEqual(staticSnapshot);
    expect(useStore.getState().catalogueConfirmed).toBe(false);
    expect(useStore.getState().catalogueReady).toBe(true);
  });

  it("leaves catalogueSets untouched (does not regress to the fallback) on rejection, even with different persisted data", async () => {
    const persistedFromBefore = [
      { id: "set-999-persisted", title: "P", artist: "P Artist", date: "2026-08-01", src: "s" },
    ];
    useStore.setState({ catalogueSets: persistedFromBefore });
    const { fetchAllSetsLive } = await import("~/data/sets");
    vi.mocked(fetchAllSetsLive).mockRejectedValue(new Error("network down"));

    render(<CatalogueSync />);
    await flushMicrotasks();

    expect(useStore.getState().catalogueSets).toEqual(persistedFromBefore);
    expect(useStore.getState().catalogueConfirmed).toBe(false);
  });
});
