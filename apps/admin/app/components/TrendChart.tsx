import { Muted } from "@form-at/ui";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

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
   *  the shape every trend in admin-stats.ts and cf-analytics.ts returns. */
  data: number[];
  bucketDays?: number;
}

export function TrendChart({ data, bucketDays = 7 }: TrendChartProps) {
  return (
    <ClientOnly fallback={<Muted>chart pending</Muted>}>
      <Suspense fallback={<Muted>chart pending</Muted>}>
        <TrendChartInner data={data} bucketDays={bucketDays} />
      </Suspense>
    </ClientOnly>
  );
}
