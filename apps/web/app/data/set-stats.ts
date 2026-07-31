import { createServerFn } from "@tanstack/react-start";

// Transitional re-export — fetchSetStats/SetStats moved to
// packages/data/src/set-stats.ts (apps/admin's per-set picker needs the
// exact same query). The trend-bucketing helpers (TREND_WINDOW_DAYS etc.)
// lived here too but had no consumer left in this app once admin-stats.ts
// moved to apps/admin, so they're not re-exported — apps/admin imports them
// from @form-at/data/set-stats directly. fetchOverallStats below has only
// one consumer (this app's /sets listing page) so it stays local. See
// TECH_DEBT.md item 21 for the proposed follow-up sweep of apps/web's
// remaining `~/data/set-stats` import sites to `@form-at/data` directly.
export { fetchSetStats, type SetStats } from "@form-at/data/set-stats";

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
