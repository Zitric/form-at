import { Await, Link, createFileRoute, defer } from "@tanstack/react-router";
import { Suspense } from "react";
import { Card } from "~/components/Card";
import { PageLayout } from "~/components/PageLayout";
import { TerminalRow } from "~/components/TerminalRow";
import { Label, PageTitle } from "~/components/Text";
import { type OverallStats, fetchOverallStats } from "~/data/set-stats";
import { sets } from "~/data/sets";
import { useStore } from "~/store";
import { fmtDuration } from "~/utils/fmt";

// The list of sets is a static module import → page renders instantly.
// Overall stats come from D1 — return an UN-AWAITED promise so the loader
// resolves immediately; the OverallMetrics component reads it via <Await>
// inside Suspense so the cards never wait on stats.
export const Route = createFileRoute("/sets/")({
  loader: () => ({ overallStats: defer(fetchOverallStats()) }),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  component: Sets,
});

function OverallMetrics({ promise }: { promise: Promise<OverallStats | null> }) {
  return (
    <Suspense fallback={<div className="h-[72px]" aria-hidden />}>
      <Await promise={promise}>
        {(stats) => {
          if (!stats) return null;
          return (
            <div className="mb-8 animate-fade-in">
              <Label className="mb-2 text-grey tracking-widest">[ archive_metrics ]</Label>
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
  const playTrack = useStore((s) => s.playTrack);
  const { overallStats } = Route.useLoaderData();

  const groups = sets.reduce<Record<string, typeof sets>>((acc, set) => {
    if (!acc[set.title]) acc[set.title] = [];
    const group = acc[set.title];
    if (group) group.push(set);
    return acc;
  }, {});

  return (
    <PageLayout footer="[ end_of_archive ]">
      <OverallMetrics promise={overallStats} />
      {Object.entries(groups).map(([title, groupSets]) => {
        return (
          <section key={title} className="mb-10">
            <PageTitle>002 : audio_extracted</PageTitle>

            <ul className="space-y-px">
              {groupSets.map((set, index) => {
                return (
                  <li key={set.id}>
                    <Card
                      imageSrc={set.artwork}
                      imageAlt={set.title}
                      onClick={() => playTrack(set)}
                      action={
                        <Link
                          to="/sets/$setId"
                          params={{ setId: set.id }}
                          preload="intent"
                          className="inline-flex items-center gap-2 px-3 py-2 text-xs text-grey hover:text-purple hover:border hover:border-purple/30 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          [ info ]
                        </Link>
                      }
                      animationDelay={index}
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-sm sm:text-base tracking-tight truncate">
                          {set.artist} @ {set.title}, Glasgow
                        </p>
                        {set.date && (
                          <p className="text-xs sm:text-sm text-grey truncate">{set.date}</p>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </PageLayout>
  );
}
