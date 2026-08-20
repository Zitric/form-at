import type { OverallStats } from "./set-stats";

// Substituted by fetchOverallStats when there's no Cloudflare env at all (see
// pickStatsForMissingDb's comment in set-stats.ts), so local dev renders the
// populated hero stats rather than nothing — the HeroStats component returns
// null on a null promise, which made every layout change require a real
// deploy to see. Mirrors apps/admin/app/data/sample-stats.ts's identical
// pattern and its isSampleData flag.
//
// Values are real production figures as of 2026-08-19, not invented ones —
// picked deliberately so the fixture is realistic enough to judge the hero
// layout against (does "55h 43m" actually fit next to "340" and "5" without
// wrapping or misaligning), not just structurally valid.
export const SAMPLE_OVERALL_STATS: OverallStats = {
  totalPlays: 340,
  totalSeconds: 200_580, // 55h 43m via fmtDuration
  countryCount: 5,
  isSampleData: true,
};
