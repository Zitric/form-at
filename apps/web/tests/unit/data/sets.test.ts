import { sets as staticSnapshot } from "@form-at/data/sets";
import { describe, expect, it } from "vitest";
import { getAllSetsWithFallback, getSetByIdWithFallback } from "~/data/sets";

// Admin set-upload feature, PR2 (2026-08): the D1-error → snapshot-only
// fallback is the specific thing this PR's plan review flagged as needing a
// test ("simulate D1 failure → snapshot-only render"). createServerFn's own
// wrapping can't be invoked directly in a plain unit test, so the fallback
// logic lives in these two plain functions instead (see ~/data/sets.ts) —
// tested here with a fake D1, same pattern as packages/data/tests/unit/sets.test.ts.

type FakeRoute = { match: RegExp; all?: unknown[]; first?: unknown; throws?: boolean };

function createFakeD1(routes: FakeRoute[]): D1Database {
  return {
    prepare: (sql: string) => {
      const route = routes.find((r) => r.match.test(sql));
      if (!route) throw new Error(`No fake D1 route matched SQL:\n${sql}`);
      const statement = {
        bind: () => statement,
        first: async <T>() => {
          if (route.throws) throw new Error("simulated D1 failure");
          return (route.first ?? null) as T | null;
        },
        all: async <T>() => {
          if (route.throws) throw new Error("simulated D1 failure");
          return { results: (route.all ?? []) as T[] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe("getAllSetsWithFallback", () => {
  it("returns the snapshot alone when there's no D1 binding at all (local dev)", async () => {
    expect(await getAllSetsWithFallback(undefined)).toEqual(staticSnapshot);
  });

  it("merges a live D1 result with the snapshot when D1 is reachable", async () => {
    const uploaded = {
      id: "set-999-new",
      title: "Form:at 999",
      artist: "New Artist",
      date: "2026-09-01",
      venue: null,
      description: null,
      duration: null,
      src: "https://cdn.formatglasgow.com/sets/set-999-new/audio.mp3",
      artwork: null,
      peaks: null,
      size_bytes: null,
      created_at: 9999999999999,
    };
    const db = createFakeD1([{ match: /FROM sets/, all: [uploaded] }]);

    const result = await getAllSetsWithFallback(db);

    expect(result[0]).toMatchObject({ id: "set-999-new", artist: "New Artist" });
    expect(result).toHaveLength(staticSnapshot.length + 1);
  });

  it("falls back to the snapshot alone when the live D1 query throws (a real outage)", async () => {
    const db = createFakeD1([{ match: /FROM sets/, throws: true }]);

    expect(await getAllSetsWithFallback(db)).toEqual(staticSnapshot);
  });
});

describe("getSetByIdWithFallback", () => {
  it("returns the snapshot's entry without touching D1, when present there", async () => {
    const staticSet = staticSnapshot[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");
    const db = createFakeD1([{ match: /./, throws: true }]);

    expect(await getSetByIdWithFallback(db, staticSet.id)).toEqual(staticSet);
  });

  it("returns null (not the snapshot) when D1 throws and the id isn't in the snapshot", async () => {
    const db = createFakeD1([{ match: /WHERE id = \?/, throws: true }]);

    expect(await getSetByIdWithFallback(db, "set-999-uploaded-only")).toBeNull();
  });

  it("returns null when there's no D1 binding and the id isn't in the snapshot", async () => {
    expect(await getSetByIdWithFallback(undefined, "set-999-uploaded-only")).toBeNull();
  });
});
