import { Label, PageTitle, TerminalRow } from "@form-at/ui";

import { Await, createFileRoute, defer } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLayout } from "~/components/PageLayout";
import { SetCard } from "~/components/SetCard";
import { type OverallStats, fetchOverallStats } from "~/data/set-stats";
import { fetchAllSetsForRoute } from "~/data/setsForRoute";
import { fmtDuration } from "~/utils/fmt";
import { pageHead } from "~/utils/head";

// The catalogue is a merged live-D1 + build-time-snapshot fetch (see
// fetchAllSetsForRoute in ~/data/setsForRoute, which owns the client-side
// offline catch on top of fetchAllSets/getAllSetsWithFallback's server-side
// one) — awaited directly, not deferred: a single indexed SELECT is fast,
// and the snapshot fallback means this never blocks on network the way
// `overallStats` legitimately can. Overall stats come from D1 separately —
// return an UN-AWAITED promise so the loader resolves immediately; the
// OverallMetrics component reads it via <Await> inside Suspense so the
// cards never wait on stats.
export const Route = createFileRoute("/sets/")({
  // `overallStats`'s `.catch(() => null)` degrades the deferred server-fn to
  // the designed `null` fallback offline. Without it, an offline click-nav
  // to /sets rejects the loader → "Something went wrong" error boundary. The
  // reload path works because `pages-v1` SWR serves the SSR'd HTML; only
  // client loaders run on link-click navigation. `fetchAllSetsForRoute`
  // carries the equivalent catch for the sets list itself — see its own
  // comment in ~/data/setsForRoute.ts.
  loader: async () => ({
    sets: await fetchAllSetsForRoute(),
    overallStats: defer(fetchOverallStats().catch(() => null)),
  }),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  head: () =>
    pageHead({
      title: "Sets · Form:at",
      description: "Recorded transmissions from the Form:at archive. Techno, electro, dub.",
      path: "/sets",
    }),
  component: Sets,
});

function OverallMetrics({ promise }: { promise: Promise<OverallStats | null> }) {
  return (
    // Fallback mirrors the real layout 1:1 so the page reserves the exact final
    // height. Without this, the 72px placeholder vs ~100px real content created
    // a layout shift (CLS) when the promise resolved.
    <Suspense
      fallback={
        <div className="mb-8 invisible" aria-hidden="true">
          <Label className="mb-2 text-grey tracking-widest">{"// archive_metrics"}</Label>
          <div className="space-y-1">
            <TerminalRow label="plays" value="—" />
            <TerminalRow label="listened_for" value="—" />
            <TerminalRow label="reach" value="—" />
          </div>
        </div>
      }
    >
      <Await promise={promise}>
        {(stats) => {
          if (!stats) return null;
          return (
            <div className="mb-8 animate-fade-in">
              <Label className="mb-2 text-grey tracking-widest">{"// archive_metrics"}</Label>
              <div className="space-y-1">
                <TerminalRow label="plays" value={String(stats.totalPlays)} dimValue />
                <TerminalRow
                  label="listened_for"
                  value={fmtDuration(stats.totalSeconds)}
                  dimValue
                />
                <TerminalRow
                  label="reach"
                  value={`${stats.countryCount} ${stats.countryCount === 1 ? "territory" : "territories"}`}
                  dimValue
                />
              </div>
            </div>
          );
        }}
      </Await>
    </Suspense>
  );
}

function Sets() {
  const { sets, overallStats } = Route.useLoaderData();

  const groups = sets.reduce<Record<string, typeof sets>>((acc, set) => {
    if (!acc[set.title]) acc[set.title] = [];
    const group = acc[set.title];
    if (group) group.push(set);
    return acc;
  }, {});

  return (
    <PageLayout>
      {Object.entries(groups).map(([title, groupSets]) => {
        return (
          <section key={title} className="mb-10">
            <PageTitle>{title}</PageTitle>

            <ul className="space-y-px">
              {groupSets.map((set, index) => (
                <li key={set.id}>
                  <SetCard set={set} index={index} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <OverallMetrics promise={overallStats} />
    </PageLayout>
  );
}
