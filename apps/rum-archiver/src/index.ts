/// <reference types="@cloudflare/workers-types" />

// Archives Cloudflare Web Analytics (RUM) daily rows into D1 before Cloudflare
// degrades them. See IMPROVEMENTS.md #12 and `rum_daily` in
// apps/web/schema.sql for the why.
//
// WHY THIS IS A STANDALONE WORKER rather than part of apps/admin: Pages
// Functions cannot run cron. Their API reference exposes only HTTP handlers
// (`onRequest*`) with no scheduled handler, and Cloudflare's guidance is to use
// a Worker instead. GitHub Actions `schedule` was the alternative and was
// rejected: it disables itself after 60 days without a COMMIT, which on a
// project heading toward low activity means the archive stops quietly and
// permanently about two months after the last push — the exact failure this is
// meant to survive. Cloudflare has no notion of repository activity, so a cron
// here keeps running whether or not anyone is committing.
//
// EVERY RUN RE-FETCHES THE WHOLE UNSAMPLED WINDOW and upserts, rather than
// capturing only yesterday. A missed run then costs nothing as long as another
// lands within the window, so the trigger doesn't have to be perfectly
// reliable. It does NOT rescue a trigger that stops permanently — that's why
// the trigger choice above still mattered.

import {
  RUM_UNSAMPLED_DAYS,
  RUM_UPSERT_SQL,
  fetchRumGroups,
  isoDay,
  toUpsertValues,
} from "@form-at/data/rumArchive";
import { WEB_ANALYTICS_SITE_TAG } from "@form-at/data/webAnalytics";

type Env = {
  /** D1 binding — writes go through this, NOT the REST API, which is why the
   *  Worker's API token needs no D1 permission at all. */
  DB: D1Database;
  /** Cloudflare API token scoped to Account → Account Analytics → Read, and
   *  nothing else. Deliberately a SEPARATE token from the admin dashboard's,
   *  not a copy: the dashboard's also carries Zone → Analytics → Read for
   *  edge_traffic, which this never needs. Two narrow tokens rotate
   *  independently; two copies of one token must roll together. */
  CF_ANALYTICS_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  /** Optional shared secret guarding the manual-run route. Without it the route
   *  is disabled entirely rather than left open. */
  ARCHIVE_TRIGGER_SECRET?: string;
};

export type CaptureResult = {
  ok: boolean;
  reason?: string;
  since: string;
  until: string;
  rowsFetched: number;
  rowsWritten: number;
  rowsSkipped: number;
};

/**
 * Fetch the trailing unsampled window and upsert every row.
 *
 * Returns a result object rather than throwing, so the scheduled handler can
 * log it and the manual route can return it as JSON. A failed READ writes
 * nothing at all — a partial or empty write would look identical to a quiet day
 * in the data, and gaps here are invisible after the fact.
 */
export async function captureWindow(env: Env, now: Date = new Date()): Promise<CaptureResult> {
  const until = isoDay(now);
  const sinceDate = new Date(now);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (RUM_UNSAMPLED_DAYS - 1));
  const since = isoDay(sinceDate);
  const empty = { since, until, rowsFetched: 0, rowsWritten: 0, rowsSkipped: 0 };

  const rows = await fetchRumGroups({
    token: env.CF_ANALYTICS_TOKEN,
    accountTag: env.CF_ACCOUNT_ID,
    siteTag: WEB_ANALYTICS_SITE_TAG,
    since,
    until,
  });
  // null is "couldn't read" — credentials, permission, timeout, or a GraphQL
  // error inside a 200. Write nothing; the next run re-covers this window.
  if (rows === null) return { ok: false, reason: "rum-read-failed", ...empty };
  if (rows.length === 0) return { ok: true, reason: "no-rows-in-window", ...empty };

  const capturedAt = now.getTime();
  const statements: D1PreparedStatement[] = [];
  let skipped = 0;
  for (const row of rows) {
    const values = toUpsertValues(row, capturedAt);
    if (!values) {
      skipped += 1;
      continue;
    }
    statements.push(env.DB.prepare(RUM_UPSERT_SQL).bind(...values));
  }
  if (statements.length > 0) await env.DB.batch(statements);

  return {
    ok: true,
    since,
    until,
    rowsFetched: rows.length,
    rowsWritten: statements.length,
    rowsSkipped: skipped,
  };
}

export default {
  // Cron entry point. Logs the result so a failed run is visible in
  // `wrangler tail` — the archive itself can't show you a run that wrote
  // nothing, because a gap looks exactly like a quiet week.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      captureWindow(env).then((result) => {
        console.log(`[rum-archive] ${JSON.stringify(result)}`);
      }),
    );
  },

  // Manual trigger, so a first run can be watched rather than deployed and
  // hoped for. Guarded by a shared secret and DISABLED when that secret isn't
  // configured — an unguarded route here would let anyone force repeated
  // Cloudflare API reads. It only ever writes the same rows the cron would, so
  // the worst a leaked secret buys is redundant work.
  async fetch(request: Request, env: Env) {
    const secret = env.ARCHIVE_TRIGGER_SECRET;
    if (!secret) {
      return Response.json({ error: "manual trigger not configured" }, { status: 404 });
    }
    if (request.headers.get("x-archive-trigger") !== secret) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const result = await captureWindow(env);
    return Response.json(result, { status: result.ok ? 200 : 502 });
  },
};
