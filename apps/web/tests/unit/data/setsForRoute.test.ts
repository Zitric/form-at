import { sets as staticSnapshot } from "@form-at/data/sets";
import { describe, expect, it, vi } from "vitest";
import { fetchAllSetsForRoute, fetchSetForRoute } from "~/data/setsForRoute";

// PR2 blocking fix (2026-08): fetchAllSets/fetchSetForDetailPage are
// createServerFn calls — offline, the network request they make to the
// server rejects BEFORE the server ever runs, so getAllSetsWithFallback/
// getSetByIdWithFallback's D1-error → snapshot catch (tested in
// tests/unit/data/sets.test.ts) never gets a chance to apply. This is the
// client-side half of the same guarantee, and the thing that was actually
// missing — mocking `~/data/sets` (not `@form-at/data/sets`) so the mock
// really intercepts the network-call layer these two wrappers sit on top of.

vi.mock("~/data/sets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/data/sets")>();
  return {
    ...actual,
    fetchAllSets: vi.fn(),
    fetchSetForDetailPage: vi.fn(),
  };
});

describe("fetchAllSetsForRoute", () => {
  it("returns the live result when fetchAllSets resolves", async () => {
    const { fetchAllSets } = await import("~/data/sets");
    const live = [{ id: "set-999", title: "t", artist: "a", date: "2026-01-01", src: "s" }];
    vi.mocked(fetchAllSets).mockResolvedValue(live);

    expect(await fetchAllSetsForRoute()).toEqual(live);
  });

  it("falls back to the static snapshot when fetchAllSets's network call rejects (offline)", async () => {
    const { fetchAllSets } = await import("~/data/sets");
    vi.mocked(fetchAllSets).mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await fetchAllSetsForRoute()).toEqual(staticSnapshot);
  });
});

describe("fetchSetForRoute", () => {
  it("returns the live result when fetchSetForDetailPage resolves", async () => {
    const { fetchSetForDetailPage } = await import("~/data/sets");
    const live = { id: "set-999", title: "t", artist: "a", date: "2026-01-01", src: "s" };
    vi.mocked(fetchSetForDetailPage).mockResolvedValue(live);

    expect(await fetchSetForRoute("set-999")).toEqual(live);
  });

  it("falls back to the static snapshot lookup when fetchSetForDetailPage's network call rejects", async () => {
    const { fetchSetForDetailPage } = await import("~/data/sets");
    vi.mocked(fetchSetForDetailPage).mockRejectedValue(new TypeError("Failed to fetch"));
    const staticSet = staticSnapshot[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");

    expect(await fetchSetForRoute(staticSet.id)).toEqual(staticSet);
  });

  it("returns null (not throw) when the network call rejects and the id isn't in the snapshot either", async () => {
    const { fetchSetForDetailPage } = await import("~/data/sets");
    vi.mocked(fetchSetForDetailPage).mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await fetchSetForRoute("totally-unknown-id")).toBeNull();
  });
});
