import { describe, expect, it } from "vitest";
import { fetchRecentDeletedSets, fetchSetsWithPlayCounts } from "~/data/sets-admin";

type FakeRoute = { match: RegExp; all?: unknown[] };

function createFakeD1(routes: FakeRoute[]) {
  return {
    prepare: (sql: string) => {
      const route = routes.find((r) => r.match.test(sql));
      if (!route) throw new Error(`No fake D1 route matched SQL:\n${sql}`);
      const statement = {
        bind: () => statement,
        all: async <T>() => ({ results: (route.all ?? []) as T[] }),
      };
      return statement;
    },
  } as unknown as D1Database;
}

const sampleSetRow = {
  id: "set-002-til",
  title: "Form:at 002",
  artist: "t.i.l.",
  date: "2026-04-24",
  venue: null,
  description: null,
  duration: null,
  src: "https://cdn.formatglasgow.com/002/audio.mp3",
  artwork: "sets/002",
  artwork_original_url: null,
  peaks: "https://cdn.formatglasgow.com/002/peaks.json",
  size_bytes: 108_761_280,
  created_at: 1785707552000,
};

// PR6 review item 1a: play count is the real signal for "how consequential
// is deleting this set" — joined here rather than fetched per-row, so the
// admin sets list never does N+1 queries.
describe("fetchSetsWithPlayCounts", () => {
  it("joins each set with its play count", async () => {
    const db = createFakeD1([
      { match: /FROM sets ORDER BY/, all: [sampleSetRow] },
      { match: /FROM plays GROUP BY/, all: [{ set_id: "set-002-til", n: 342 }] },
    ]);

    const result = await fetchSetsWithPlayCounts(db);

    expect(result).toEqual([expect.objectContaining({ id: "set-002-til", playCount: 342 })]);
  });

  it("defaults playCount to 0 for a set with no recorded plays, not undefined", async () => {
    const db = createFakeD1([
      { match: /FROM sets ORDER BY/, all: [sampleSetRow] },
      { match: /FROM plays GROUP BY/, all: [] },
    ]);

    const result = await fetchSetsWithPlayCounts(db);

    expect(result[0]?.playCount).toBe(0);
  });

  it("returns an empty array when there are no sets", async () => {
    const db = createFakeD1([
      { match: /FROM sets ORDER BY/, all: [] },
      { match: /FROM plays GROUP BY/, all: [] },
    ]);

    expect(await fetchSetsWithPlayCounts(db)).toEqual([]);
  });
});

describe("fetchRecentDeletedSets", () => {
  it("maps snake_case D1 rows to camelCase", async () => {
    const db = createFakeD1([
      {
        match: /FROM admin_deleted_sets/,
        all: [
          {
            deleted_at: 1_722_000_000_000,
            deleted_by_email: "julian@formatglasgow.com",
            set_id: "set-999-old",
            title: "Form:at 999",
            artist: "Old Artist",
            play_count_at_deletion: 12,
          },
        ],
      },
    ]);

    expect(await fetchRecentDeletedSets(db)).toEqual([
      {
        deletedAt: 1_722_000_000_000,
        deletedByEmail: "julian@formatglasgow.com",
        setId: "set-999-old",
        title: "Form:at 999",
        artist: "Old Artist",
        playCountAtDeletion: 12,
      },
    ]);
  });

  it("returns an empty array when nothing has been deleted", async () => {
    const db = createFakeD1([{ match: /FROM admin_deleted_sets/, all: [] }]);
    expect(await fetchRecentDeletedSets(db)).toEqual([]);
  });
});
