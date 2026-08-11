// The Cloudflare Web Analytics (RUM) daily read, shared by the two things that
// need it: `apps/admin`'s live `visits` card and `apps/rum-archiver`'s cron.
//
// It lives here because apps never import each other (CLAUDE.md §0) — but the
// stronger reason is drift. The query's `confidence(level:)` argument is
// REQUIRED, and omitting it fails inside an HTTP 200 with an error nobody sees
// unless they read the body; that bug ran undetected until a live diagnostic
// caught it. A second copy of this query in the archiver would be a second
// place for that class of mistake to hide. One copy, both callers.
//
// Worker-safe: `fetch` and `AbortSignal.timeout` only, no Node or DOM globals,
// because this runs in the Workers runtime on both sides.

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

// A slow Cloudflare API must not hold up a dashboard render or wedge a cron
// run. Same budget both sides.
const REQUEST_TIMEOUT_MS = 8000;

/** `confidence` takes a REQUIRED `level` argument — omitting it fails the whole
 *  query with `error parsing args for "confidence": level: not a number`,
 *  returned inside an HTTP 200. Pinned rather than left to a default: an
 *  unstated confidence level makes an interval uninterpretable, and a default
 *  that shifted under us would silently change what the card claims. */
export const RUM_CONFIDENCE_LEVEL = 0.95;

/** Cloudflare keeps beacon data unsampled for 7 days, then aggregates it to
 *  ~10%. Both the live card and the archiver work inside that window — the card
 *  so its figures are exact, the archiver so it captures rows before they
 *  degrade. A capture that fires later than this stores already-degraded rows,
 *  which is what `sample_interval` on `rum_daily` exists to record. */
export const RUM_UNSAMPLED_DAYS = 7;

/** One (date, bot) group, exactly as Cloudflare returns it. Deliberately raw:
 *  the archiver stores these verbatim so a later change to how we classify or
 *  aggregate can be re-derived from what was captured, rather than being lost
 *  at write time. */
export type RumGroupRow = {
  count?: number;
  dimensions?: { date?: string; bot?: unknown };
  avg?: { sampleInterval?: number };
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
};

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
          avg { sampleInterval }
          confidence(level: $level) {
            level
            sum { visits { estimate lower upper isValid sampleSize } }
          }
        }
      }
    }
  }`;

type RumResponse = {
  data?: { viewer?: { accounts?: { rumPageloadEventsAdaptiveGroups?: RumGroupRow[] }[] } };
  errors?: { message: string }[];
};

/** ISO day (YYYY-MM-DD) in UTC — the form Cloudflare's `date` dimension uses. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Cloudflare's `bot` dimension encoding isn't documented — it has been seen as
 *  a number, and could plausibly be `"0"`/`"1"` or a boolean. Normalise all
 *  three rather than assuming one, and treat anything unrecognised as human so
 *  a shape change under-reports bots instead of silently discarding real rows. */
export function isBotRow(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "0" && value.toLowerCase() !== "false";
  return false;
}

/**
 * Fetch raw daily RUM groups for a date range.
 *
 * Returns `null` on EVERY failure — missing credentials, a non-2xx, a GraphQL
 * `errors` array inside a 200 body, a timeout, or an unparseable response.
 * Callers must treat null as "couldn't read", never as zero: the archiver must
 * not write rows it didn't get, and the card must not render 0 visits for a
 * failed read. An empty array is a different thing — a successful read of a
 * window with no data — and is returned as `[]`.
 */
export async function fetchRumGroups(opts: {
  token: string | undefined;
  accountTag: string | undefined;
  siteTag: string | undefined;
  since: string;
  until: string;
  level?: number;
}): Promise<RumGroupRow[] | null> {
  const { token, accountTag, siteTag, since, until } = opts;
  if (!token || !accountTag || !siteTag) return null;

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: RUM_QUERY,
        variables: {
          accountTag,
          siteTag,
          since,
          until,
          level: opts.level ?? RUM_CONFIDENCE_LEVEL,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // A 403 here means the token lacks Account Analytics:Read — a DIFFERENT
    // permission from the zone-scoped one edge_traffic uses.
    if (!res.ok) return null;
    const body = (await res.json()) as RumResponse;
    // Cloudflare reports query errors inside a 200 body. Checking the status
    // alone is exactly how the missing `level` argument went undiagnosed.
    if (body.errors?.length || !body.data) return null;
    return body.data.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
  } catch {
    return null;
  }
}

/**
 * The upsert behind `rum_daily`, kept here so the archiver and `schema.sql`'s
 * documented copy can't drift.
 *
 * The `WHERE excluded.sample_interval <= rum_daily.sample_interval` guard is
 * the whole point. A run that fires late re-fetches days that have aged past
 * the unsampled window and come back EXTRAPOLATED; without the guard that run
 * would overwrite exact rows with degraded ones — destroying the data the
 * archive exists to preserve, irreversibly, and invisibly until someone
 * compared numbers months later. `<=` not `<` so an equal-quality re-run still
 * refreshes (idempotent re-runs must work) and a later exact capture can still
 * UPGRADE a degraded row. Never remove it.
 */
export const RUM_UPSERT_SQL = `INSERT INTO rum_daily
    (day, is_bot, page_loads, visits, sample_size, sample_interval, captured_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(day, is_bot) DO UPDATE SET
    page_loads      = excluded.page_loads,
    visits          = excluded.visits,
    sample_size     = excluded.sample_size,
    sample_interval = excluded.sample_interval,
    captured_at     = excluded.captured_at
  WHERE excluded.sample_interval <= rum_daily.sample_interval`;

/**
 * The capture-run log behind `rum_capture_runs`.
 *
 * Every run writes one of these, INCLUDING a run that stores nothing. That is
 * the point: coverage cannot be read off `rum_daily`, because a window with no
 * traffic produces no rows and therefore no `captured_at`, leaving a healthy run
 * indistinguishable from a run that never happened. The reader then draws a
 * genuinely quiet week as "nobody looked" — the exact conflation the history
 * card exists to prevent.
 *
 * `since`/`until` are stored rather than recomputed from `captured_at`, so
 * changing `RUM_UNSAMPLED_DAYS` can't retroactively rewrite what past runs
 * observed. `OR REPLACE` keeps a same-millisecond re-run idempotent.
 */
export const RUM_RUN_LOG_SQL = `INSERT OR REPLACE INTO rum_capture_runs
    (captured_at, since, until, ok, rows_fetched, rows_written, reason)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

/** The bound values for one `RUM_UPSERT_SQL` execution, in order. Exported so
 *  the mapping from a Cloudflare row to a stored row is testable without a
 *  database. */
export function toUpsertValues(
  row: RumGroupRow,
  capturedAt: number,
): [string, number, number, number, number | null, number, number] | null {
  const day = row.dimensions?.date;
  const visits = row.confidence?.sum?.visits;
  // No day means the row can't be keyed; no estimate means there's nothing to
  // store. Skip rather than writing a 0 that would read as "no visits".
  if (!day || typeof visits?.estimate !== "number") return null;
  return [
    day,
    isBotRow(row.dimensions?.bot) ? 1 : 0,
    row.count ?? 0,
    visits.estimate,
    typeof visits.sampleSize === "number" ? visits.sampleSize : null,
    row.avg?.sampleInterval ?? 1,
    capturedAt,
  ];
}
