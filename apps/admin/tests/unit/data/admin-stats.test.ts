import { TREND_BUCKET_DAYS, TREND_WINDOW_DAYS } from "@form-at/data/set-stats";
import { describe, expect, it } from "vitest";
import {
  computeInstallToPushConversion,
  computeTrackingStartDay,
  fetchAppLaunchStats,
  fetchClickStats,
  fetchEventsTrackingStart,
  fetchInstallFunnel,
  fetchPlayStats,
  fetchPushSubscriberStats,
  fetchPushSubscriptionsTrackingStart,
} from "~/data/admin-stats";

// No D1-querying loader in this codebase had a test before this file (verified
// against set-stats.ts's fetchOverallStats/fetchSetStats — neither has one).
// This fake models the one shape every query in admin-stats.ts actually uses:
// `db.prepare(sql).bind(...).first()` or `.all()`. Routes are matched by a
// regex against the SQL text rather than call order, since several functions
// fire more than one query via Promise.all in no guaranteed sequence.
type FakeRoute = {
  match: RegExp;
  first?: Record<string, unknown> | null;
  all?: Record<string, unknown>[];
};

function createFakeD1(routes: FakeRoute[]): { db: D1Database; queries: string[] } {
  const queries: string[] = [];
  const db = {
    prepare: (sql: string) => {
      queries.push(sql);
      const route = routes.find((r) => r.match.test(sql));
      if (!route) throw new Error(`No fake D1 route matched SQL:\n${sql}`);
      const statement = {
        bind: () => statement,
        first: async <T>() => (route.first ?? null) as T | null,
        all: async <T>() => ({ results: (route.all ?? []) as T[] }),
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, queries };
}

describe("fetchInstallFunnel", () => {
  // The totals and trend queries both hit `events` with an `event_type IN
  // (...)` filter, so the route match has to key on text unique to each:
  // the totals query aliases its count `as n`, the trend query group-bys
  // `day, event_type` (and aliases the count `AS count`). A broader match
  // like `/FROM events/` would match both queries and silently route the
  // trend query's `.all()` through the totals fixture instead.
  const totalsRoute = (all: Record<string, unknown>[]): FakeRoute => ({
    match: /COUNT\(\*\) as n/,
    all,
  });
  const trendRoute = (all: Record<string, unknown>[] = []): FakeRoute => ({
    match: /GROUP BY day, event_type/,
    all,
  });

  it("computes conversionRate as accepted ÷ shown", async () => {
    const { db } = createFakeD1([
      totalsRoute([
        { event_type: "install_prompt_shown", n: 10 },
        { event_type: "install_accepted", n: 4 },
        { event_type: "install_dismissed", n: 6 },
      ]),
      trendRoute(),
    ]);

    const result = await fetchInstallFunnel(db);

    expect(result).toMatchObject({ shown: 10, accepted: 4, dismissed: 6, conversionRate: 0.4 });
  });

  it("returns conversionRate null (not 0) when nothing has been shown yet", async () => {
    const { db } = createFakeD1([totalsRoute([]), trendRoute()]);

    const result = await fetchInstallFunnel(db);

    expect(result).toMatchObject({ shown: 0, accepted: 0, dismissed: 0, conversionRate: null });
  });

  it("buckets each event type's daily trend independently into 7-day sums", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = createFakeD1([
      totalsRoute([]),
      trendRoute([
        { day: today, event_type: "install_prompt_shown", count: 5 },
        { day: today, event_type: "install_accepted", count: 2 },
      ]),
    ]);

    const result = await fetchInstallFunnel(db);

    const expectedBuckets = Math.ceil(TREND_WINDOW_DAYS / TREND_BUCKET_DAYS);
    expect(result.shownTrend).toHaveLength(expectedBuckets);
    expect(result.shownTrend.at(-1)).toBe(5);
    expect(result.acceptedTrend.at(-1)).toBe(2);
    expect(result.dismissedTrend.every((n) => n === 0)).toBe(true);
  });
});

describe("fetchAppLaunchStats", () => {
  it("passes through the total and buckets the daily trend into weekly sums", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = createFakeD1([
      { match: /COUNT\(\*\) as total/, first: { total: 42 } },
      { match: /GROUP BY day/, all: [{ day: today, count: 5 }] },
    ]);

    const result = await fetchAppLaunchStats(db);

    expect(result.total).toBe(42);
    expect(result.weeklyTrend).toHaveLength(Math.ceil(TREND_WINDOW_DAYS / TREND_BUCKET_DAYS));
    expect(result.weeklyTrend.at(-1)).toBe(5);
  });

  it("defaults to 0 when the total query returns no row", async () => {
    const { db } = createFakeD1([
      { match: /COUNT\(\*\) as total/, first: null },
      { match: /GROUP BY day/, all: [] },
    ]);

    const result = await fetchAppLaunchStats(db);

    expect(result.total).toBe(0);
    expect(result.weeklyTrend.every((n) => n === 0)).toBe(true);
  });
});

