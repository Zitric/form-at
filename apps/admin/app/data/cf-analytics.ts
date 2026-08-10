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

// ── Web Analytics (RUM) ────────────────────────────────────────────────────
//
// A DIFFERENT dataset from the edge traffic above, and the contrast is the
// point: `rumPageloadEventsAdaptiveGroups` is beacon data from real browsers,
// account-scoped (`viewer.accounts`, keyed on the Web Analytics site tag),
// where `httpRequests1dGroups` is zone-scoped edge counting. Side by side the
// two numbers make the difference legible without relying on a caption.
//
// WHAT A VISIT IS, per Cloudflare's own definition: "A page view that
// originated from a different website or direct link. Cloudflare checks where
// the HTTP referer does not match the hostname. One visit can consist of
// multiple page views." So it counts ARRIVALS — navigating between pages on
// the site doesn't add to it, and neither does a reload. It is not sessions
// and not people. There is no unique-visitor metric: Web Analytics stores no
// cookie or identifier, so it cannot count distinct humans at all.
//
// BOTS ARE INCLUDED BY DEFAULT. Cloudflare's own dimension docs say the
// "Exclude Bots" dimension exists so "the resulting dataset will be a closer
// representation of real user traffic" — which only makes sense if bots are in
// there to begin with. The beacon is JavaScript, so it misses bots that don't
// execute JS, but headless ones do run it. This module therefore groups BY the
// `bot` dimension and sums only the non-bot rows, rather than filtering
// server-side: the filter's value representation isn't documented, and reading
// the dimension back needs no assumption about it. It also yields the bot share
// for free, which is worth showing.
//
// SAMPLING, and why the card shows a confidence interval rather than a sample
// rate. These are adaptive-sampled datasets, so every figure is an estimate.
// `avg { sampleInterval }` exists and reports the 1-in-N rate, but it only
// PROXIES the question a reader actually has — how much can I trust this
// number. Cloudflare answers that directly: `confidence { sum { visits } }`
// returns `estimate` with `lower`/`upper` bounds, plus `isValid` — "True if the
// confidence interval is valid, i.e. there is enough samples at low enough
// sample interval" — and `sampleSize`.
//
// So `isValid` is the gate, not a threshold we invented: true means show the
// estimate with its bounds and plot the trend; false means the interval is
// meaningless and the card says the sample is too small to characterise rather
// than drawing a curve over noise. `sampleInterval` is deliberately NOT shown
// alongside it: two disclosures of the same uncertainty compete, and the
// weaker, simpler one wins the reader's attention.

export type RumVisits = {
  /** Cloudflare's `visits` — arrivals from a different site or a direct link,
   *  bot rows excluded. Not sessions, not people. */
  visits: number;
  /** Pageload beacon events, bot rows excluded. Cloudflare's Web Analytics
   *  defines a page view as an HTML document load, and one beacon fires per
   *  pageload, so this is the page-view equivalent — `sum` has no pageViews
   *  field of its own. */
  pageloads: number;
  /** Share of ALL pageloads (0-1) that Cloudflare flagged as bot, before the
   *  exclusion above. Shown because it's the concrete evidence for why this
   *  card and edge_traffic disagree. */
  botShare: number;
  /** Lower/upper bounds of Cloudflare's confidence interval on `visits`. */
  visitsLower: number;
  visitsUpper: number;
  /** Cloudflare's own verdict, not a threshold we invented: "True if the
   *  confidence interval is valid, i.e. there is enough samples at low enough
   *  sample interval". False means the interval is meaningless — so the card
   *  suppresses the chart and the bounds rather than showing numbers nobody
   *  should read. */
  intervalValid: boolean;
  /** Confidence level the interval was computed at, echoed back by the API. */
  confidenceLevel: number;
  /** Samples behind the estimate — the concrete reason an interval is or isn't
   *  trustworthy. */
  sampleSize: number;
  /** Weekly buckets of non-bot visits, oldest first — same shape as every
   *  other trend. Only plotted when `intervalValid`. */
  weeklyVisits: number[];
  /** True when the query SUCCEEDED but the window held no rows — collection is
   *  new, or genuinely nothing was recorded. Distinct from a null return, which
   *  means we couldn't read at all. A real zero and a failed read look the same
   *  on screen unless the card is told which it has; edge_traffic can collapse
   *  them because its window is never legitimately empty, but a beacon that
   *  started today is empty for an entirely ordinary reason. */
  noDataInWindow: boolean;
  /** Days we ASKED for, i.e. min(Cloudflare's retention, our chart window).
   *  `windowDays` short of this means data genuinely starts later than
   *  retention allows — the beacon began collecting recently. Comparing
   *  `windowDays` against the chart maximum instead would fire permanently
   *  whenever retention is under 60 days, blaming collection for what is
   *  really retention. */
  requestedWindowDays: number;
  windowDays: number;
  startDay: string;
  boundaryKnown: boolean;
};

