import { describe, expect, it } from "vitest";
import {
  type MusicSet,
  fetchDeletedSetIds,
  fetchSetById,
  fetchUploadedSets,
  getSet,
  mapD1RowToMusicSet,
  mergeSets,
  sets,
} from "~/sets";

// The catalogue's source is a D1 `sets` table, with the build-time snapshot
// (sets.generated.ts, re-exported as `sets` here) as the offline-survival
// fallback. Same fake-D1 pattern as apps/admin's admin-stats.test.ts.

type FakeRoute = {
  match: RegExp;
  first?: Record<string, unknown> | null;
  all?: Record<string, unknown>[];
  throws?: boolean;
};

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

const sampleRow = {
  id: "set-003-new-artist",
  title: "Form:at 003",
  artist: "New Artist",
  date: "2026-08-01",
  venue: null,
  description: null,
  duration: null,
  src: "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
  artwork: "sets/set-003-new-artist",
  artwork_original_url: "https://cdn.formatglasgow.com/sets/set-003-new-artist/artwork.jpg",
  peaks: "https://cdn.formatglasgow.com/sets/set-003-new-artist/peaks.json",
  size_bytes: 12345,
  created_at: 1785800000000,
};

describe("mapD1RowToMusicSet", () => {
  it("maps snake_case columns to the MusicSet shape, nulls to undefined", () => {
    expect(mapD1RowToMusicSet(sampleRow)).toEqual({
      id: "set-003-new-artist",
      title: "Form:at 003",
      artist: "New Artist",
      date: "2026-08-01",
      venue: undefined,
      description: undefined,
      duration: undefined,
      src: "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
      artwork: "sets/set-003-new-artist",
      artworkOriginalUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/artwork.jpg",
      peaks: "https://cdn.formatglasgow.com/sets/set-003-new-artist/peaks.json",
      sizeBytes: 12345,
    } satisfies MusicSet);
  });

  // Unlike `peaks_status`, this column IS surfaced on the public MusicSet
  // type — it's the fallback source `Image.tsx`
  // renders when a set has no optimized artwork variants yet. Locking the
  // null path explicitly since it's the common case for the 4 legacy sets.
  it("maps a null artwork_original_url to undefined (the legacy-sets case)", () => {
    const row = { ...sampleRow, artwork_original_url: null };
    expect(mapD1RowToMusicSet(row).artworkOriginalUrl).toBeUndefined();
  });
});

describe("fetchUploadedSets", () => {
  it("maps every row from the sets table", async () => {
    const db = createFakeD1([{ match: /FROM sets/, all: [sampleRow] }]);

    const result = await fetchUploadedSets(db);

    expect(result).toEqual([mapD1RowToMusicSet(sampleRow)]);
  });

  it("returns an empty array when the table has no rows", async () => {
    const db = createFakeD1([{ match: /FROM sets/, all: [] }]);

    expect(await fetchUploadedSets(db)).toEqual([]);
  });
});

describe("fetchDeletedSetIds", () => {
  it("returns the ids with an outstanding (unrestored) delete", async () => {
    const db = createFakeD1([
      { match: /admin_deleted_sets/, all: [{ set_id: "set-a" }, { set_id: "set-b" }] },
    ]);

    expect(await fetchDeletedSetIds(db)).toEqual(new Set(["set-a", "set-b"]));
  });

  it("returns an empty set when nothing is currently deleted", async () => {
    const db = createFakeD1([{ match: /admin_deleted_sets/, all: [] }]);

    expect(await fetchDeletedSetIds(db)).toEqual(new Set());
  });

  it("never throws — resolves to an empty set on a query failure, the safe direction", async () => {
    const db = createFakeD1([{ match: /admin_deleted_sets/, throws: true }]);

    await expect(fetchDeletedSetIds(db)).resolves.toEqual(new Set());
  });

  it("never throws even when nothing matches the query at all (no route registered)", async () => {
    // Models a caller that only set up fake routes for an unrelated query —
    // this must degrade the same way a real failure would, not throw an
    // uncaught "no fake route matched" past this function's own boundary.
    const db = createFakeD1([{ match: /FROM sets ORDER BY/, all: [] }]);

    await expect(fetchDeletedSetIds(db)).resolves.toEqual(new Set());
  });
});

