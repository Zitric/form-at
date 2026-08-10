import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDGE_TRAFFIC_MAX_WINDOW_DAYS,
  MIN_PAGELOADS_FOR_BOT_SHARE,
  RUM_CONFIDENCE_LEVEL,
  fetchEdgeTraffic,
  fetchRumVisits,
  resolveRumWindowDays,
  resolveWindowDays,
} from "~/data/cf-analytics";

// The Cloudflare GraphQL API is never reachable from tests or CI, so every
// path here drives a mocked `fetch`. What's actually being locked: the card
// must degrade to null on EVERY failure, because the UI renders null as an
// explicit "no data" state and would otherwise show a 0 that reads as
// "no traffic" — a wrong fact, not a missing one.

const TOKEN = "test-token";
const ZONE = "zone-abc";

/** Queues responses in call order: settings query first, then traffic. */
function mockFetchSequence(...responses: { status?: number; body: unknown }[]) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
      status: r.status ?? 200,
      json: async () => r.body,
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

const settingsBody = (notOlderThan: number | null) => ({
  data: {
    viewer: {
      zones: [
        { settings: { httpRequests1dGroups: notOlderThan === null ? {} : { notOlderThan } } },
      ],
    },
  },
});

const trafficBody = (rows: { date: string; requests: number; pageViews: number }[]) => ({
  data: {
    viewer: {
      zones: [
        {
          httpRequests1dGroups: rows.map((r) => ({
            dimensions: { date: r.date },
            sum: { requests: r.requests, pageViews: r.pageViews },
          })),
        },
      ],
    },
  },
});

/** `fillDailyWindow` (shared with the D1 trends) reads the real clock, so the
 *  system time has to match the `now` handed to fetchEdgeTraffic or the filled
 *  series is anchored to a different day than the assertions expect. */