describe("fetchPlayStats", () => {
  it("maps offline/online counts and top sets from snake_case columns", async () => {
    const { db } = createFakeD1([
      {
        match: /FROM plays/,
        first: { total: 100, offline_count: 30, online_count: 70 },
        all: [
          { set_id: "set-002", set_title: "Form:at 002", set_artist: "t.i.l.", play_count: 12 },
        ],
      },
    ]);

    const result = await fetchPlayStats(db);

    expect(result.total).toBe(100);
    expect(result.offlineCount).toBe(30);
    expect(result.onlineCount).toBe(70);
    expect(result.excludedCount).toBe(0);
    expect(result.topSets).toEqual([
      { setId: "set-002", setTitle: "Form:at 002", setArtist: "t.i.l.", playCount: 12 },
    ]);
  });

  it("computes excludedCount as total minus offline/online (plays predating is_offline tracking)", async () => {
    const { db } = createFakeD1([
      { match: /FROM plays/, first: { total: 292, offline_count: 9, online_count: 27 }, all: [] },
    ]);

    const result = await fetchPlayStats(db);

    expect(result.excludedCount).toBe(256);
  });
});

describe("fetchPushSubscriberStats", () => {
  it("maps standalone/tab counts and the weekly growth trend", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { db } = createFakeD1([
      {
        match: /COUNT\(\*\) as total[\s\S]*FROM push_subscriptions/,
        first: { total: 8, standalone_count: 5, tab_count: 3 },
      },
      { match: /GROUP BY day/, all: [{ day: today, count: 2 }] },
    ]);

    const result = await fetchPushSubscriberStats(db);

    expect(result).toMatchObject({ total: 8, standaloneCount: 5, tabCount: 3 });
    expect(result.weeklyGrowth.at(-1)).toBe(2);
  });

  it("never selects endpoint, p256dh, or auth off push_subscriptions", async () => {
    const { db, queries } = createFakeD1([
      {
        match: /COUNT\(\*\) as total[\s\S]*FROM push_subscriptions/,
        first: { total: 0, standalone_count: 0, tab_count: 0 },
      },
      { match: /GROUP BY day/, all: [] },
    ]);

    await fetchPushSubscriberStats(db);

    const pushSubQueries = queries.filter((q) => q.includes("push_subscriptions"));
    expect(pushSubQueries.length).toBeGreaterThan(0);
    for (const sql of pushSubQueries) {
      expect(sql).not.toMatch(/\bendpoint\b/);
      expect(sql).not.toMatch(/\bp256dh\b/);
      expect(sql).not.toMatch(/\bauth\b/);
    }
  });
});

describe("fetchClickStats", () => {
  // Same disambiguation need as fetchInstallFunnel above: the totals query
  // selects `event_type, COUNT...`, the per-set query selects `set_id,
  // event_type, COUNT...` — matching on the leading column list keeps the
  // two routes from colliding.
  const totalsRoute = (all: Record<string, unknown>[]): FakeRoute => ({
    match: /SELECT event_type, COUNT/,
    all,
  });
  const perSetRoute = (all: Record<string, unknown>[] = []): FakeRoute => ({
    match: /SELECT set_id, event_type/,
    all,
  });

  it("defaults save/share clicks to 0 when neither event type has rows", async () => {
    const { db } = createFakeD1([totalsRoute([]), perSetRoute()]);

    const result = await fetchClickStats(db);

    expect(result).toEqual({ saveClicks: 0, shareClicks: 0, perSet: [] });
  });

  it("reads save_click and share_click counts independently", async () => {
    const { db } = createFakeD1([
      totalsRoute([
        { event_type: "save_click", n: 7 },
        { event_type: "share_click", n: 2 },
      ]),
      perSetRoute(),
    ]);

    const result = await fetchClickStats(db);

    expect(result).toMatchObject({ saveClicks: 7, shareClicks: 2 });
  });

  it("groups per-set clicks, maps set_id to title/artist via the catalogue, ranked by total desc", async () => {
    const { db } = createFakeD1([
      totalsRoute([]),
      perSetRoute([
        { set_id: "set-002-til", event_type: "save_click", n: 1 },
        { set_id: "set-002-hubey", event_type: "save_click", n: 3 },
        { set_id: "set-002-hubey", event_type: "share_click", n: 2 },
      ]),
    ]);

    const result = await fetchClickStats(db);

    expect(result.perSet).toEqual([
      {
        setId: "set-002-hubey",
        setTitle: "Form:at 002",
        setArtist: "hubey",
        saveClicks: 3,
        shareClicks: 2,
      },
      {
        setId: "set-002-til",
        setTitle: "Form:at 002",
        setArtist: "t.i.l.",
        saveClicks: 1,
        shareClicks: 0,
      },
    ]);
  });

  it("falls back to the raw set_id when a click references a set no longer in the catalogue", async () => {
    const { db } = createFakeD1([
      totalsRoute([]),
      perSetRoute([{ set_id: "set-999-unknown", event_type: "save_click", n: 1 }]),
    ]);

    const result = await fetchClickStats(db);

    expect(result.perSet).toEqual([
      {
        setId: "set-999-unknown",
        setTitle: "set-999-unknown",
        setArtist: "unknown",
        saveClicks: 1,
        shareClicks: 0,
      },
    ]);
  });
});

