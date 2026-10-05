import { TREND_WINDOW_DAYS } from "@form-at/data/set-stats";
import { Muted } from "@form-at/ui";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useContext } from "react";
import { markerPositions, trendWindowStartDay } from "~/utils/milestones";
import { MilestonesContext } from "./MilestonesContext";

// ClientOnly alone is a render guard, not a code-splitting mechanism — a
// static top-level import of visx would still land in the SSR bundle even
// inside ClientOnly. The genuine `import()` below is what actually keeps
// TrendChartInner (and all of visx) out of _worker.js — verified by
// measuring _worker.js's gzip size before/after (see PWA_PROGRESS.md's
// Phase C entry).
const TrendChartInner = lazy(() =>
  import("./TrendChartInner").then((m) => ({ default: m.TrendChartInner })),
);

interface TrendChartProps {
  /** ALREADY BUCKETED, oldest first — one entry per `bucketDays`, not per day.
   *  The axis is reconstructed as `length × bucketDays` back from now, so a
   *  raw daily series doesn't error, it draws a confident wrong picture: 60
   *  daily values render a 413-day span captioned "60 weeks". Producers bucket
   *  first — `bucketByWeek(fillDailyWindow(rows, days), TREND_BUCKET_DAYS)`,
   *  the shape every trend in admin-stats.ts and cf-analytics.ts returns.
   *
   *  `null` means NOT OBSERVED, and is rendered as a shaded gap rather than a
   *  bar — distinct from `0`, which means observed and empty. Only the RUM
   *  history card needs this; every other caller passes a dense number[] and is
   *  unaffected. Never map an unknown to 0 to fit this prop: a chart that draws
   *  zeroes across an unobserved stretch hides exactly the outage it should
   *  reveal. */
  data: (number | null)[];
  bucketDays?: number;
  /** The first day (UTC) of the first bucket, and how many days the series
   *  covers — where milestone markers land. The defaults are the window every
   *  admin-stats.ts trend uses (TREND_WINDOW_DAYS ending today); a chart over
   *  any other window must pass its own, or its markers land in the wrong
   *  bar. */
  startDay?: string;
  totalDays?: number;
}

export function TrendChart({
  data,
  bucketDays = 7,
  startDay = trendWindowStartDay(),
  totalDays = TREND_WINDOW_DAYS,
}: TrendChartProps) {
  const milestones = useContext(MilestonesContext);
  const markers = markerPositions(milestones, {
    startDay,
    bucketDays,
    buckets: data.length,
    totalDays,
  });
  return (
    <ClientOnly fallback={<Muted>chart pending</Muted>}>
      <Suspense fallback={<Muted>chart pending</Muted>}>
        <TrendChartInner data={data} bucketDays={bucketDays} markers={markers} />
      </Suspense>
    </ClientOnly>
  );
}