const RUM_SETTINGS_QUERY = `
  query RumRetention($accountTag: String!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        settings {
          rumPageloadEventsAdaptiveGroups { notOlderThan }
        }
      }
    }
  }`;

type RumSettingsData = {
  viewer?: {
    accounts?: { settings?: { rumPageloadEventsAdaptiveGroups?: { notOlderThan?: number } } }[];
  };
};

/** Account-scoped twin of `resolveWindowDays`. Same fallback rule: an
 *  unreadable boundary means we ask for the full window and render whatever
 *  comes back, with `boundaryKnown: false` so the card can disclose it. */
export async function resolveRumWindowDays(
  token: string,
  accountTag: string,
): Promise<{ days: number; fromBoundary: boolean }> {
  const data = await postGraphQL<RumSettingsData>(token, RUM_SETTINGS_QUERY, { accountTag });
  const seconds =
    data?.viewer?.accounts?.[0]?.settings?.rumPageloadEventsAdaptiveGroups?.notOlderThan;
  if (typeof seconds !== "number" || seconds <= 0) {
    return { days: EDGE_TRAFFIC_MAX_WINDOW_DAYS, fromBoundary: false };
  }
  const days = Math.floor(seconds / 86_400);
  return { days: Math.max(1, Math.min(days, EDGE_TRAFFIC_MAX_WINDOW_DAYS)), fromBoundary: true };
}

// `confidence` takes a REQUIRED `level` argument — omitting it fails the whole
// query with `error parsing args for "confidence": level: not a number`, inside
// an HTTP 200. Pinned rather than left to a default for two reasons: an
// unstated confidence level makes an interval uninterpretable (a 99% and a 50%
// interval are very different widths on identical data), and a default that
// shifted under us would silently change what the card claims. 0.95 is the
// convention a reader will assume, and the card states it.
export const RUM_CONFIDENCE_LEVEL = 0.95;

const RUM_QUERY = `
  query RumVisits($accountTag: String!, $siteTag: String!, $since: String!, $until: String!, $level: Float!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        rumPageloadEventsAdaptiveGroups(
          limit: 5000
          filter: { siteTag: $siteTag, date_geq: $since, date_leq: $until }
          orderBy: [date_ASC]
        ) {
          count
          dimensions { date bot }
          sum { visits }
          confidence(level: $level) {
            level
            sum { visits { estimate lower upper isValid sampleSize } }
          }
        }
      }
    }
  }`;

type RumData = {
  viewer?: {
    accounts?: {
      rumPageloadEventsAdaptiveGroups?: {
        count?: number;
        dimensions?: { date?: string; bot?: unknown };
        sum?: { visits?: number };
        confidence?: {
          level?: number;
          sum?: {
            visits?: {
              estimate?: number;
              lower?: number;
              upper?: number;
              isValid?: boolean;
              sampleSize?: number;
            };
          };
        };
      }[];
    }[];
  };
};

/** Cloudflare's `bot` dimension representation isn't documented — it could be
 *  0/1, "0"/"1", or a boolean. Treat anything falsy or an explicit zero-ish
 *  value as human rather than assuming one encoding. */
function isBotRow(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "0" && value.toLowerCase() !== "false";
  return false;
}

/**
 * Live Web Analytics read. Null on every failure path, exactly like
 * `fetchEdgeTraffic` — missing credentials, auth failure (a 403 here means the
 * token lacks Account Analytics:Read, which is a DIFFERENT permission from the
 * zone one edge_traffic needs), GraphQL error, timeout, or an empty window.
 */
