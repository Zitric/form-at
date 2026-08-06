import { createServerFn } from "@tanstack/react-start";

// fetchOverallStats has exactly one consumer (this app's /sets listing page), so
// it stays local rather than moving to @form-at/data/set-stats. Nothing is
// re-exported from here — consumers of `fetchSetStats`/`SetStats` import
// `@form-at/data/set-stats` directly.
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
