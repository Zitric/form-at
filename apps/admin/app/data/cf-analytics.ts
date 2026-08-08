// Cloudflare zone HTTP analytics, read live from the GraphQL Analytics API.
//
// WHAT THIS MEASURES, and why the card must not say "visitors": this is
// `httpRequests1dGroups` — HTTP requests counted at Cloudflare's EDGE. It
// includes bots, crawlers, uptime pingers and asset requests. Cloudflare Web
// Analytics measures something different (real browsers running a beacon, no
// bots), so the two numbers WILL disagree, potentially by an order of
// magnitude on a small site. Neither is wrong; they count different things.
// Every label and caption downstream must say "requests at the edge", never
// "people" — see UsageTab's edge_traffic card.
//
// NO PERSISTENCE. This is a live read on each dashboard load; nothing is
// archived into D1. If Cloudflare ages the data out, it's gone from this card
// too — that's accepted, the first-party D1 metrics are the ones we own.
//
// Credentials come from Cloudflare Pages env on form-at-admin and are absent
// everywhere else (local dev, CI, tests). Every failure path returns null so
// the card renders an explicit empty state — NEVER a zero, which would read as
// "no traffic" rather than "no data".

import { TREND_BUCKET_DAYS, bucketByWeek, fillDailyWindow } from "@form-at/data/set-stats";

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

// Matches the 60-day window every other trend on the dashboard uses, so the
// charts are visually comparable. The real window is min(this, whatever
// Cloudflare's retention actually allows) — see resolveWindowDays.
export const EDGE_TRAFFIC_MAX_WINDOW_DAYS = 60;

// A slow Cloudflare API must not hold up the whole dashboard: every other card
// is a local D1 read. On timeout the traffic card degrades and the rest of the
// page renders normally.
const REQUEST_TIMEOUT_MS = 8000;

export type EdgeTraffic = {
  /** Total edge HTTP requests across the window. Not people, not sessions. */
  requests: number;
  /** Cloudflare's own pageViews sub-count — still edge-side, still bot-inclusive. */
  pageViews: number;
  /** WEEKLY buckets, oldest first — the shape `TrendChart` expects, same as
   *  `AppLaunchStats.weeklyTrend` and `SetStats.weeklyPlays`. Passing a daily
   *  series here renders a confident, wrong chart: the axis is derived from
   *  `length × bucketDays`, so 60 daily values draw a 413-day span labelled
   *  "60 weeks". Bucket before it reaches the component. */
  weeklyRequests: number[];
  /** Days of data actually covered — derived from the oldest row returned, not
   *  from the window we asked for. */
  windowDays: number;
  /** ISO date (YYYY-MM-DD) of the oldest day in the window. */
  startDay: string;
  /** False when Cloudflare's retention boundary couldn't be read and the
   *  full-window fallback fired. The row values stay substantiated either way
   *  (`windowDays` counts real returned days), but a failed boundary read is
   *  otherwise invisible from outside — surfaced so it can't hide. */
  boundaryKnown: boolean;
};

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] };

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function postGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // A 403 here almost always means the token lacks Zone Analytics:Read, or
    // wasn't scoped to this zone. Deliberately not surfaced as a distinct UI
    // state: from the dashboard's point of view "we couldn't read it" is one
    // outcome, and spelling out auth failures on an Access-gated page helps
    // nobody debug faster than the wrangler command in PWA_PROGRESS does.
    if (!res.ok) return null;
    const body = (await res.json()) as GraphQLResponse<T>;
    // GraphQL reports errors in a 200 body — checking res.ok alone is not enough.
    if (body.errors?.length || !body.data) return null;
    return body.data;
  } catch {
    // Network failure, timeout, or non-JSON body.
    return null;
  }
}

const SETTINGS_QUERY = `
  query Retention($zoneTag: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        settings {
          httpRequests1dGroups { notOlderThan }
        }
      }
    }
  }`;

type SettingsData = {
  viewer?: { zones?: { settings?: { httpRequests1dGroups?: { notOlderThan?: number } } }[] };
};

