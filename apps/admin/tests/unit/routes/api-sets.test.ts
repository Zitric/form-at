import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteSetWithAudit,
  insertSetWithRetry,
  updateSet,
  validate,
  validateEdit,
  verifyR2ObjectsExist,
  verifyUrlsExist,
} from "~/routes/api/sets";

const validBody = {
  id: "set-003-new-artist",
  title: "Form:at 003",
  artist: "New Artist",
  date: "2026-09-01",
  audioExt: "mp3",
  artworkExt: "jpg",
} as const;

describe("validate (api/sets)", () => {
  it("accepts the minimal required fields", () => {
    expect(validate(validBody)).toEqual({
      id: "set-003-new-artist",
      title: "Form:at 003",
      artist: "New Artist",
      date: "2026-09-01",
      venue: undefined,
      description: undefined,
      duration: undefined,
      sizeBytes: undefined,
      audioExt: "mp3",
      artworkExt: "jpg",
    });
  });

  it("accepts every optional field populated", () => {
    const full = {
      ...validBody,
      venue: "Find the red door, Glasgow",
      description: "A description.",
      duration: "45:18",
      sizeBytes: 108_761_280,
    };
    expect(validate(full)).toMatchObject({
      venue: "Find the red door, Glasgow",
      description: "A description.",
      duration: "45:18",
      sizeBytes: 108_761_280,
    });
  });

  it("rejects non-object / null / primitive payloads", () => {
    expect(validate(null)).toBeNull();
    expect(validate(undefined)).toBeNull();
    expect(validate("string")).toBeNull();
    expect(validate(42)).toBeNull();
  });

  it("rejects a missing or empty id", () => {
    expect(validate({ ...validBody, id: undefined })).toBeNull();
    expect(validate({ ...validBody, id: "" })).toBeNull();
  });

  it("rejects a missing/empty/oversized title or artist", () => {
    expect(validate({ ...validBody, title: undefined })).toBeNull();
    expect(validate({ ...validBody, title: "" })).toBeNull();
    expect(validate({ ...validBody, title: "a".repeat(201) })).toBeNull();
    expect(validate({ ...validBody, artist: undefined })).toBeNull();
    expect(validate({ ...validBody, artist: "" })).toBeNull();
  });

  it("rejects a date not in YYYY-MM-DD form", () => {
    expect(validate({ ...validBody, date: "09/01/2026" })).toBeNull();
    expect(validate({ ...validBody, date: "2026-9-1" })).toBeNull();
  });

  it("rejects an oversized venue/description/duration", () => {
    expect(validate({ ...validBody, venue: "a".repeat(201) })).toBeNull();
    expect(validate({ ...validBody, description: "a".repeat(2001) })).toBeNull();
    expect(validate({ ...validBody, duration: "a".repeat(21) })).toBeNull();
  });

  it("rejects a non-positive or non-finite sizeBytes", () => {
    expect(validate({ ...validBody, sizeBytes: 0 })).toBeNull();
    expect(validate({ ...validBody, sizeBytes: -5 })).toBeNull();
    expect(validate({ ...validBody, sizeBytes: Number.NaN })).toBeNull();
    expect(validate({ ...validBody, sizeBytes: "108761280" })).toBeNull();
  });

  it("rejects an audioExt/artworkExt not on the allowlist", () => {
    expect(validate({ ...validBody, audioExt: "wav" })).toBeNull();
    expect(validate({ ...validBody, artworkExt: "gif" })).toBeNull();
  });
});

const sampleRow = {
  id: "set-003-new-artist",
  title: "Form:at 003",
  artist: "New Artist",
  date: "2026-09-01",
  venue: null,
  description: null,
  duration: null,
  src: "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
  artwork: "uploads/set-003-new-artist",
  artworkOriginalUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/artwork.jpg",
  peaks: "https://cdn.formatglasgow.com/sets/set-003-new-artist/peaks.json",
  sizeBytes: null,
  createdAt: 1785800000000,
};

