import { createServerFn } from "@tanstack/react-start";

// Transitional re-export — fetchSetStats/SetStats and the trend-bucketing
// helpers moved to packages/data/src/set-stats.ts (apps/admin's per-set
// picker needs the exact same query). fetchOverallStats below has only one
// consumer (this app's /sets listing page) so it stays local. See
// TECH_DEBT.md item 21 for the proposed follow-up sweep of apps/web's
// remaining `~/data/set-stats` import sites to `@form-at/data` directly.
export {
  fetchSetStats,
  type SetStats,
  TREND_WINDOW_DAYS,
  TREND_BUCKET_DAYS,
  fillDailyWindow,
  bucketByWeek,
} from "@form-at/data/set-stats";

export type OverallStats = {
  totalPlays: number;
  totalSeconds: number;
  countryCount: number;
};

export const fetchOverallStats = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  try {
    const cf = (context as unknown as Record<string, unknown>).cloudflare as
      | { env: { DB: D1Database } }
      | undefined;
    const db = cf?.env?.DB;
    if (!db) return null;

    const row = await db
      .prepare(
        `SELECT COUNT(*) as total_plays,
                COALESCE(SUM(listened_seconds), 0) as total_seconds,
                COUNT(DISTINCT country) as country_count
         FROM plays`,
      )
      .first<{ total_plays: number; total_seconds: number; country_count: number }>();

    if (!row || row.total_plays === 0) return null;
    return {
      totalPlays: row.total_plays,
      totalSeconds: row.total_seconds,
      countryCount: row.country_count,
    } satisfies OverallStats;
  } catch {
    return null;
  }
});
