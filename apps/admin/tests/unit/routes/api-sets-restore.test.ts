import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreSetFromLog } from "~/routes/api/sets/restore";

type FakeRoute = { match: RegExp; first?: unknown };

function createFakeD1(routes: FakeRoute[], opts: { batchThrows?: string | true } = {}) {
  const calls: string[] = [];
  const statements: Array<{ sql: string }> = [];
  const prepare = vi.fn((sql: string) => {
    calls.push(sql);
    const route = routes.find((r) => r.match.test(sql));
    const statement = {
      sql,
      bind: () => statement,
      first: async () => route?.first ?? null,
      run: async () => ({ meta: { changes: 1 } }),
    };
    statements.push(statement);
    return statement;
  });
  const batch = vi.fn(async (stmts: unknown[]) => {
    if (opts.batchThrows) {
      throw new Error(opts.batchThrows === true ? "simulated D1 batch error" : opts.batchThrows);
    }
    return stmts.map(() => ({ meta: { changes: 1 } }));
  });
  return { db: { prepare, batch } as unknown as D1Database, prepare, batch, calls, statements };
}

const sampleLogRow = {
  id: 7,
  set_id: "set-999-old",
  title: "Form:at 999",
  artist: "Old Artist",
  date: "2026-01-01",
  venue: "Find the red door, Glasgow",
  description: "A description.",
  duration: "45:00",
  src: "https://cdn.formatglasgow.com/999/audio.mp3",
  artwork: "uploads/set-999-old",
  artwork_original_url: "https://cdn.formatglasgow.com/999/artwork.jpg",
  peaks: "https://cdn.formatglasgow.com/999/peaks.json",
  size_bytes: 123_456,
  created_at: 1_700_000_000_000,
};

// Legacy sets (migrated pre-upload-feature) never had an
// artwork_original_url — NULL here is a structural DB fact, not a
// placeholder, and restoreSetFromLog must not try to HEAD-check it.
const legacyLogRow = {
  ...sampleLogRow,
  id: 8,
  set_id: "set-002-til",
  artwork_original_url: null,
};

describe("restoreSetFromLog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores: batches [INSERT INTO sets, UPDATE ... restored_at] in that order, using the log's original created_at", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { db, batch } = createFakeD1([
      { match: /SELECT \* FROM admin_deleted_sets WHERE id/, first: sampleLogRow },
    ]);

    const outcome = await restoreSetFromLog(db, 7);

    expect(outcome).toBe("restored");
    expect(batch).toHaveBeenCalledTimes(1);
    const [passedStatements] = batch.mock.calls[0] as [Array<{ sql: string }>];
    expect(passedStatements[0]?.sql).toMatch(/^INSERT INTO sets/);
    expect(passedStatements[1]?.sql).toMatch(/^UPDATE admin_deleted_sets SET restored_at/);
  });

  it("only HEAD-checks the URLs the row actually recorded — skips a null artwork_original_url (legacy set), never treats it as missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { db } = createFakeD1([
      { match: /SELECT \* FROM admin_deleted_sets WHERE id/, first: legacyLogRow },
    ]);

    const outcome = await restoreSetFromLog(db, 8);

    expect(outcome).toBe("restored");
    expect(fetchMock).toHaveBeenCalledTimes(2); // src + peaks only, not artwork_original_url
    const checkedUrls = fetchMock.mock.calls.map((c) => c[0]);
    expect(checkedUrls).toContain(legacyLogRow.src);
    expect(checkedUrls).toContain(legacyLogRow.peaks);
  });

  it("returns 'not_found' when no matching un-restored log row exists — no R2 check, no batch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, batch } = createFakeD1([
      { match: /SELECT \* FROM admin_deleted_sets WHERE id/, first: null },
    ]);

    const outcome = await restoreSetFromLog(db, 999);

    expect(outcome).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("returns 'r2_missing' when a recorded URL 404s — real 'had one, now gone', not skipped", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === sampleLogRow.artwork_original_url) return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { db, batch } = createFakeD1([
      { match: /SELECT \* FROM admin_deleted_sets WHERE id/, first: sampleLogRow },
    ]);

    const outcome = await restoreSetFromLog(db, 7);

    expect(outcome).toBe("r2_missing");
    expect(batch).not.toHaveBeenCalled();
  });

  it("returns 'id_taken' when the id was reused since deletion — a UNIQUE constraint failure inside the batch, never a partial write", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { db, batch } = createFakeD1(
      [{ match: /SELECT \* FROM admin_deleted_sets WHERE id/, first: sampleLogRow }],
      { batchThrows: "UNIQUE constraint failed: sets.id" },
    );

    const outcome = await restoreSetFromLog(db, 7);

    expect(outcome).toBe("id_taken");
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("propagates a non-unique-constraint batch failure rather than silently reporting id_taken", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { db } = createFakeD1(
      [{ match: /SELECT \* FROM admin_deleted_sets WHERE id/, first: sampleLogRow }],
      { batchThrows: true },
    );

    await expect(restoreSetFromLog(db, 7)).rejects.toThrow("simulated D1 batch error");
  });
});