function freezeAt(iso: string): Date {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  return new Date(iso);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("resolveWindowDays", () => {
  it("converts Cloudflare's notOlderThan seconds into whole days", async () => {
    mockFetchSequence({ body: settingsBody(30 * 86_400) });
    expect(await resolveWindowDays(TOKEN, ZONE)).toEqual({ days: 30, fromBoundary: true });
  });

  it("clamps a retention longer than our chart window down to the chart window", async () => {
    mockFetchSequence({ body: settingsBody(365 * 86_400) });
    expect(await resolveWindowDays(TOKEN, ZONE)).toEqual({
      days: EDGE_TRAFFIC_MAX_WINDOW_DAYS,
      fromBoundary: true,
    });
  });

  it("falls back to the full window when the boundary can't be read", async () => {
    // Cloudflare's settings node is documented but not guaranteed present for
    // every plan/dataset — an unreadable boundary must not break the card,
    // it just means the traffic query itself decides what comes back.
    mockFetchSequence({ body: settingsBody(null) });
    // fromBoundary:false is what lets the card disclose that the cap was never
    // confirmed — the two cases are otherwise indistinguishable from outside.
    expect(await resolveWindowDays(TOKEN, ZONE)).toEqual({
      days: EDGE_TRAFFIC_MAX_WINDOW_DAYS,
      fromBoundary: false,
    });
  });
});

describe("fetchEdgeTraffic", () => {
  it("sums requests and page views, and reports the window it actually got", async () => {
    mockFetchSequence(
      { body: settingsBody(30 * 86_400) },
      {
        body: trafficBody([
          { date: "2026-08-01", requests: 100, pageViews: 20 },
          { date: "2026-08-02", requests: 150, pageViews: 35 },
          { date: "2026-08-03", requests: 90, pageViews: 12 },
        ]),
      },
    );

    const result = await fetchEdgeTraffic(TOKEN, ZONE, freezeAt("2026-08-03T12:00:00Z"));

    expect(result).toEqual({
      requests: 340,
      pageViews: 67,
      // Three days collapse into ONE weekly bucket — the shape TrendChart
      // expects. Passing the raw 3-day series would have drawn a 3-week axis.
      weeklyRequests: [340],
      // 3, not the 30 requested — the caption must state what came back, so a
      // short window can't be presented as a full one.
      windowDays: 3,
      startDay: "2026-08-01",
      boundaryKnown: true,
    });
  });

  it("returns WEEKLY buckets, not a daily series — the chart-axis bug", async () => {
    // The shipped bug: 60 daily values reached TrendChart, which derives its
    // axis as length x bucketDays, drawing a 413-day span captioned
    // "60 weeks" with the last label past today. 60 days must collapse to 9
    // buckets (8 full weeks + a 4-day tail), matching app_launches' "9 weeks".
    const days = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 5, 10));
      d.setUTCDate(d.getUTCDate() + i);
      return { date: d.toISOString().slice(0, 10), requests: 10, pageViews: 2 };
    });
    mockFetchSequence({ body: settingsBody(60 * 86_400) }, { body: trafficBody(days) });

    const result = await fetchEdgeTraffic(TOKEN, ZONE, freezeAt("2026-08-08T12:00:00Z"));

    expect(result?.weeklyRequests).toHaveLength(9);
    expect(result?.weeklyRequests.slice(0, 8)).toEqual(Array(8).fill(70));
    // 60 days of 10 requests, regardless of how they bucket.
    expect(result?.requests).toBe(600);
    expect(result?.windowDays).toBe(60);
  });

  it("asks for the retention-clamped range, not a fixed 60 days", async () => {
    const fetchMock = mockFetchSequence(
      { body: settingsBody(7 * 86_400) },
      { body: trafficBody([{ date: "2026-08-03", requests: 5, pageViews: 1 }]) },
    );

    await fetchEdgeTraffic(TOKEN, ZONE, freezeAt("2026-08-07T12:00:00Z"));

    const trafficCall = JSON.parse(fetchMock.mock.calls[1][1].body);
    // 7-day window ending today → since is 6 days back, inclusive of both ends.
    expect(trafficCall.variables.since).toBe("2026-08-01");
    expect(trafficCall.variables.until).toBe("2026-08-07");
  });

  it("returns null with no credentials, without calling the API at all", async () => {
    const fetchMock = mockFetchSequence({ body: settingsBody(30 * 86_400) });

    expect(await fetchEdgeTraffic(undefined, ZONE)).toBeNull();
    expect(await fetchEdgeTraffic(TOKEN, undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on an auth failure rather than a zero", async () => {
    // 403 is the shape of a token missing Zone Analytics:Read, or scoped to
    // the wrong zone — the single most likely misconfiguration.
    mockFetchSequence({ status: 403, body: {} });
    expect(await fetchEdgeTraffic(TOKEN, ZONE)).toBeNull();
  });

  it("returns null when GraphQL reports errors inside a 200 response", async () => {
    // GraphQL signals failure in the body, not the status code — checking
    // res.ok alone would let an error through as "no rows".
    mockFetchSequence({ body: { errors: [{ message: "insufficient permissions" }] } });
    expect(await fetchEdgeTraffic(TOKEN, ZONE)).toBeNull();
  });

  it("returns null when the API throws (timeout, network, non-JSON)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );
    expect(await fetchEdgeTraffic(TOKEN, ZONE)).toBeNull();
  });

  it("returns null for an empty window instead of an all-zero chart", async () => {
    mockFetchSequence({ body: settingsBody(30 * 86_400) }, { body: trafficBody([]) });
    expect(await fetchEdgeTraffic(TOKEN, ZONE)).toBeNull();
  });

  it("sends the bearer token and the zone tag", async () => {
    const fetchMock = mockFetchSequence(
      { body: settingsBody(30 * 86_400) },
      { body: trafficBody([{ date: "2026-08-03", requests: 5, pageViews: 1 }]) },
    );

    await fetchEdgeTraffic(TOKEN, ZONE, freezeAt("2026-08-03T12:00:00Z"));

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body).variables.zoneTag).toBe(ZONE);
  });
});