describe("computeInstallToPushConversion", () => {
  it("computes pushSubscribers ÷ installAccepted", () => {
    expect(computeInstallToPushConversion(10, 6)).toEqual({
      installAccepted: 10,
      pushSubscribers: 6,
      ratio: 0.6,
    });
  });

  it("returns ratio null (not 0) when there are no accepted installs to divide by — an aggregate approximation has nothing to divide, not a 0% conversion", () => {
    expect(computeInstallToPushConversion(0, 3)).toEqual({
      installAccepted: 0,
      pushSubscribers: 3,
      ratio: null,
    });
  });
});

describe("computeTrackingStartDay", () => {
  const now = new Date("2026-07-28T00:00:00.000Z");

  it("returns null when there's no data at all", () => {
    expect(computeTrackingStartDay(null, now)).toBeNull();
  });

  it("returns the ISO day when real tracking started more recently than the 60-day window", () => {
    // 2026-07-15, 13 days before `now` — well inside the 60-day window.
    const earliest = new Date("2026-07-15T16:15:45.589Z").getTime();

    expect(computeTrackingStartDay(earliest, now)).toBe("2026-07-15");
  });

  it("returns null once real history reaches the full 60-day window — matches plays' no-caveat behavior", () => {
    // Exactly TREND_WINDOW_DAYS (60) before `now`: the window is fully real,
    // same state plays.weeklyPlays is already in, which needs no caption.
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - TREND_WINDOW_DAYS);

    expect(computeTrackingStartDay(windowStart.getTime(), now)).toBeNull();
  });

  it("returns null when real tracking predates the window by a wide margin (e.g. plays' ~84-day history)", () => {
    const earliest = new Date("2026-05-05T00:00:00.000Z").getTime();

    expect(computeTrackingStartDay(earliest, now)).toBeNull();
  });
});

describe("fetchEventsTrackingStart / fetchPushSubscriptionsTrackingStart", () => {
  it("fetchEventsTrackingStart reads MIN(created_at) from events", async () => {
    const { db } = createFakeD1([
      { match: /MIN\(created_at\).*FROM events/, first: { earliest: 1784132145589 } },
    ]);

    expect(await fetchEventsTrackingStart(db)).toBe(1784132145589);
  });

  it("fetchEventsTrackingStart returns null when events has no rows", async () => {
    const { db } = createFakeD1([{ match: /MIN\(created_at\).*FROM events/, first: null }]);

    expect(await fetchEventsTrackingStart(db)).toBeNull();
  });

  it("fetchPushSubscriptionsTrackingStart reads MIN(created_at) from push_subscriptions", async () => {
    const { db } = createFakeD1([
      { match: /MIN\(created_at\).*FROM push_subscriptions/, first: { earliest: 1784467482633 } },
    ]);

    expect(await fetchPushSubscriptionsTrackingStart(db)).toBe(1784467482633);
  });

  it("fetchPushSubscriptionsTrackingStart returns null when the table has no rows", async () => {
    const { db } = createFakeD1([
      { match: /MIN\(created_at\).*FROM push_subscriptions/, first: null },
    ]);

    expect(await fetchPushSubscriptionsTrackingStart(db)).toBeNull();
  });
});
