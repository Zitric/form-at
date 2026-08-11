import { createServerFn } from "@tanstack/react-start";
import { SAMPLE_RUM_HISTORY } from "./sample-stats";

// Reads the `rum_daily` archive written by apps/rum-archiver. Separate from
// cf-analytics.ts on purpose: that module reads the LIVE Cloudflare API for the
// last 7 days, this one reads D1 for everything ever captured. They are not
// stitched into one number — two sources with different provenance behind a
// single figure is the failure this dashboard has spent its whole history
// fixing, so they stay two cards saying where they came from.
//
// THE CENTRAL PROBLEM this module exists to solve: a day with no row is
// ambiguous. It can mean "nobody visited" (a real zero, and real data) or
// "nobody captured this day" (unknown). Rendering both as 0 would draw
// confident flat traffic across an outage — and an outage is precisely what
// this archive exists to survive, so the chart must not be able to hide one.
//
// Coverage comes from `rum_capture_runs` — one row per run, written by the
// archiver whether or not that run stored anything. The union of the windows of
// SUCCESSFUL runs is exactly the set of days somebody looked at. Inside it, a
// missing row is a genuine zero. Outside it, we simply don't know.
//
// It is NOT derived from `rum_daily.captured_at`, which is the obvious shortcut
// and is wrong on exactly the case that matters: a run over a window with no
// traffic writes no rows, so it leaves no `captured_at` and is indistinguishable
// afterwards from a run that never happened. A quiet week then renders as seven
// "nobody looked" gaps — the zero-vs-unknown conflation this module exists to
// prevent, arriving through the back door. Never reintroduce that derivation.

/** Longest history the card will draw. Bounds both the query and the chart —
 *  the archive grows a couple of rows a day, so this is about readability
 *  rather than cost. */
const RUM_HISTORY_MAX_DAYS = 90;

type RumHistoryDay = {
  day: string;
  /** null = the day was never captured, so nothing is known about it. A real
   *  zero-traffic day is 0, not null, and the two render differently. */
  visits: number | null;
  pageLoads: number | null;
  botPageLoads: number | null;
};

/** One archiver run, as recorded by the Worker. */
export type CaptureRun = {
  /** Unix ms. */
  capturedAt: number;
  /** The window this run observed, stored per run so changing
   *  `RUM_UNSAMPLED_DAYS` can't rewrite what past runs are claimed to have
   *  seen. */
  since: string;
  until: string;
  /** Whether the Cloudflare read succeeded. Only successful runs are coverage —
   *  a failed one saw nothing — but a failed one still proves the cron fired. */
  ok: boolean;
};

export type RumHistory = {
  /** Dense, oldest-first, one entry per day across the rendered range —
   *  including uncovered days, which carry nulls rather than being omitted. */
  days: RumHistoryDay[];
  /** Oldest and newest day the archive has ever observed, null when empty. */
  coverageStart: string | null;
  coverageEnd: string | null;
  /** Two DIFFERENT staleness signals, deliberately not collapsed into one.
   *
   *  `lastRunAt` — the newest run of any kind: is the cron firing at all?
   *  `lastSuccessAt` — the newest run that actually read Cloudflare: is it
   *  capturing anything?
   *
   *  A cron that fires daily and fails every time is fresh by the first and
   *  stale by the second, and that is precisely the situation the warning
   *  exists for. Reporting only `lastRunAt` would render it as healthy;
   *  reporting only `lastSuccessAt` would render a quiet week as a dead cron.
   *  They are different problems needing different fixes, so the card names
   *  which one it's seeing. */
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  daysCovered: number;
  daysUncovered: number;
  totalVisits: number;
  isSampleData: boolean;
};