function createFakeD1(run: () => Promise<void>) {
  const runSpy = vi.fn(run);
  const statement = { bind: () => statement, run: runSpy };
  const prepare = vi.fn(() => statement);
  return { db: { prepare } as unknown as D1Database, prepare, run: runSpy };
}

describe("insertSetWithRetry", () => {
  it("returns 'created' on a successful insert with no retry", async () => {
    const { db, run } = createFakeD1(async () => {});

    expect(await insertSetWithRetry(db, sampleRow)).toBe("created");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("returns 'conflict' immediately on a UNIQUE constraint violation — never retried", async () => {
    let calls = 0;
    const { db, run } = createFakeD1(async () => {
      calls++;
      throw new Error("UNIQUE constraint failed: sets.id");
    });

    expect(await insertSetWithRetry(db, sampleRow)).toBe("conflict");
    expect(run).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
  });

  it("retries a transient error twice with backoff, then succeeds", async () => {
    let attempt = 0;
    const { db, run } = createFakeD1(async () => {
      attempt++;
      if (attempt < 3) throw new Error("simulated transient D1 error");
    });

    expect(await insertSetWithRetry(db, sampleRow)).toBe("created");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("returns 'failed' after exhausting retries on a persistent transient error", async () => {
    const { db, run } = createFakeD1(async () => {
      throw new Error("simulated persistent D1 error");
    });

    expect(await insertSetWithRetry(db, sampleRow)).toBe("failed");
    expect(run).toHaveBeenCalledTimes(3);
  });
});

const sampleKeys = {
  audioKey: "sets/set-003-new-artist/audio.mp3",
  artworkKey: "sets/set-003-new-artist/artwork.jpg",
  peaksKey: "sets/set-003-new-artist/peaks.json",
  publicAudioUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
  publicArtworkUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/artwork.jpg",
  publicPeaksUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/peaks.json",
};

// Review item: nothing checked that the 3 R2 uploads the client reported as
// successful actually landed — a row pointing at a 404 would otherwise
// reach the public site. These lock the "some object missing" and
// "R2 request itself throws" paths, both of which must refuse to verify
// rather than assume success.
describe("verifyR2ObjectsExist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when all 3 objects respond ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    expect(await verifyR2ObjectsExist(sampleKeys)).toBe(true);
  });

  it("returns false when any one object 404s", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === sampleKeys.publicArtworkUrl) return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await verifyR2ObjectsExist(sampleKeys)).toBe(false);
  });

  it("returns false (doesn't assume success) when the HEAD request itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    expect(await verifyR2ObjectsExist(sampleKeys)).toBe(false);
  });

  it("HEADs all 3 public URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await verifyR2ObjectsExist(sampleKeys);

    const calledUrls = fetchMock.mock.calls.map((c) => c[0]);
    expect(calledUrls).toContain(sampleKeys.publicAudioUrl);
    expect(calledUrls).toContain(sampleKeys.publicArtworkUrl);
    expect(calledUrls).toContain(sampleKeys.publicPeaksUrl);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toMatchObject({ method: "HEAD" });
    }
  });
});

// One-click restore feature (2026-08): verifyR2ObjectsExist's 3-URL HEAD
// loop was extracted into this lower-level primitive so restore can check
// however many URLs a deleted-set log row actually recorded (a legacy set
// never had an artwork_original_url) — see routes/api/sets/restore.ts.
describe("verifyUrlsExist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when every url responds ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    expect(
      await verifyUrlsExist(["https://cdn.formatglasgow.com/a", "https://cdn.formatglasgow.com/b"]),
    ).toBe(true);
  });

  it("returns true for an empty list (nothing to check, e.g. a row with no optional URLs)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await verifyUrlsExist([])).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false when any one url 404s", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://cdn.formatglasgow.com/b") return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await verifyUrlsExist(["https://cdn.formatglasgow.com/a", "https://cdn.formatglasgow.com/b"]),
    ).toBe(false);
  });
});

const validEditBody = {
  id: "set-002-til",
  title: "Form:at 002",
  artist: "t.i.l. (corrected)",
  date: "2026-04-24",
} as const;