describe("fetchSetById", () => {
  // D1 (live) wins over the static snapshot, same precedence as mergeSets —
  // this is the fix for the bug where the list page (live-wins via
  // mergeSets) and this detail lookup used to disagree on the same id's data.
  it("prefers D1's row over the snapshot's copy of the same id", async () => {
    const staticSet = sets[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");
    const updatedRow = { ...sampleRow, id: staticSet.id, title: "Corrected via direct SQL" };
    const db = createFakeD1([{ match: /WHERE id = \?/, first: updatedRow }]);

    const result = await fetchSetById(db, staticSet.id);

    expect(result).toEqual(mapD1RowToMusicSet(updatedRow));
    expect(result?.title).not.toEqual(staticSet.title);
  });

  it("falls back to the static snapshot when D1 has no row for this id", async () => {
    const staticSet = sets[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");
    const db = createFakeD1([{ match: /WHERE id = \?/, first: null }]);

    const result = await fetchSetById(db, staticSet.id);

    expect(result).toEqual(staticSet);
  });

  // The case the operator cares about most: without this, a deleted set's
  // detail page not only kept rendering the stale snapshot copy, it kept
  // PLAYING — deletion never touches R2, so the audio was still right there.
  it("returns undefined (not the stale, still-playable snapshot) when the set is genuinely deleted and tombstoned", async () => {
    const staticSet = sets[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");
    const db = createFakeD1([
      { match: /WHERE id = \?/, first: null },
      { match: /admin_deleted_sets/, all: [{ set_id: staticSet.id }] },
    ]);

    expect(await fetchSetById(db, staticSet.id)).toBeUndefined();
  });

  it("still falls back to the snapshot when the row is missing but NOT tombstoned — today's behaviour, unchanged", async () => {
    const staticSet = sets[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");
    const db = createFakeD1([
      { match: /WHERE id = \?/, first: null },
      { match: /admin_deleted_sets/, all: [] },
    ]);

    expect(await fetchSetById(db, staticSet.id)).toEqual(staticSet);
  });

  it("degrades to the snapshot fallback if the tombstone query itself fails — never a bare error, never blank", async () => {
    const staticSet = sets[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");
    const db = createFakeD1([
      { match: /WHERE id = \?/, first: null },
      { match: /admin_deleted_sets/, throws: true },
    ]);

    expect(await fetchSetById(db, staticSet.id)).toEqual(staticSet);
  });

  it("a live row always wins, even over a stale or inconsistent tombstone entry for the same id", async () => {
    const db = createFakeD1([
      { match: /WHERE id = \?/, first: sampleRow },
      { match: /admin_deleted_sets/, all: [{ set_id: sampleRow.id }] },
    ]);

    expect(await fetchSetById(db, sampleRow.id)).toEqual(mapD1RowToMusicSet(sampleRow));
  });

  it("returns a D1-only row (uploaded since the last deploy, not yet in the snapshot)", async () => {
    const db = createFakeD1([{ match: /WHERE id = \?/, first: sampleRow }]);

    const result = await fetchSetById(db, "set-003-new-artist");

    expect(result).toEqual(mapD1RowToMusicSet(sampleRow));
  });

  it("returns undefined when the id exists in neither D1 nor the snapshot", async () => {
    const db = createFakeD1([{ match: /WHERE id = \?/, first: null }]);

    expect(await fetchSetById(db, "totally-unknown-id")).toBeUndefined();
  });
});

describe("mergeSets", () => {
  const a: MusicSet = { id: "a", title: "t", artist: "art-a", date: "2026-01-01", src: "src-a" };
  const b: MusicSet = { id: "b", title: "t", artist: "art-b", date: "2026-01-02", src: "src-b" };
  const c: MusicSet = { id: "c", title: "t", artist: "art-c", date: "2026-01-03", src: "src-c" };

  it("concatenates live and snapshot with live entries first", () => {
    expect(mergeSets([a], [b, c])).toEqual([a, b, c]);
  });

  it("dedupes by id, live winning over the snapshot's copy of the same id", () => {
    const liveVersion: MusicSet = { ...a, title: "updated live title" };

    const result = mergeSets([liveVersion], [a, b]);

    expect(result).toEqual([liveVersion, b]);
  });

  it("returns just the snapshot when live is empty (the D1-unreachable fallback shape)", () => {
    expect(mergeSets([], [a, b, c])).toEqual([a, b, c]);
  });

  describe("deletedIds (tombstone filtering)", () => {
    it("excludes a snapshot-only entry whose id is tombstoned", () => {
      expect(mergeSets([], [a, b], new Set(["a"]))).toEqual([b]);
    });

    it("does not filter anything when deletedIds is omitted — today's behaviour, unchanged", () => {
      expect(mergeSets([], [a, b])).toEqual([a, b]);
    });

    it("does not filter an id that isn't in deletedIds", () => {
      expect(mergeSets([], [a, b], new Set(["c"]))).toEqual([a, b]);
    });

    it("a live entry always wins over a tombstone for the same id — the sets table is the one ground truth", () => {
      // Models data that's inconsistent in principle (an id both live and
      // carrying an unrestored admin_deleted_sets row) — live must win
      // regardless, since fetchDeletedSetIds is metadata ABOUT the sets
      // table, never a competing source.
      expect(mergeSets([a], [a], new Set(["a"]))).toEqual([a]);
    });

    it("the restore round trip: gone while tombstoned, back once the tombstone clears", () => {
      // The snapshot itself never changes here (no deploy happened) — only
      // deletedIds does, exactly as it would across real requests before
      // and after a restore, since fetchDeletedSetIds is recomputed fresh
      // from admin_deleted_sets every time, never cached.
      expect(mergeSets([], [a, b], new Set())).toEqual([a, b]);
      expect(mergeSets([], [a, b], new Set(["a"]))).toEqual([b]);
      expect(mergeSets([], [a, b], new Set())).toEqual([a, b]);
    });

    it("survives a second delete/restore cycle for the same id — mergeSets holds no state between calls", () => {
      // The case a stateful tombstone implementation (an in-memory "ever
      // deleted" cache, say) could get wrong on a second cycle. mergeSets
      // can't get this wrong by construction: it has no memory of any
      // previous call, so every call is only ever a function of the
      // deletedIds it's given THIS time.
      expect(mergeSets([], [a], new Set(["a"]))).toEqual([]);
      expect(mergeSets([], [a], new Set())).toEqual([a]);
      expect(mergeSets([], [a], new Set(["a"]))).toEqual([]);
      expect(mergeSets([], [a], new Set())).toEqual([a]);
    });
  });
});

describe("getSet", () => {
  it("finds a set from the committed snapshot by id", () => {
    const staticSet = sets[0];
    if (!staticSet) throw new Error("snapshot is empty — test fixture assumption broken");

    expect(getSet(staticSet.id)).toEqual(staticSet);
  });

  it("returns undefined for an id not in the snapshot", () => {
    expect(getSet("not-a-real-id")).toBeUndefined();
  });
});