const rumSettingsBody = (notOlderThan: number | null) => ({
  data: {
    viewer: {
      accounts: [
        {
          settings: {
            rumPageloadEventsAdaptiveGroups: notOlderThan === null ? {} : { notOlderThan },
          },
        },
      ],
    },
  },
});

const rumBody = (
  rows: {
    date: string;
    bot?: unknown;
    count: number;
    visits: number;
    estimate?: number;
    lower?: number;
    upper?: number;
    isValid?: boolean;
    sampleSize?: number;
    sampleInterval?: number;
  }[],
) => ({
  data: {
    viewer: {
      accounts: [
        {
          rumPageloadEventsAdaptiveGroups: rows.map((r) => ({
            count: r.count,
            dimensions: { date: r.date, bot: r.bot ?? 0 },
            avg: { sampleInterval: r.sampleInterval ?? 1 },
            sum: { visits: r.visits },
            confidence: {
              level: 0.95,
              sum: {
                visits: {
                  estimate: r.estimate ?? r.visits,
                  lower: r.lower ?? r.visits,
                  upper: r.upper ?? r.visits,
                  isValid: r.isValid ?? true,
                  sampleSize: r.sampleSize ?? r.visits,
                },
              },
            },
          })),
        },
      ],
    },
  },
});

describe("resolveRumWindowDays", () => {
  it("reads the boundary from the ACCOUNT settings node, not the zone one", async () => {
    // Distinct nesting from resolveWindowDays (accounts vs zones) — the most
    // plausible copy-paste bug in this pair, and it would fail silently by
    // falling back to the full window.
    mockFetchSequence({ body: rumSettingsBody(14 * 86_400) });
    expect(await resolveRumWindowDays(TOKEN, "acct")).toEqual({ days: 14, fromBoundary: true });
  });

  it("falls back to the full window, flagged, when the boundary is unreadable", async () => {
    mockFetchSequence({ body: rumSettingsBody(null) });
    expect(await resolveRumWindowDays(TOKEN, "acct")).toEqual({
      days: EDGE_TRAFFIC_MAX_WINDOW_DAYS,
      fromBoundary: false,
    });
  });
});

