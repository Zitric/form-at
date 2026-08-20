import { Label, PageTitle } from "@form-at/ui";

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
// HeroStats component reads it via <Await> inside Suspense so the
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

// Three hero numbers in a fixed single row — impact over completeness, and
// no responsive stacking: this is the ONLY place these figures appear now
// (archive_metrics below was removed as pure duplication once this covered
// all three of its rows), so there's no fallback panel to lean on if this
// wraps awkwardly at narrow widths.
//
// Values: plays, listened, countries — checked real production figures
// before picking (2026-08-19: 340 / 55h 43m / 5). `countries` names what's
// being counted directly, rather than the vaguer "reach" (which needed the
// number for context to mean anything) or "territories" (the word
// $setId.tsx's own per-set stats use for this same countryCount field —
// intentionally diverging here, not a drift to fix later: "countries" reads
// clearer standalone at hero size). Shows the bare count, not "5 countries",
// so its figure is a plain number like the other two rather than the
// widest string on the row. `listened` (not "duration") avoids a
// real collision: $setId.tsx already uses "duration" for a single track's
// own length, a different figure from this cumulative sum across every play.
//
// Order: listened (the widest value, "55h 43m") sits in the MIDDLE, with
// the two short, single-token values (a plain count on each side) flanking
// it — that's a symmetric shape around a wide center, versus ordering by
// width would put a wide item at one edge and read lopsided.
//
// Not the same query as admin's topSets bug: that split happened because
// the admin query GROUPED BY denormalized title/artist text that drifted
// case over time. This query has no GROUP BY on set metadata at all — a
// single COUNT(*)/SUM(...) over the whole `plays` table — so nothing here
// can double- or under-count from title-text variance.
//
// Null-safe: `stats` is null on any failure (network, D1 unreachable, zero
// rows), and this returns null right back — never a fallback of 0, which
// would be a genuine wrong fact printed at the top of the page, not just a
// missing one. The Suspense fallback below reserves the real content's
// height (invisible, not blank) so resolution doesn't shift the set list
// beneath it.
function HeroStats({ promise }: { promise: Promise<OverallStats | null> }) {
  return (
    <Suspense
      fallback={
        <div className="mb-10 grid grid-cols-3 gap-4 sm:gap-10 invisible" aria-hidden="true">
          <HeroStat label="plays" value="—" />
          <HeroStat label="listened" value="—" />
          <HeroStat label="countries" value="—" />
        </div>
      }
    >
      <Await promise={promise}>
        {(stats) => {
          if (!stats) return null;
          return (
            <div className="mb-10 animate-fade-in">
              <div className="grid grid-cols-3 gap-4 sm:gap-10">
                <HeroStat label="plays" value={String(stats.totalPlays)} />
                <HeroStat label="listened" value={fmtDuration(stats.totalSeconds)} />
                <HeroStat label="countries" value={String(stats.countryCount)} />
              </div>
              {stats.isSampleData && (
                <span className="mt-3 inline-block text-xs font-mono px-2 py-0.5 border border-gold text-gold">
                  sample data
                </span>
              )}
            </div>
          );
        }}
      </Await>
    </Suspense>
  );
}

// Label ABOVE the figure (not below) — the small caption reads first, then
// the number. `whitespace-nowrap` on BOTH: the label because a wrapped
// label would only happen if the column got too narrow to hold it, and the
// figure because duration values contain a space ("55h 43m")
// and would otherwise wrap onto two lines at exactly this row's narrowest
// width while the plain-number columns stayed on one — that mismatch, not
// the grid or a baseline difference, was the real cause of the three
// columns looking unaligned: a wrapped figure pushes nothing below it here
// (label is above), but a taller cell next to two shorter ones still reads
// as misaligned. Forcing single-line prevents the wrap outright rather than
// papering over it with margin.
function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <Label className="text-grey tracking-widest whitespace-nowrap">{label}</Label>
      <p className="font-display text-xl sm:text-3xl text-white leading-tight mt-1 whitespace-nowrap">
        {value}
      </p>
    </div>
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
    </PageLayout>
  );
}
