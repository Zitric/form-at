// Dated milestones drawn as marker lines on the trend charts, so a change in
// a trend can be read against what happened that week. Display-only: nothing
// here feeds a query. Push sends and set uploads come from D1
// (fetchMilestones in admin-stats.ts); these are the ones D1 doesn't know.

import { TREND_WINDOW_DAYS } from "@form-at/data/set-stats";

export type MilestoneKind = "launch" | "event" | "push" | "upload";

export interface Milestone {
  /** YYYY-MM-DD, UTC — the same day boundary the trends bucket by. */
  date: string;
  kind: MilestoneKind;
  label: string;
}

export const STATIC_MILESTONES: readonly Milestone[] = [
  // The day the Android launch deployed.
  { date: "2026-10-02", kind: "launch", label: "instagram story launched on android" },
  // Not in packages/data/src/events.ts yet; move it there when it is.
  { date: "2026-12-05", kind: "event", label: "form:at night, 5 dec" },
];

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The first day of the standard trend window: the TREND_WINDOW_DAYS days
 * ending today (UTC), as fillDailyWindow builds it. Every trend in
 * admin-stats.ts starts here.
 */
export function trendWindowStartDay(
  windowDays: number = TREND_WINDOW_DAYS,
  now: Date = new Date(),
): string {
  return isoDay(new Date(now.getTime() - (windowDays - 1) * DAY_MS));
}

export interface MarkerPosition {
  milestone: Milestone;
  /** Which bar it falls in. */
  bucket: number;
  /** Where in that bar's span, 0–1: its day's middle. */
  fraction: number;
}

/**
 * Where each milestone falls on a chart of `buckets` bars of `bucketDays`
 * days, the first starting on `startDay` (UTC). bucketByWeek chunks from
 * the oldest day, so the last bar can be shorter; `totalDays` gives its
 * real length (default: every bar full). Milestones outside the chart are
 * left out.
 */
export function markerPositions(
  milestones: readonly Milestone[],
  chart: { startDay: string; bucketDays: number; buckets: number; totalDays?: number },
): MarkerPosition[] {
  const { startDay, bucketDays, buckets } = chart;
  const totalDays = chart.totalDays ?? buckets * bucketDays;
  const start = Date.parse(`${startDay}T00:00:00Z`);
  const positions: MarkerPosition[] = [];
  for (const milestone of milestones) {
    const day = Math.round((Date.parse(`${milestone.date}T00:00:00Z`) - start) / DAY_MS);
    if (!Number.isFinite(day) || day < 0 || day >= totalDays) continue;
    const bucket = Math.floor(day / bucketDays);
    if (bucket >= buckets) continue;
    const daysInBucket = Math.min(bucketDays, totalDays - bucket * bucketDays);
    positions.push({ milestone, bucket, fraction: ((day % bucketDays) + 0.5) / daysInBucket });
  }
  return positions;
}