describe("validateEdit (api/sets)", () => {
  it("accepts the minimal required fields", () => {
    expect(validateEdit(validEditBody)).toEqual({
      id: "set-002-til",
      title: "Form:at 002",
      artist: "t.i.l. (corrected)",
      date: "2026-04-24",
      venue: undefined,
      description: undefined,
      duration: undefined,
    });
  });

  it("accepts every optional field populated", () => {
    const full = {
      ...validEditBody,
      venue: "Find the red door, Glasgow",
      description: "A description.",
      duration: "45:18",
    };
    expect(validateEdit(full)).toMatchObject({
      venue: "Find the red door, Glasgow",
      description: "A description.",
      duration: "45:18",
    });
  });

  it("rejects non-object / null / primitive payloads", () => {
    expect(validateEdit(null)).toBeNull();
    expect(validateEdit(undefined)).toBeNull();
    expect(validateEdit("string")).toBeNull();
    expect(validateEdit(42)).toBeNull();
  });

  it("rejects a missing or empty id", () => {
    expect(validateEdit({ ...validEditBody, id: undefined })).toBeNull();
    expect(validateEdit({ ...validEditBody, id: "" })).toBeNull();
  });

  it("rejects a missing/empty/oversized title or artist", () => {
    expect(validateEdit({ ...validEditBody, title: undefined })).toBeNull();
    expect(validateEdit({ ...validEditBody, title: "" })).toBeNull();
    expect(validateEdit({ ...validEditBody, title: "a".repeat(201) })).toBeNull();
    expect(validateEdit({ ...validEditBody, artist: undefined })).toBeNull();
    expect(validateEdit({ ...validEditBody, artist: "" })).toBeNull();
  });

  it("rejects a date not in YYYY-MM-DD form", () => {
    expect(validateEdit({ ...validEditBody, date: "04/24/2026" })).toBeNull();
  });

  it("rejects an oversized venue/description/duration", () => {
    expect(validateEdit({ ...validEditBody, venue: "a".repeat(201) })).toBeNull();
    expect(validateEdit({ ...validEditBody, description: "a".repeat(2001) })).toBeNull();
    expect(validateEdit({ ...validEditBody, duration: "a".repeat(21) })).toBeNull();
  });
});

// PR6 review item 5: the id is never something updateSet CAN change, by
// construction — not merely validated-and-rejected. These assert the
// actual SQL text, not just the observable outcome, since that's the only
// way to prove `id` never appears in the `SET` clause regardless of what a
// caller passes.
describe("updateSet", () => {
  it("issues an UPDATE with id only in the WHERE clause, never in SET", async () => {
    let capturedSql = "";
    const statement = {
      bind: () => statement,
      run: async () => ({ meta: { changes: 1 } }),
    };
    const db = {
      prepare: (sql: string) => {
        capturedSql = sql;
        return statement;
      },
    } as unknown as D1Database;

    await updateSet(db, validEditBody);

    expect(capturedSql).toMatch(/^UPDATE sets SET/);
    expect(capturedSql).toMatch(/WHERE id = \?$/);
    // Exactly one `id = ?` in the whole statement — in the WHERE position.
    expect(capturedSql.match(/id = \?/g)).toHaveLength(1);
    // The SET clause specifically (everything between SET and WHERE) has
    // no `id` in it at all — this is the actual proof, not just "id = ?
    // appears once somewhere," since the WHERE clause itself always
    // contains that text too.
    const setClause = capturedSql.slice(
      capturedSql.indexOf("SET") + 3,
      capturedSql.indexOf("WHERE"),
    );
    expect(setClause).not.toMatch(/\bid\b/);
  });

  it("returns 'updated' when a row was actually changed", async () => {
    const statement = { bind: () => statement, run: async () => ({ meta: { changes: 1 } }) };
    const db = { prepare: () => statement } as unknown as D1Database;

    expect(await updateSet(db, validEditBody)).toBe("updated");
  });

  it("returns 'not_found' when no row matched (e.g. deleted moments before)", async () => {
    const statement = { bind: () => statement, run: async () => ({ meta: { changes: 0 } }) };
    const db = { prepare: () => statement } as unknown as D1Database;

    expect(await updateSet(db, validEditBody)).toBe("not_found");
  });

  it("passing a different id in the body cannot change which row's SET clause applies to any other row", async () => {
    // The only way `body.id` is used at all is as the single WHERE bind —
    // there is no code path where it could reach the SET clause, so a
    // "malicious id" test here reduces to: the SQL shape is fixed, and the
    // bind order always ends with `body.id` last (the WHERE position).
    const bindSpy = vi.fn(() => statement);
    const statement = { bind: bindSpy, run: async () => ({ meta: { changes: 1 } }) };
    const db = { prepare: () => statement } as unknown as D1Database;

    await updateSet(db, { ...validEditBody, id: "totally-different-id" });

    const bindArgs = bindSpy.mock.calls[0];
    expect(bindArgs?.at(-1)).toBe("totally-different-id");
    expect(bindArgs?.slice(0, -1)).toEqual([
      validEditBody.title,
      validEditBody.artist,
      validEditBody.date,
      null,
      null,
      null,
    ]);
  });
});