/**
 * How many days back this zone can actually be queried.
 *
 * Cloudflare does not publish per-plan retention — their docs say to read the
 * boundary per zone from the settings node, which returns `notOlderThan` in
 * SECONDS. Asking for more than the boundary allows returns an error, and
 * padding a chart with empty buckets for days that were never retained reads
 * as "no traffic" rather than "not retained".
 *
 * Falls back to the full window when the boundary can't be read: the traffic
 * query itself is then the thing that fails or truncates, and we render
 * whatever days actually come back.
 */
export async function resolveWindowDays(
  token: string,
  zoneTag: string,
): Promise<{ days: number; fromBoundary: boolean }> {
  const data = await postGraphQL<SettingsData>(token, SETTINGS_QUERY, { zoneTag });
  const seconds = data?.viewer?.zones?.[0]?.settings?.httpRequests1dGroups?.notOlderThan;
  if (typeof seconds !== "number" || seconds <= 0) {
    return { days: EDGE_TRAFFIC_MAX_WINDOW_DAYS, fromBoundary: false };
  }
  const days = Math.floor(seconds / 86_400);
  return { days: Math.max(1, Math.min(days, EDGE_TRAFFIC_MAX_WINDOW_DAYS)), fromBoundary: true };
}

const TRAFFIC_QUERY = `
  query EdgeTraffic($zoneTag: String!, $since: String!, $until: String!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(
          limit: 1000
          filter: { date_geq: $since, date_leq: $until }
          orderBy: [date_ASC]
        ) {
          dimensions { date }
          sum { requests pageViews }
        }
      }
    }
  }`;

type TrafficData = {
  viewer?: {
    zones?: {
      httpRequests1dGroups?: {
        dimensions?: { date?: string };
        sum?: { requests?: number; pageViews?: number };
      }[];
    }[];
  };
};

/**
 * Live edge-traffic read. Returns null on every failure path — missing
 * credentials, auth failure, GraphQL error, timeout, or a window with no rows
 * at all. Callers must render an explicit "no data" state for null and must
 * NOT substitute 0.
 */
export async function fetchEdgeTraffic(
  token: string | undefined,
  zoneTag: string | undefined,
  now: Date = new Date(),
): Promise<EdgeTraffic | null> {
  if (!token || !zoneTag) return null;

  const { days: requestedDays, fromBoundary } = await resolveWindowDays(token, zoneTag);
  const until = new Date(now);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - (requestedDays - 1));

  const data = await postGraphQL<TrafficData>(token, TRAFFIC_QUERY, {
    zoneTag,
    since: isoDay(since),
    until: isoDay(until),
  });
  const rows = data?.viewer?.zones?.[0]?.httpRequests1dGroups;
  // An empty array is a real answer ("retained, but nothing recorded") that is
  // indistinguishable to a reader from "we couldn't read it" once it's a flat
  // chart — so both collapse to the same explicit empty state.
  if (!rows?.length) return null;

  const startDay = rows[0]?.dimensions?.date ?? isoDay(since);

  // Span from the oldest real row to today, inclusive — the honest width of
  // what came back, rather than the width we asked for.
  const spanDays = Math.round((Date.parse(isoDay(until)) - Date.parse(startDay)) / 86_400_000) + 1;

  // `fillDailyWindow` (shared with every D1 trend) both anchors the series to
  // TODAY and inserts 0 for any day Cloudflare omitted, so the chart's axis —
  // which is reconstructed backwards from now — lines up with the data.
  // `bucketByWeek` then converts to the WEEKLY buckets TrendChart expects; the
  // same two-step every other trend uses (see admin-stats.ts's weeklyTrend).
  const daily = fillDailyWindow(
    rows.map((r) => ({ day: r.dimensions?.date ?? "", count: r.sum?.requests ?? 0 })),
    Math.max(1, spanDays),
  );

  return {
    requests: rows.reduce((a, r) => a + (r.sum?.requests ?? 0), 0),
    pageViews: rows.reduce((a, r) => a + (r.sum?.pageViews ?? 0), 0),
    weeklyRequests: bucketByWeek(daily, TREND_BUCKET_DAYS),
    windowDays: Math.max(1, spanDays),
    startDay,
    boundaryKnown: fromBoundary,
  };
}
