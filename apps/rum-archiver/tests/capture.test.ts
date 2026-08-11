import { RUM_RUN_LOG_SQL, RUM_UPSERT_SQL, toUpsertValues } from "@form-at/data/rumArchive";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWindow } from "../src/index";

// The Cloudflare API is unreachable from tests, so `fetch` is mocked and D1 is
// a fake that records what it was asked to run. What's being locked here is the
// behaviour that fails SILENTLY in production: writing no DATA on a failed
// read, never letting a late run overwrite exact rows, and always logging the
// run itself — including the runs that store nothing, which are the only
// evidence those days were ever looked at.

type Bound = { sql: string; values: unknown[] };

function fakeDb() {
  const bound: Bound[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const stmt: Bound & { run: () => Promise<unknown> } = {
            sql,
            values,
            // The failed-read path writes the run log on its own rather than
            // through batch(), since it has no data statements to batch with.
            run: async () => {
              bound.push({ sql, values });
              return { success: true };
            },
          };
          return stmt;
        },
      };
    },
    async batch(statements: unknown[]) {
      for (const s of statements as Bound[]) bound.push({ sql: s.sql, values: s.values });
      return statements.map(() => ({ success: true }));
    },
  };
  // `data` is the rum_daily upserts; `runs` is the rum_capture_runs log. They
  // are asserted separately because the whole fix is that a run with zero data
  // writes still leaves a log entry.
  return {
    db: db as never,
    bound,
    get data() {
      return bound.filter((b) => b.sql === RUM_UPSERT_SQL);
    },
    get runs() {
      return bound.filter((b) => b.sql === RUM_RUN_LOG_SQL);
    },
  };
}

/** Positions in RUM_RUN_LOG_SQL: captured_at, since, until, ok, fetched, written, reason. */
const RUN_OK = 3;
const RUN_REASON = 6;

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
    const fake = fakeDb();
    mockRum(groups([group({ date: "2026-08-09" }), group({ date: "2026-08-10" })]));

    const result = await captureWindow(env(fake.db), new Date("2026-08-11T03:17:00Z"));

    // Inclusive 7-day window ending today.
    expect(result.since).toBe("2026-08-05");
    expect(result.until).toBe("2026-08-11");
    expect(result.rowsWritten).toBe(2);
    expect(fake.data).toHaveLength(2);
  });

  it("writes no DATA when the read fails, but still logs the run as failed", async () => {
    // A failed read must not produce a partial or empty data write: in rum_daily
    // a missing row and a zero row are indistinguishable after the fact.
    // The RUN is still logged, with ok=0 — it isn't coverage, but it's proof
    // the trigger fired, which is what separates a dead cron from a live cron
    // whose reads are all failing. Those need different fixes.
    const fake = fakeDb();
    mockRum({ errors: [{ message: "insufficient permissions" }] });

    const result = await captureWindow(env(fake.db), new Date("2026-08-11T03:17:00Z"));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("rum-read-failed");
    expect(fake.data).toHaveLength(0);
    expect(fake.runs).toHaveLength(1);
    expect(fake.runs[0]?.values[RUN_OK]).toBe(0);
    expect(fake.runs[0]?.values[RUN_REASON]).toBe("rum-read-failed");
  });

  it("logs a quiet window as a SUCCESSFUL run, so those days count as observed", async () => {
    // The regression the run log exists for. A window with no traffic writes no
    // rows, so rum_daily keeps no trace this run happened; deriving coverage
    // from rum_daily.captured_at would render a healthy quiet week as "nobody
    // looked" gaps. The log entry is the only evidence — and ok=1 is what makes
    // those days real zeros rather than unknowns.
    const fake = fakeDb();
    mockRum(groups([]));

    const result = await captureWindow(env(fake.db), new Date("2026-08-11T03:17:00Z"));

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("no-rows-in-window");
    expect(fake.data).toHaveLength(0);
    expect(fake.runs).toHaveLength(1);
    expect(fake.runs[0]?.values[RUN_OK]).toBe(1);
    // The window is stored per run, not recomputed later from captured_at and
    // whatever RUM_UNSAMPLED_DAYS happens to be then.
    expect(fake.runs[0]?.values.slice(1, 3)).toEqual(["2026-08-05", "2026-08-11"]);
  });

  it("logs the run alongside the data writes, in one batch", async () => {
    // Batched together so a run can't be logged as covering days whose rows
    // failed to write — that would assert coverage it doesn't have.
    const fake = fakeDb();
    mockRum(groups([group({ date: "2026-08-10" })]));

    await captureWindow(env(fake.db), new Date("2026-08-11T03:17:00Z"));

    expect(fake.bound.map((b) => b.sql)).toEqual([RUM_UPSERT_SQL, RUM_RUN_LOG_SQL]);
    expect(fake.runs[0]?.values[RUN_REASON]).toBeNull();
  });

  it("stores bot rows rather than filtering them at capture", async () => {
    // Filtering here would discard information irreversibly for a saving of
    // ~1 row/day, and the bot share is itself displayed.
    const fake = fakeDb();
    mockRum(
      groups([
        group({ date: "2026-08-10", bot: 0, estimate: 41 }),
        group({ date: "2026-08-10", bot: 1, estimate: 3 }),
      ]),
    );

    await captureWindow(env(fake.db), new Date("2026-08-11T03:17:00Z"));

    expect(fake.data.map((b) => b.values[1])).toEqual([0, 1]);
  });

  it("carries sample_interval through, so a late capture is detectable", async () => {
    const fake = fakeDb();
    mockRum(groups([group({ date: "2026-08-04", sampleInterval: 10, estimate: 120 })]));

    await captureWindow(env(fake.db), new Date("2026-08-11T03:17:00Z"));

    // Positions: day, is_bot, page_loads, visits, sample_size, sample_interval.
    expect(fake.data[0]?.values[5]).toBe(10);
  });

  it("skips rows with no day or no estimate instead of writing zeros", async () => {
    const fake = fakeDb();
    mockRum(
      groups([
        { count: 5, dimensions: { bot: 0 }, confidence: { sum: { visits: { estimate: 5 } } } },
        { count: 5, dimensions: { date: "2026-08-10", bot: 0 }, confidence: { sum: {} } },
        group({ date: "2026-08-10", estimate: 7 }),
      ]),
    );

    const result = await captureWindow(env(fake.db), new Date("2026-08-11T03:17:00Z"));

    expect(result.rowsFetched).toBe(3);
    expect(result.rowsWritten).toBe(1);
    expect(result.rowsSkipped).toBe(2);
    expect(fake.data).toHaveLength(1);
  });

  it("returns a failed read when credentials are missing, without calling the API", async () => {
    const fake = fakeDb();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await captureWindow({ DB: fake.db } as never, new Date("2026-08-11T03:17:00Z"));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.data).toHaveLength(0);
    // Still logged: a missing token is a failed read like any other, and the
    // cron demonstrably fired.
    expect(fake.runs).toHaveLength(1);
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
