import { RUM_UPSERT_SQL, toUpsertValues } from "@form-at/data/rumArchive";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWindow } from "../src/index";

// The Cloudflare API is unreachable from tests, so `fetch` is mocked and D1 is
// a fake that records what it was asked to run. What's being locked here is the
// behaviour that fails SILENTLY in production: writing nothing on a failed
// read, and never letting a late run overwrite exact rows.

type Bound = { sql: string; values: unknown[] };

function fakeDb() {
  const bound: Bound[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const stmt = { sql, values };
          return stmt;
        },
      };
    },
    async batch(statements: unknown[]) {
      for (const s of statements as Bound[]) bound.push(s);
      return statements.map(() => ({ success: true }));
    },
  };
  return { db: db as never, bound };
}

function mockRum(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

const groups = (rows: unknown[]) => ({
  data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: rows }] } },
});

const group = (o: {
  date: string;
  bot?: unknown;
  count?: number;
  estimate?: number;
  sampleSize?: number;
  sampleInterval?: number;
}) => ({
  count: o.count ?? 10,
  dimensions: { date: o.date, bot: o.bot ?? 0 },
  avg: { sampleInterval: o.sampleInterval ?? 1 },
  confidence: {
    level: 0.95,
    sum: {
      visits: {
        estimate: o.estimate ?? 5,
        lower: o.estimate ?? 5,
        upper: o.estimate ?? 5,
        isValid: false,
        sampleSize: o.sampleSize ?? o.estimate ?? 5,
      },
    },
  },
});

const env = (db: unknown) => ({ DB: db, CF_ANALYTICS_TOKEN: "t", CF_ACCOUNT_ID: "a" }) as never;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("captureWindow", () => {
  it("writes one upsert per returned row, covering the trailing 7 days", async () => {
    const { db, bound } = fakeDb();
    mockRum(groups([group({ date: "2026-08-09" }), group({ date: "2026-08-10" })]));

    const result = await captureWindow(env(db), new Date("2026-08-11T03:17:00Z"));

    // Inclusive 7-day window ending today.
    expect(result.since).toBe("2026-08-05");
    expect(result.until).toBe("2026-08-11");
    expect(result.rowsWritten).toBe(2);
    expect(bound).toHaveLength(2);
    expect(bound[0]?.sql).toBe(RUM_UPSERT_SQL);
  });

  it("writes NOTHING when the read fails", async () => {
    // A failed read must not produce a partial or empty write: in this table a
    // missing row and a zero row are indistinguishable after the fact, and the
    // gap is invisible until someone compares numbers months later.
    const { db, bound } = fakeDb();
    mockRum({ errors: [{ message: "insufficient permissions" }] });

    const result = await captureWindow(env(db), new Date("2026-08-11T03:17:00Z"));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("rum-read-failed");
    expect(bound).toHaveLength(0);
  });

  it("treats an empty window as a successful read that writes nothing", async () => {
    const { db, bound } = fakeDb();
    mockRum(groups([]));

    const result = await captureWindow(env(db), new Date("2026-08-11T03:17:00Z"));

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("no-rows-in-window");
    expect(bound).toHaveLength(0);
  });

  it("stores bot rows rather than filtering them at capture", async () => {
    // Filtering here would discard information irreversibly for a saving of
    // ~1 row/day, and the bot share is itself displayed.
    const { db, bound } = fakeDb();
    mockRum(
      groups([
        group({ date: "2026-08-10", bot: 0, estimate: 41 }),
        group({ date: "2026-08-10", bot: 1, estimate: 3 }),
      ]),
    );

    await captureWindow(env(db), new Date("2026-08-11T03:17:00Z"));

    expect(bound.map((b) => b.values[1])).toEqual([0, 1]);
  });

  it("carries sample_interval through, so a late capture is detectable", async () => {
    const { db, bound } = fakeDb();
    mockRum(groups([group({ date: "2026-08-04", sampleInterval: 10, estimate: 120 })]));

    await captureWindow(env(db), new Date("2026-08-11T03:17:00Z"));

    // Positions: day, is_bot, page_loads, visits, sample_size, sample_interval.
    expect(bound[0]?.values[5]).toBe(10);
  });

  it("skips rows with no day or no estimate instead of writing zeros", async () => {
    const { db, bound } = fakeDb();
    mockRum(
      groups([
        { count: 5, dimensions: { bot: 0 }, confidence: { sum: { visits: { estimate: 5 } } } },
        { count: 5, dimensions: { date: "2026-08-10", bot: 0 }, confidence: { sum: {} } },
        group({ date: "2026-08-10", estimate: 7 }),
      ]),
    );

    const result = await captureWindow(env(db), new Date("2026-08-11T03:17:00Z"));

    expect(result.rowsFetched).toBe(3);
    expect(result.rowsWritten).toBe(1);
    expect(result.rowsSkipped).toBe(2);
    expect(bound).toHaveLength(1);
  });

  it("returns a failed read when credentials are missing, without calling the API", async () => {
    const { db, bound } = fakeDb();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureWindow({ DB: db } as never, new Date("2026-08-11T03:17:00Z"));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bound).toHaveLength(0);
  });
});

describe("toUpsertValues", () => {
  it("maps a row to the exact bound-value order the upsert expects", () => {
    const values = toUpsertValues(
      group({ date: "2026-08-10", bot: 1, count: 23, estimate: 11, sampleSize: 11 }),
      1_700_000_000_000,
    );

    expect(values).toEqual(["2026-08-10", 1, 23, 11, 11, 1, 1_700_000_000_000]);
  });

  it("stores a missing sampleSize as NULL, not 0", () => {
    // 0 would read as "no samples behind this estimate", which is a claim; NULL
    // says the field wasn't reported.
    const row = group({ date: "2026-08-10" });
    row.confidence.sum.visits.sampleSize = undefined as never;

    expect(toUpsertValues(row, 1)?.[4]).toBeNull();
  });
});
