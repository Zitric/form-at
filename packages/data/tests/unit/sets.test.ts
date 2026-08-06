import { describe, expect, it } from "vitest";
import {
  type MusicSet,
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
