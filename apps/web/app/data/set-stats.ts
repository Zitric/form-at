import { createServerFn } from "@tanstack/react-start";

export type SetStats = {
  playCount: number;
  totalSeconds: number;
  avgSeconds: number;
  countryCount: number;
  firstPlay: number | null;
  topCountries: string[];
};

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

export const fetchSetStats = createServerFn({ method: "GET" })
  .inputValidator((setId: string) => setId)
  .handler(async ({ data: setId, context }) => {
    try {
      const cf = (context as unknown as Record<string, unknown>).cloudflare as
        | { env: { DB: D1Database } }
        | undefined;
      const db = cf?.env?.DB;
      if (!db) return null;

      const [row, countries] = await Promise.all([
        db
          .prepare(
            `SELECT COUNT(*) as play_count,
              COALESCE(SUM(listened_seconds), 0) as total_seconds,
              COALESCE(ROUND(AVG(listened_seconds)), 0) as avg_seconds,
              COUNT(DISTINCT country) as country_count,
              MIN(started_at) as first_play
             FROM plays WHERE set_id = ?`,
          )
          .bind(setId)
          .first<{
            play_count: number;
            total_seconds: number;
            avg_seconds: number;
            country_count: number;
            first_play: number | null;
          }>(),
        db
          .prepare(
            `SELECT country FROM plays
             WHERE set_id = ? AND country != 'unknown'
             GROUP BY country ORDER BY COUNT(*) DESC LIMIT 3`,
          )
          .bind(setId)
          .all<{ country: string }>(),
      ]);

      if (!row || row.play_count === 0) return null;

      return {
        playCount: row.play_count,
        totalSeconds: row.total_seconds,
        avgSeconds: row.avg_seconds,
        countryCount: row.country_count,
        firstPlay: row.first_play,
        topCountries: countries.results.map((r) => r.country.toLowerCase()),
      } satisfies SetStats;
    } catch {
      return null;
    }
  });
