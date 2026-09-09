import { createServerFn } from "@tanstack/react-start";
import { SAMPLE_OVERALL_STATS } from "./sample-stats";

// fetchOverallStats has exactly one consumer (this app's /sets listing page), so
// it stays local rather than moving to @form-at/data/set-stats. Nothing is
// re-exported from here — consumers of `fetchSetStats`/`SetStats` import
// `@form-at/data/set-stats` directly.
export type OverallStats = {
  totalPlays: number;
  totalSeconds: number;
  countryCount: number;
  isSampleData: boolean;
};

// `hasCloudflareEnv` (set by server.ts from the raw `env` argument, before it
// gets coalesced to `{}`) tells apart "no D1 binding because we're not
// running under Cloudflare at all" (plain `vite dev`/e2e — safe to fake) from
// "no D1 binding despite a real Cloudflare env" (a real deployment mid-setup,
// or D1 genuinely down — must stay honest, never show sample data there).
// Extracted as its own function, mirroring apps/admin's
// pickStatsForMissingDb, so it's directly unit-testable without going
// through createServerFn.
export function pickStatsForMissingDb(hasCloudflareEnv: boolean | undefined): OverallStats | null {
  return hasCloudflareEnv ? null : SAMPLE_OVERALL_STATS;
}

export const fetchOverallStats = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  try {
    const cf = (context as unknown as Record<string, unknown>).cloudflare as
      | { env: { DB: D1Database }; hasCloudflareEnv: boolean }
      | undefined;
    const db = cf?.env?.DB;
    if (!db) return pickStatsForMissingDb(cf?.hasCloudflareEnv);

    // COUNT(DISTINCT ...), not COUNT(*): `plays` has one row per ≥3s
    // LISTENING SEGMENT (sendPlay fires on pause/track-change/unload), not
    // one row per play — see schema.sql's `session_id` comment for the full
    // mechanism and why the COALESCE fallback is safe for rows that
    // predate that column. totalSeconds is untouched — SUM over every
    // segment is the correct total regardless of how plays are counted.
    const row = await db
      .prepare(
        `SELECT COUNT(DISTINCT COALESCE(session_id, 'legacy-' || id)) as total_plays,
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
      isSampleData: false,
    } satisfies OverallStats;
  } catch {
    return null;
  }
});