const sampleDeletedRow = {
  id: "set-002-til",
  title: "Form:at 002",
  artist: "t.i.l.",
  date: "2026-04-24",
  venue: "Find the red door, Glasgow",
  description: "Opening transmission.",
  duration: "45:18",
  src: "https://cdn.formatglasgow.com/002/audio.mp3",
  artwork: "sets/002",
  artwork_original_url: null,
  peaks: "https://cdn.formatglasgow.com/002/peaks.json",
  size_bytes: 108_761_280,
  created_at: 1785707552000,
};

type FakeRoute = { match: RegExp; first?: unknown; all?: unknown[]; throwsOnFirst?: boolean };
type FakeStatement = { sql: string; boundArgs?: unknown[] };

function createRoutedFakeD1(routes: FakeRoute[], opts: { batchThrows?: boolean } = {}) {
  const calls: string[] = [];
  const statements: FakeStatement[] = [];
  const prepare = vi.fn((sql: string) => {
    calls.push(sql);
    const route = routes.find((r) => r.match.test(sql));
    const statement: FakeStatement & Record<string, unknown> = { sql };
    statement.bind = (...args: unknown[]) => {
      statement.boundArgs = args;
      return statement;
    };
    statement.first = async () => {
      if (route?.throwsOnFirst) throw new Error("simulated D1 error");
      return route?.first ?? null;
    };
    statement.all = async () => ({ results: route?.all ?? [] });
    statement.run = async () => ({ meta: { changes: 1 } });
    statements.push(statement);
    return statement;
  });
  const batch = vi.fn(async (stmts: unknown[]) => {
    if (opts.batchThrows) throw new Error("simulated D1 batch error");
    return stmts.map(() => ({ meta: { changes: 1 } }));
  });
  return { db: { prepare, batch } as unknown as D1Database, prepare, batch, calls, statements };
}

