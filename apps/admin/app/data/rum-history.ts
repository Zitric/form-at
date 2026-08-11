import { RUM_UNSAMPLED_DAYS } from "@form-at/data/rumArchive";
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
// Coverage is derivable from what's already stored, with no extra bookkeeping:
// every run writes `captured_at`, and a run at time T re-fetched the whole
// trailing unsampled window, so it observed every day in
// [T - (RUM_UNSAMPLED_DAYS - 1), T]. The union of those windows is exactly the
// set of days somebody looked at. Inside it, a missing row is a genuine zero.
// Outside it, we simply don't know.

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

export type RumHistory = {
  /** Dense, oldest-first, one entry per day across the rendered range —
   *  including uncovered days, which carry nulls rather than being omitted. */
  days: RumHistoryDay[];
  /** Oldest and newest day the archive has ever observed, null when empty. */
  coverageStart: string | null;
  coverageEnd: string | null;
  /** When the most recent capture ran (unix ms), for the staleness warning. */
  lastCapturedAt: number | null;
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
 * Each `captured_at` represents a run that re-fetched the trailing
 * `windowDays`, so it observed that whole span. The union across runs is the
 * coverage. Two captures a fortnight apart therefore leave the middle days
 * UNCOVERED — which is the case that matters, because those are exactly the
 * days an outage would silently turn into zeroes.
 */
export function coveredDays(capturedAtMs: number[], windowDays: number): Set<string> {
  const covered = new Set<string>();
  for (const ms of capturedAtMs) {
    if (!Number.isFinite(ms)) continue;
    const runDay = new Date(ms).toISOString().slice(0, 10);
    for (let back = 0; back < windowDays; back += 1) {
      covered.add(addDays(runDay, -back));
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
  capturedAtMs: number[],
  now: Date,
  maxDays = RUM_HISTORY_MAX_DAYS,
): RumHistory {
  const covered = coveredDays(capturedAtMs, RUM_UNSAMPLED_DAYS);
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

  const observed = [...covered].sort();
  const coverageStart = observed[0] ?? null;
  const coverageEnd = observed[observed.length - 1] ?? null;
  if (!coverageStart) {
    return {
      days: [],
      coverageStart: null,
      coverageEnd: null,
      lastCapturedAt: null,
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
    lastCapturedAt: capturedAtMs.length ? Math.max(...capturedAtMs) : null,
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
        // Every distinct run, not just those inside the window: a capture just
        // before the window still proves its trailing days were observed.
        db
          .prepare("SELECT DISTINCT captured_at FROM rum_daily")
          .all<{ captured_at: number }>(),
      ]);
      return buildHistory(
        rows.results,
        captures.results.map((r) => r.captured_at),
        new Date(),
      );
    } catch {
      return null;
    }
  },
);
