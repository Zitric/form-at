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