export async function fetchRumVisits(
  token: string | undefined,
  accountTag: string | undefined,
  siteTag: string | undefined,
  now: Date = new Date(),
): Promise<RumVisits | null> {
  if (!token || !accountTag || !siteTag) return null;

  const { days: requestedDays, fromBoundary } = await resolveRumWindowDays(token, accountTag);
  const until = new Date(now);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - (requestedDays - 1));

  const data = await postGraphQL<RumData>(token, RUM_QUERY, {
    accountTag,
    siteTag,
    since: isoDay(since),
    until: isoDay(until),
    level: RUM_CONFIDENCE_LEVEL,
  });
  const rows = data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  // `data` present but no rows is a SUCCESSFUL read of an empty window — a real
  // zero, which §1's never-substitute-0 rule permits and in fact wants
  // distinguished. Only a failed read (null data) stays null.
  if (!data) return null;
  if (!rows?.length) {
    return {
      visits: 0,
      visitsLower: 0,
      visitsUpper: 0,
      intervalValid: false,
      confidenceLevel: 0,
      sampleSize: 0,
      pageloads: 0,
      botShare: 0,
      weeklyVisits: [],
      noDataInWindow: true,
      requestedWindowDays: requestedDays,
      windowDays: requestedDays,
      startDay: isoDay(since),
      boundaryKnown: fromBoundary,
    };
  }

  const human = rows.filter((r) => !isBotRow(r.dimensions?.bot));
  const allPageloads = rows.reduce((a, r) => a + (r.count ?? 0), 0);
  const botPageloads = allPageloads - human.reduce((a, r) => a + (r.count ?? 0), 0);

  const startDay = human[0]?.dimensions?.date ?? rows[0]?.dimensions?.date ?? isoDay(since);
  const spanDays = Math.round((Date.parse(isoDay(until)) - Date.parse(startDay)) / 86_400_000) + 1;

  // Rows are per (date, bot), so collapse to one count per day before filling.
  const perDay = new Map<string, number>();
  for (const r of human) {
    const day = r.dimensions?.date ?? "";
    perDay.set(day, (perDay.get(day) ?? 0) + (r.sum?.visits ?? 0));
  }
  const daily = fillDailyWindow(
    [...perDay].map(([day, count]) => ({ day, count })),
    Math.max(1, spanDays),
  );

  // Confidence is per-row; the card shows one figure for the window, so bounds
  // add and the validity flag is ANDed. A window is only as trustworthy as its
  // least trustworthy day — one invalid day makes the whole total's interval
  // meaningless, and reporting otherwise would launder it.
  const conf = human.map((r) => r.confidence?.sum?.visits);
  const hasConfidence = conf.some(Boolean);
  const estimate = conf.reduce((a, c) => a + (c?.estimate ?? 0), 0);

  return {
    // `estimate` IS the point estimate that `sum { visits }` reports — the
    // schema calls the interval "for the corresponding point estimate". Sum is
    // still queried and used as the fallback for any row without a confidence
    // block, so the card never shows a hole; it is never shown alongside the
    // estimate, because two numbers a reader has to reconcile is worse than one.
    visits: hasConfidence ? estimate : human.reduce((a, r) => a + (r.sum?.visits ?? 0), 0),
    visitsLower: conf.reduce((a, c) => a + (c?.lower ?? c?.estimate ?? 0), 0),
    visitsUpper: conf.reduce((a, c) => a + (c?.upper ?? c?.estimate ?? 0), 0),
    intervalValid: hasConfidence && conf.every((c) => c?.isValid !== false),
    confidenceLevel:
      human.find((r) => r.confidence?.level)?.confidence?.level ?? RUM_CONFIDENCE_LEVEL,
    sampleSize: conf.reduce((a, c) => a + (c?.sampleSize ?? 0), 0),
    pageloads: human.reduce((a, r) => a + (r.count ?? 0), 0),
    botShare: allPageloads > 0 ? botPageloads / allPageloads : 0,
    weeklyVisits: bucketByWeek(daily, TREND_BUCKET_DAYS),
    noDataInWindow: false,
    requestedWindowDays: requestedDays,
    windowDays: Math.max(1, spanDays),
    startDay,
    boundaryKnown: fromBoundary,
  };
}
