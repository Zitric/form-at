// Trend arrays from admin-stats.ts are plain `number[]`, oldest-first, no
// dates attached (see TrendChartInner.tsx's caller). This reconstructs an
// approximate start date per bucket purely for axis labels — presentation
// only, never feeds back into admin-stats.ts's queries.
export function bucketStartDates(
  count: number,
  bucketDays: number,
  now: Date = new Date(),
): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = (count - 1 - i) * bucketDays;
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    return date;
  });
}
