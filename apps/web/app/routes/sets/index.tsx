import { Await, createFileRoute, defer, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { Card } from "~/components/Card";
import { PageLayout } from "~/components/PageLayout";
import { ShareIconButton } from "~/components/ShareIconButton";
import { TerminalRow } from "~/components/TerminalRow";
import { Label, PageTitle } from "~/components/Text";
import { CirclePlayButton } from "~/components/player";
import { type OverallStats, fetchOverallStats } from "~/data/set-stats";
import { sets } from "~/data/sets";
import { useStore } from "~/store";
import { fmtDuration } from "~/utils/fmt";
import { pageHead } from "~/utils/head";

// The list of sets is a static module import → page renders instantly.
// Overall stats come from D1 — return an UN-AWAITED promise so the loader
// resolves immediately; the OverallMetrics component reads it via <Await>
// inside Suspense so the cards never wait on stats.
export const Route = createFileRoute("/sets/")({
  // `.catch(() => null)` degrades the deferred server-fn to the designed
  // `null` fallback offline. Without it, an offline click-nav to /sets/
  // rejects the loader → "Something went wrong" error boundary. The reload
  // path works because `pages-v1` SWR serves the SSR'd HTML; only client
  // loaders run on link-click navigation.
  loader: () => ({ overallStats: defer(fetchOverallStats().catch(() => null)) }),
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
  const navigate = useNavigate();
  const playTrack = useStore((s) => s.playTrack);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const { overallStats } = Route.useLoaderData();

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
            <PageTitle>002 : audio_extracted</PageTitle>

            <ul className="space-y-px">
              {groupSets.map((set, index) => {
                const isThisPlaying = nowPlaying?.id === set.id && isPlaying;

                return (
                  <li key={set.id}>
                    <Card
                      imageSrc={set.artwork}
                      imageAlt={set.title}
                      hideImageOnMobile
                      onClick={() => navigate({ to: "/sets/$setId", params: { setId: set.id } })}
                      action={
                        <div className="flex items-center gap-1">
                          <ShareIconButton set={set} />
                          <CirclePlayButton
                            isThisPlaying={isThisPlaying}
                            onClick={(e) => {
                              e.stopPropagation();
                              playTrack(set);
                            }}
                          />
                        </div>
                      }
                      animationDelay={index}
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-sm sm:text-base tracking-tight truncate">
                          {set.artist} @ {set.title}
                        </p>
                        <p className="text-xs sm:text-sm text-grey truncate">
                          {set.date}
                          {set.date && " · "}Glasgow
                        </p>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <OverallMetrics promise={overallStats} />
    </PageLayout>
  );
}