// PR6 review items 2a/3/4: the delete path must log a full audit row
// (making a delete recoverable in practice, not just in principle), must
// never touch R2, and must never touch plays/events rows themselves (only
// read a count from plays for the audit log).
//
// Post-review fix: the original version issued DELETE then INSERT as two
// separate .run() calls, and the original tests only asserted "both
// statements were issued somewhere" (`calls.some(...)`) — order-blind, so
// they passed against the wrong order. The tests below assert the actual
// array passed to db.batch() (order + atomicity), not just presence.
describe("deleteSetWithAudit", () => {
  it("deletes the row and logs it to admin_deleted_sets with the identity, timestamp, and play count, atomically via a single db.batch() call", async () => {
    const { db, calls, batch } = createRoutedFakeD1([
      { match: /SELECT \* FROM sets WHERE id/, first: sampleDeletedRow },
      { match: /SELECT COUNT\(\*\) AS n FROM plays/, first: { n: 342 } },
    ]);

    const outcome = await deleteSetWithAudit(db, "set-002-til", "julian@formatglasgow.com");

    expect(outcome).toBe("deleted");
    expect(batch).toHaveBeenCalledTimes(1);
    const [passedStatements] = batch.mock.calls[0] as [Array<{ sql: string }>];
    expect(passedStatements).toHaveLength(2);
    expect(passedStatements[0]?.sql).toMatch(/^INSERT INTO admin_deleted_sets/);
    expect(passedStatements[1]?.sql).toMatch(/^DELETE FROM sets WHERE id/);
    // Never touches R2 (no fetch here at all) or plays/events rows
    // themselves (only ever a SELECT COUNT against plays, never a DELETE).
    expect(calls.some((sql) => /DELETE FROM plays/.test(sql))).toBe(false);
    expect(calls.some((sql) => /DELETE FROM events/.test(sql))).toBe(false);
  });

  it("returns 'not_found' and logs nothing when the id doesn't exist", async () => {
    const { db, calls, batch } = createRoutedFakeD1([
      { match: /SELECT \* FROM sets WHERE id/, first: null },
    ]);

    const outcome = await deleteSetWithAudit(db, "not-a-real-id", "julian@formatglasgow.com");

    expect(outcome).toBe("not_found");
    expect(calls.some((sql) => /DELETE FROM sets/.test(sql))).toBe(false);
    expect(calls.some((sql) => /INSERT INTO admin_deleted_sets/.test(sql))).toBe(false);
    expect(batch).not.toHaveBeenCalled();
  });

  it("logs a zero play count when the set was never played", async () => {
    const { db, calls } = createRoutedFakeD1([
      { match: /SELECT \* FROM sets WHERE id/, first: sampleDeletedRow },
      { match: /SELECT COUNT\(\*\) AS n FROM plays/, first: null },
    ]);

    const outcome = await deleteSetWithAudit(db, "set-002-til", "julian@formatglasgow.com");

    expect(outcome).toBe("deleted");
    expect(calls.some((sql) => /^INSERT INTO admin_deleted_sets/.test(sql))).toBe(true);
  });

  // Item 4: the play-count read is metadata about the deletion, not a
  // precondition for it — a throw there must not abort the delete.
  it("a play-count read that throws doesn't abort the delete — logs 0 and continues", async () => {
    const { db, statements } = createRoutedFakeD1([
      { match: /SELECT \* FROM sets WHERE id/, first: sampleDeletedRow },
      { match: /SELECT COUNT\(\*\) AS n FROM plays/, throwsOnFirst: true },
    ]);

    const outcome = await deleteSetWithAudit(db, "set-002-til", "julian@formatglasgow.com");

    expect(outcome).toBe("deleted");
    const insertStatement = statements.find((s) =>
      s.sql.startsWith("INSERT INTO admin_deleted_sets"),
    );
    expect(insertStatement?.boundArgs?.at(-1)).toBe(0);
  });

  // Items 1 + 2: log-before-delete, inside one atomic db.batch() call —
  // Cloudflare's docs confirm batch() rolls back the whole batch on any
  // statement failure, so an INSERT failure (e.g. an un-migrated
  // admin_deleted_sets table) must leave the row undeleted, not just
  // unlogged. Proven here by asserting there is no separate, independent
  // DELETE call outside the (failing) batch.
  it("a failing audit INSERT leaves the DELETE uncommitted — both are inside the one batch() call that throws", async () => {
    const { db, batch } = createRoutedFakeD1(
      [
        { match: /SELECT \* FROM sets WHERE id/, first: sampleDeletedRow },
        { match: /SELECT COUNT\(\*\) AS n FROM plays/, first: { n: 342 } },
      ],
      { batchThrows: true },
    );

    await expect(
      deleteSetWithAudit(db, "set-002-til", "julian@formatglasgow.com"),
    ).rejects.toThrow();

    expect(batch).toHaveBeenCalledTimes(1);
    const [passedStatements] = batch.mock.calls[0] as [Array<{ sql: string }>];
    expect(passedStatements[0]?.sql).toMatch(/^INSERT INTO admin_deleted_sets/);
    expect(passedStatements[1]?.sql).toMatch(/^DELETE FROM sets WHERE id/);
  });
});
