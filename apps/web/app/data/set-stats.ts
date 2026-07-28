import { createServerFn } from "@tanstack/react-start";

export type SetStats = {
  playCount: number;
  totalSeconds: number;
  avgSeconds: number;
  countryCount: number;
  firstPlay: number | null;
  lastPlay: number | null;
  topCountries: string[];
  /** Plays grouped into TREND_BUCKET_DAYS-day buckets over the last
   * TREND_WINDOW_DAYS, oldest first. Bucketing smooths low daily volume
   * into a readable sparkline; one bar per week reads much better than 60
   * mostly-empty daily bars. */
  weeklyPlays: number[];
};

export const TREND_WINDOW_DAYS = 60;
export const TREND_BUCKET_DAYS = 7;

// Exported (2026-07-27) for reuse by `admin-stats.ts` — the same "sparse
// daily counts → dense day-by-day array → weekly sums" shape is exactly
// what the admin dashboard needs for app-launch and push-subscriber growth
// trends. Second real consumer, not a speculative export.
export function fillDailyWindow(rows: { day: string; count: number }[], days: number): number[] {
  const map = new Map(rows.map((r) => [r.day, r.count]));
  const result: number[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push(map.get(key) ?? 0);
  }
  return result;
}

export function bucketByWeek(daily: number[], bucketDays: number): number[] {
  const buckets: number[] = [];
  for (let i = 0; i < daily.length; i += bucketDays) {
    const sum = daily.slice(i, i + bucketDays).reduce((a, b) => a + b, 0);
    buckets.push(sum);
  }
  return buckets;
}

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

      const [row, countries, daily] = await Promise.all([
        db
          .prepare(
            `SELECT COUNT(*) as play_count,
              COALESCE(SUM(listened_seconds), 0) as total_seconds,
              COALESCE(ROUND(AVG(listened_seconds)), 0) as avg_seconds,
              COUNT(DISTINCT country) as country_count,
              MIN(started_at) as first_play,
              MAX(started_at) as last_play
             FROM plays WHERE set_id = ?`,
          )
          .bind(setId)
          .first<{
            play_count: number;
            total_seconds: number;
            avg_seconds: number;
            country_count: number;
            first_play: number | null;
            last_play: number | null;
          }>(),
        db
          .prepare(
            `SELECT country FROM plays
             WHERE set_id = ? AND country != 'unknown'
             GROUP BY country ORDER BY COUNT(*) DESC LIMIT 3`,
          )
          .bind(setId)
          .all<{ country: string }>(),
        db
          .prepare(
            `SELECT DATE(started_at/1000, 'unixepoch') AS day, COUNT(*) AS count
             FROM plays
             WHERE set_id = ?
               AND started_at >= (strftime('%s', 'now', '-${TREND_WINDOW_DAYS} days') * 1000)
             GROUP BY day
             ORDER BY day ASC`,
          )
          .bind(setId)
          .all<{ day: string; count: number }>(),
      ]);

      if (!row || row.play_count === 0) return null;

      const dailyDense = fillDailyWindow(daily.results, TREND_WINDOW_DAYS);

      return {
        playCount: row.play_count,
        totalSeconds: row.total_seconds,
        avgSeconds: row.avg_seconds,
        countryCount: row.country_count,
        firstPlay: row.first_play,
        lastPlay: row.last_play,
        topCountries: countries.results.map((r) => r.country.toLowerCase()),
        weeklyPlays: bucketByWeek(dailyDense, TREND_BUCKET_DAYS),
      } satisfies SetStats;
    } catch {
      return null;
    }
  });
