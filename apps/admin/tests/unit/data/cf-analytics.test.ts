import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDGE_TRAFFIC_MAX_WINDOW_DAYS,
  fetchEdgeTraffic,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveWindowDays", () => {
  it("converts Cloudflare's notOlderThan seconds into whole days", async () => {
    mockFetchSequence({ body: settingsBody(30 * 86_400) });
    expect(await resolveWindowDays(TOKEN, ZONE)).toBe(30);
  });

  it("clamps a retention longer than our chart window down to the chart window", async () => {
    mockFetchSequence({ body: settingsBody(365 * 86_400) });
    expect(await resolveWindowDays(TOKEN, ZONE)).toBe(EDGE_TRAFFIC_MAX_WINDOW_DAYS);
  });

  it("falls back to the full window when the boundary can't be read", async () => {
    // Cloudflare's settings node is documented but not guaranteed present for
    // every plan/dataset — an unreadable boundary must not break the card,
    // it just means the traffic query itself decides what comes back.
    mockFetchSequence({ body: settingsBody(null) });
    expect(await resolveWindowDays(TOKEN, ZONE)).toBe(EDGE_TRAFFIC_MAX_WINDOW_DAYS);
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

    const result = await fetchEdgeTraffic(TOKEN, ZONE, new Date("2026-08-03T12:00:00Z"));

    expect(result).toEqual({
      requests: 340,
      pageViews: 67,
      dailyRequests: [100, 150, 90],
      // 3, not the 30 requested — the caption must state what came back, so a
      // short window can't be presented as a full one.
      windowDays: 3,
      startDay: "2026-08-01",
    });
  });

  it("asks for the retention-clamped range, not a fixed 60 days", async () => {
    const fetchMock = mockFetchSequence(
      { body: settingsBody(7 * 86_400) },
      { body: trafficBody([{ date: "2026-08-03", requests: 5, pageViews: 1 }]) },
    );

    await fetchEdgeTraffic(TOKEN, ZONE, new Date("2026-08-07T12:00:00Z"));

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

    await fetchEdgeTraffic(TOKEN, ZONE, new Date("2026-08-03T12:00:00Z"));

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body).variables.zoneTag).toBe(ZONE);
  });
});