function addDays(isoDay: string, delta: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * The set of days some capture actually observed.
 *
 * The union of every SUCCESSFUL run's recorded `[since, until]`. Two runs a
 * fortnight apart therefore leave the middle days UNCOVERED — the case that
 * matters, because those are exactly the days an outage would otherwise turn
 * into confident zeroes.
 *
 * Failed runs are excluded: the cron fired, but it saw nothing, so it can't
 * vouch for those days. That's the opposite of the quiet-window case, where the
 * run DID see the days and found no traffic.
 */
export function coveredDays(runs: CaptureRun[]): Set<string> {
  const covered = new Set<string>();
  for (const run of runs) {
    if (!run.ok || !run.since || !run.until || run.until < run.since) continue;
    for (let day = run.since; day <= run.until; day = addDays(day, 1)) {
      covered.add(day);
    }
  }
  return covered;
}

type ArchiveRow = { day: string; is_bot: number; visits: number; page_loads: number };

/**
 * Shape archive rows plus capture times into a dense, coverage-aware series.
 *
 * Exported separately from the query so the whole ambiguity — zero vs unknown —
 * is testable without a database.
 */
export function buildHistory(
  rows: ArchiveRow[],
  runs: CaptureRun[],
  now: Date,
  maxDays = RUM_HISTORY_MAX_DAYS,
): RumHistory {
  const covered = coveredDays(runs);
  const today = now.toISOString().slice(0, 10);

  const byDay = new Map<string, { visits: number; pageLoads: number; botPageLoads: number }>();
  for (const r of rows) {
    const entry = byDay.get(r.day) ?? { visits: 0, pageLoads: 0, botPageLoads: 0 };
    if (r.is_bot === 1) entry.botPageLoads += r.page_loads;
    else {
      entry.visits += r.visits;
      entry.pageLoads += r.page_loads;
    }
    byDay.set(r.day, entry);
  }

  const runTimes = runs.map((r) => r.capturedAt).filter(Number.isFinite);
  const successTimes = runs
    .filter((r) => r.ok)
    .map((r) => r.capturedAt)
    .filter(Number.isFinite);
  const lastRunAt = runTimes.length ? Math.max(...runTimes) : null;
  const lastSuccessAt = successTimes.length ? Math.max(...successTimes) : null;

  const observed = [...covered].sort();
  const coverageStart = observed[0] ?? null;
  const coverageEnd = observed[observed.length - 1] ?? null;
  if (!coverageStart) {
    return {
      days: [],
      coverageStart: null,
      coverageEnd: null,
      // Kept even with no coverage: runs that all FAILED produce exactly this
      // state, and the card must be able to say "the cron is running but has
      // never succeeded" rather than "nothing archived yet".
      lastRunAt,
      lastSuccessAt,
      daysCovered: 0,
      daysUncovered: 0,
      totalVisits: 0,
      isSampleData: false,
    };
  }

  // Render from the start of coverage, capped so a long-lived archive doesn't
  // draw an unreadable chart. Never past today: future days aren't "uncovered",
  // they haven't happened.
  const capStart = addDays(today, -(maxDays - 1));
  const start = coverageStart > capStart ? coverageStart : capStart;

  const days: RumHistoryDay[] = [];
  let daysCovered = 0;
  let totalVisits = 0;
  for (let day = start; day <= today; day = addDays(day, 1)) {
    if (!covered.has(day)) {
      days.push({ day, visits: null, pageLoads: null, botPageLoads: null });
      continue;
    }
    daysCovered += 1;
    const entry = byDay.get(day);
    // Covered but no row: a capture looked at this day and Cloudflare reported
    // nothing. That is a real zero, and real data.
    const visits = entry?.visits ?? 0;
    totalVisits += visits;
    days.push({
      day,
      visits,
      pageLoads: entry?.pageLoads ?? 0,
      botPageLoads: entry?.botPageLoads ?? 0,
    });
  }

  return {
    days,
    coverageStart,
    coverageEnd,
    lastRunAt,
    lastSuccessAt,
    daysCovered,
    daysUncovered: days.length - daysCovered,
    totalVisits,
    isSampleData: false,
  };
}

export const fetchRumHistory = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<RumHistory | null> => {
    const cf = (context as unknown as Record<string, unknown>).cloudflare as
      | { env: { DB: D1Database }; hasCloudflareEnv: boolean }
      | undefined;
    const db = cf?.env?.DB;
    // Mirrors pickStatsForMissingDb: no Cloudflare env at all means local dev
    // or e2e, where the fixture keeps the card exercisable. A real D1 that
    // can't be reached stays null — a failed read, not an empty archive.
    if (!db) return cf?.hasCloudflareEnv ? null : SAMPLE_RUM_HISTORY;

    try {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - (RUM_HISTORY_MAX_DAYS - 1));
      const [rows, captures] = await Promise.all([
        db
          .prepare(
            `SELECT day, is_bot, visits, page_loads FROM rum_daily
             WHERE day >= ? ORDER BY day ASC`,
          )
          .bind(since.toISOString().slice(0, 10))
          .all<ArchiveRow>(),
        // Every run, not just those inside the window: a run just before it
        // still proves its trailing days were observed. Failed runs are fetched
        // too — they aren't coverage, but they're how the card tells a dead
        // cron from a cron whose reads are all failing.
        db
          .prepare("SELECT captured_at, since, until, ok FROM rum_capture_runs")
          .all<{ captured_at: number; since: string; until: string; ok: number }>(),
      ]);
      return buildHistory(
        rows.results,
        captures.results.map((r) => ({
          capturedAt: r.captured_at,
          since: r.since,
          until: r.until,
          ok: r.ok === 1,
        })),
        new Date(),
      );
    } catch {
      return null;
    }
  },
);