describe("fetchRumVisits", () => {
  it("excludes bot rows and reports the bot counts behind the exclusion", async () => {
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-07", bot: 0, count: 70, visits: 40 },
          { date: "2026-08-07", bot: 1, count: 30, visits: 25 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    // Only the human row counts toward visits/page_loads — the whole point of
    // this card is that it isn't edge traffic.
    expect(result?.visits).toBe(40);
    expect(result?.pageloads).toBe(70);
    // Raw counts, not a share: the card decides whether the denominator
    // supports a percentage.
    expect(result?.botPageloads).toBe(30);
    expect(result?.totalPageloads).toBe(100);
  });

  it("treats string and boolean bot encodings as bot, since the schema doesn't document one", async () => {
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-07", bot: "0", count: 10, visits: 5 },
          { date: "2026-08-07", bot: "1", count: 10, visits: 5 },
          { date: "2026-08-07", bot: true, count: 10, visits: 5 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    expect(result?.visits).toBe(5);
    expect(result?.pageloads).toBe(10);
  });

  it("sums the interval bounds and echoes the confidence level", async () => {
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-06", count: 5, visits: 5, estimate: 5, lower: 3, upper: 8 },
          { date: "2026-08-07", count: 5, visits: 5, estimate: 5, lower: 4, upper: 9 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    expect(result?.visits).toBe(10);
    expect(result?.visitsLower).toBe(7);
    expect(result?.visitsUpper).toBe(17);
    expect(result?.confidenceLevel).toBe(0.95);
    expect(result?.intervalValid).toBe(true);
  });

  it("marks the whole window invalid if ANY day's interval is invalid", async () => {
    // A window is only as trustworthy as its least trustworthy day — reporting
    // a valid interval over a mix would launder the bad one.
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-06", count: 5, visits: 5, isValid: true },
          { date: "2026-08-07", count: 5, visits: 5, isValid: false, sampleSize: 2 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    expect(result?.intervalValid).toBe(false);
    expect(result?.sampleSize).toBe(7);
  });

  it("returns null when no row carries a confidence block — a failed read, not zero", async () => {
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: {
          data: {
            viewer: {
              accounts: [
                {
                  rumPageloadEventsAdaptiveGroups: [
                    {
                      count: 9,
                      dimensions: { date: "2026-08-07", bot: 0 },
                      sum: { visits: 9 },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    // `sum { visits }` is no longer queried (it was proven identical to
    // `estimate`), so a response with no confidence block carries no visit
    // count at all. Reporting 0 would state "nobody visited" for something we
    // couldn't read — §1 forbids exactly that substitution.
    expect(result).toBeNull();
  });

  it("buckets visits weekly, like every other trend", async () => {
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-01", count: 2, visits: 2 },
          { date: "2026-08-02", count: 3, visits: 3 },
          { date: "2026-08-03", count: 4, visits: 4 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-03T12:00:00Z"));

    expect(result?.weeklyVisits).toEqual([9]);
    expect(result?.windowDays).toBe(3);
  });

  it("holds back the bot percentage until the denominator supports one", async () => {
    // Real observed volume: single-digit daily samples. 1 bot in 12 page loads
    // is "8%", and one more bot makes it "17%" — a swing that reads as a
    // finding when it is noise. The data layer therefore reports counts and
    // leaves the percentage to the card's own MIN_PAGELOADS_FOR_BOT_SHARE
    // floor — deliberately not notify_funnel's, which is scaled for prompt
    // impressions rather than page loads.
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-09", bot: 0, count: 11, visits: 11 },
          { date: "2026-08-09", bot: 1, count: 1, visits: 1 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-09T12:00:00Z"));

    expect(result?.botPageloads).toBe(1);
    expect(result?.totalPageloads).toBe(12);
    // No precomputed share to accidentally render.
    expect(result).not.toHaveProperty("botShare");
    // And this volume is well under the floor the card gates the percentage on.
    expect(result?.totalPageloads).toBeLessThan(MIN_PAGELOADS_FOR_BOT_SHARE);
  });

  it("reports the requested window alongside the one it got, so a short retention isn't mistaken for a late start", async () => {
    // Retention allows 14 days; only 3 days of data exist. The card needs BOTH
    // numbers to say "started collecting recently" honestly — comparing the 3
    // against a hardcoded 60 would fire that caption even when the beacon had
    // been collecting for the whole retention period.
    mockFetchSequence(
      { body: rumSettingsBody(14 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-05", count: 2, visits: 2 },
          { date: "2026-08-06", count: 2, visits: 2 },
          { date: "2026-08-07", count: 2, visits: 2 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    expect(result?.requestedWindowDays).toBe(14);
    expect(result?.windowDays).toBe(3);
  });

  it("does not AND isValid across days — that could never unlock at real traffic", async () => {
    // The bug this replaced: `every(isValid)` over ~57 daily rows. At this
    // scale there is always a quiet day with n=1, so the AND was permanently
    // false and the chart could never appear however much traffic grew — a
    // permanent suppression that looked temporary. Validity is now a property
    // of the summed bounds, which one quiet day cannot veto.
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-06", count: 80, visits: 80, lower: 60, upper: 100, isValid: true },
          { date: "2026-08-07", count: 1, visits: 1, lower: 1, upper: 1, isValid: false },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    expect(result?.intervalValid).toBe(true);
    expect(result?.visitsLower).toBe(61);
    expect(result?.visitsUpper).toBe(101);
  });

  it("treats degenerate summed bounds as no usable interval", async () => {
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-07", count: 4, visits: 4, lower: 4, upper: 4, isValid: false },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    // Bounds that equal the estimate carry no information, whatever Cloudflare
    // says about them.
    expect(result?.intervalValid).toBe(false);
    // But unsampled, so the counts are exact and the card still charts them.
    expect(result?.sampleInterval).toBe(1);
  });

  it("reports the coarsest sampleInterval, so a sampled stretch can't hide", async () => {
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: rumBody([
          { date: "2026-08-06", count: 5, visits: 5, sampleInterval: 1 },
          { date: "2026-08-07", count: 5, visits: 5, sampleInterval: 10 },
        ]),
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-07T12:00:00Z"));

    expect(result?.sampleInterval).toBe(10);
  });

  it("returns null without credentials, and never calls the API", async () => {
    const fetchMock = mockFetchSequence({ body: rumSettingsBody(30 * 86_400) });

    expect(await fetchRumVisits(undefined, "acct", "site")).toBeNull();
    expect(await fetchRumVisits(TOKEN, undefined, "site")).toBeNull();
    expect(await fetchRumVisits(TOKEN, "acct", undefined)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on a 403 — the shape of a token missing Account Analytics:Read", async () => {
    mockFetchSequence({ status: 403, body: {} });
    expect(await fetchRumVisits(TOKEN, "acct", "site")).toBeNull();
  });

  it("returns null on GraphQL errors inside a 200 — a failed read", async () => {
    mockFetchSequence({ body: { errors: [{ message: "no access" }] } });
    expect(await fetchRumVisits(TOKEN, "acct", "site")).toBeNull();
  });

  it("reports an empty window as a real zero, NOT as a failed read", async () => {
    // The distinction the card depends on: a beacon that started collecting
    // today returns no rows for an entirely ordinary reason, and telling the
    // reader "credentials missing" would send them hunting a bug that isn't
    // there. Only an unreadable response stays null.
    mockFetchSequence({ body: rumSettingsBody(30 * 86_400) }, { body: rumBody([]) });

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-10T12:00:00Z"));

    expect(result).not.toBeNull();
    expect(result?.noDataInWindow).toBe(true);
    expect(result?.visits).toBe(0);
    expect(result?.intervalValid).toBe(false);
  });

  it("sends the required confidence level — omitting it fails the whole query", async () => {
    // `confidence` takes a REQUIRED `level` arg. Without it Cloudflare returns
    // HTTP 200 carrying `error parsing args for "confidence": level: not a
    // number`, so every load silently produced a failed read. This asserts the
    // variable actually goes out.
    const fetchMock = mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      { body: rumBody([{ date: "2026-08-10", count: 1, visits: 1 }]) },
    );

    await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-10T12:00:00Z"));

    const call = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(call.variables.level).toBe(RUM_CONFIDENCE_LEVEL);
    expect(call.query).toContain("confidence(level: $level)");
  });

  it("falls back to the requested level if the API doesn't echo one", async () => {
    // A 0 here would render "0% interval", which is worse than restating our
    // own input.
    mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      {
        body: {
          data: {
            viewer: {
              accounts: [
                {
                  rumPageloadEventsAdaptiveGroups: [
                    {
                      count: 1,
                      dimensions: { date: "2026-08-10", bot: 0 },
                      sum: { visits: 1 },
                      confidence: {
                        sum: {
                          visits: { estimate: 1, lower: 1, upper: 1, isValid: true, sampleSize: 1 },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    );

    const result = await fetchRumVisits(TOKEN, "acct", "site", freezeAt("2026-08-10T12:00:00Z"));

    expect(result?.confidenceLevel).toBe(RUM_CONFIDENCE_LEVEL);
  });

  it("sends the account tag and site tag", async () => {
    const fetchMock = mockFetchSequence(
      { body: rumSettingsBody(30 * 86_400) },
      { body: rumBody([{ date: "2026-08-07", count: 1, visits: 1 }]) },
    );

    await fetchRumVisits(TOKEN, "acct-1", "site-1", freezeAt("2026-08-07T12:00:00Z"));

    const vars = JSON.parse(fetchMock.mock.calls[1][1].body).variables;
    expect(vars.accountTag).toBe("acct-1");
    expect(vars.siteTag).toBe("site-1");
  });
});
