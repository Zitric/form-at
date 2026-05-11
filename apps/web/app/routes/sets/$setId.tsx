import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConsoleWriter } from "~/components/ConsoleWriter";
import { Image } from "~/components/Image";
import { PageLayout } from "~/components/PageLayout";
import { PauseIcon, PlayIcon } from "~/components/PlayerIcons";
import { TerminalRow } from "~/components/TerminalRow";
import { Label, PageTitle } from "~/components/Text";
import { fetchSetStats } from "~/data/set-stats";
import type { SetStats } from "~/data/set-stats";
import { getSet } from "~/data/sets";
import { useStore } from "~/store";
import { pageHead } from "~/utils/head";

// Module-level flag — true once the typewriter has played on any set detail page in this client session.
let hasTypedSetDetail = false;

export const Route = createFileRoute("/sets/$setId")({
  loader: async ({ params }) => {
    const set = getSet(params.setId);
    if (!set) throw notFound();
    const stats = await fetchSetStats({ data: params.setId }).catch(() => null);
    return { set, stats };
  },
  // Stats barely change minute-to-minute — reuse the cached payload for 5 min so
  // navigating away and back doesn't re-hit D1.
  staleTime: 5 * 60 * 1000,
  // Keep cached stats in memory for 30 min after the route unmounts.
  gcTime: 30 * 60 * 1000,
  head: ({ loaderData }) => {
    const set = loaderData?.set;
    if (!set) return {};
    return pageHead({
      title: `${set.artist} — ${set.title} · Form:at`,
      description: set.description ?? `Recorded set from ${set.artist} at ${set.title}, Glasgow.`,
      path: `/sets/${set.id}`,
    });
  },
  component: SetDetail,
});

function buildStatsRows(stats: SetStats): Array<[string, string]> {
  const rows: Array<[string, string]> = [["plays", `${stats.playCount}`]];
  if (stats.countryCount > 0)
    rows.push([
      "reach",
      `${stats.countryCount} ${stats.countryCount === 1 ? "territory" : "territories"}`,
    ]);
  if (stats.topCountries.length > 0) rows.push(["top_territories", stats.topCountries.join(" / ")]);
  return rows;
}

function SetDetail() {
  const { set, stats } = Route.useLoaderData();
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const playTrack = useStore((s) => s.playTrack);
  const isLoaded = nowPlaying?.id === set.id;
  const isThisPlaying = isLoaded && isPlaying;

  const isFirstLoading = !hasTypedSetDetail;
  useEffect(() => {
    hasTypedSetDetail = true;
  }, []);

  const metaRows: Array<[string, string]> = (
    [
      set.title && ["event", set.title],
      set.date && ["date", set.date],
      // set.venue && ["loc", set.venue],
      set.duration && ["duration", set.duration],
    ] as Array<[string, string] | false>
  ).filter((row): row is [string, string] => Boolean(row));

  const statsRows = stats ? buildStatsRows(stats) : [];

  return (
    <PageLayout footer="[ end_of_transmission ]">
      <div className="flex-1">
        <Link
          to="/sets"
          preload="intent"
          className="inline-flex items-center gap-2 text-sm sm:text-base text-grey hover:text-purple transition-colors mb-10"
        >
          ‹ sets_archive
        </Link>

        {set.artwork && (
          <Image
            src={set.artwork}
            alt={set.title}
            sizes="(min-width: 768px) 448px, 100vw"
            priority
            className="w-full max-w-md aspect-square object-cover mb-6 mx-auto"
          />
        )}

        <div className="space-y-1 mb-8">
          {metaRows.map(([label, value]) => (
            <TerminalRow key={label} label={label} value={value} />
          ))}
          <TerminalRow
            label="status"
            value={
              isThisPlaying ? <span className="text-gold">[ live ]</span> : <span>[ ready ]</span>
            }
          />
          {statsRows.length > 0 && (
            <>
              {/* <Label className="pt-3 text-grey">· · ·</Label> */}
              {statsRows.map(([label, value]) => (
                <TerminalRow key={label} label={label} value={value} dimValue />
              ))}
            </>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight mb-2">
          <PageTitle>{set.artist}</PageTitle>
        </h1>

        {set.description && (
          <ConsoleWriter isFirstLoading={isFirstLoading}>{set.description}</ConsoleWriter>
        )}

        <button
          type="button"
          onClick={() => playTrack(set)}
          className="flex items-center justify-center gap-4 w-full sm:w-auto sm:px-12 border border-grey/20 px-6 py-4 mb-8! text-sm sm:text-base text-grey hover:border-purple hover:text-white transition-colors"
        >
          <span className="text-gold">{isThisPlaying ? <PauseIcon /> : <PlayIcon />}</span>
          {isThisPlaying ? "now_playing" : "play_set"}
        </button>
      </div>
    </PageLayout>
  );
}
