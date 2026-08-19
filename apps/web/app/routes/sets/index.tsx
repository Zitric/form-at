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

// Two hero numbers, not a grid of everything — impact over completeness.
// Reuses the SAME overallStats promise as OverallMetrics below (no second
// query); this renders it once large near the top, the full panel still
// renders it again in full at the bottom, unchanged.
//
// plays + listened_for, not reach: checked real production values before
// picking (2026-08-19) — plays 340, listened_for 55h 43m, reach 5
// territories. Reach is genuinely thin at that count for a large standalone
// number ("5 territories" doesn't carry the same weight as "55h 43m"), and
// it's still visible in the panel below regardless.
//
// Not the same query as admin's topSets bug: that split happened because
// the admin query GROUPED BY denormalized title/artist text that drifted
// case over time. This query has no GROUP BY on set metadata at all — a
// single COUNT(*)/SUM(...) over the whole `plays` table — so nothing here
// can double- or under-count from title-text variance.
//
// Same null-safe rule as OverallMetrics: `stats` is null on any failure
// (network, D1 unreachable, zero rows), and this returns null right back —
// never a fallback of 0, which would be a genuine wrong fact printed large
// at the top of the page, not just a missing one. The Suspense fallback
// below reserves the real content's height (invisible, not blank) so
// resolution doesn't shift the set list beneath it — same technique
// OverallMetrics already uses, worth doing here too since this sits above
// the fold instead of at the page's end.
function HeroStats({ promise }: { promise: Promise<OverallStats | null> }) {
  return (
    <Suspense
      fallback={
        <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 gap-6 invisible" aria-hidden="true">
          <div>
            <p className="font-display text-4xl sm:text-5xl text-white">—</p>
            <Label className="mt-1 text-grey tracking-widest">plays</Label>
          </div>
          <div>
            <p className="font-display text-4xl sm:text-5xl text-white">—</p>
            <Label className="mt-1 text-grey tracking-widest">listened_for</Label>
          </div>
        </div>
      }
    >
      <Await promise={promise}>
        {(stats) => {
          if (!stats) return null;
          return (
            <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 gap-6 animate-fade-in">
              <div>
                <p className="font-display text-4xl sm:text-5xl text-white">{stats.totalPlays}</p>
                <Label className="mt-1 text-grey tracking-widest">plays</Label>
              </div>
              <div>
                <p className="font-display text-4xl sm:text-5xl text-white">
                  {fmtDuration(stats.totalSeconds)}
                </p>
                <Label className="mt-1 text-grey tracking-widest">listened_for</Label>
              </div>
            </div>
          );
        }}
      </Await>
    </Suspense>
  );
}

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
      <HeroStats promise={overallStats} />
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
