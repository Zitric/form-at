import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { TerminalRow } from "~/components/TerminalRow";
import { Body, Label } from "~/components/Text";
import { fetchSetStats } from "~/data/set-stats";
import type { SetStats } from "~/data/set-stats";
import { getSet } from "~/data/sets";
import { useStore } from "~/store";
import { fmtDate, fmtDuration } from "~/utils/fmt";

export const Route = createFileRoute("/sets/$setId")({
  loader: async ({ params }) => {
    const set = getSet(params.setId);
    if (!set) throw notFound();
    const stats = await fetchSetStats({ data: params.setId }).catch(() => null);
    return { set, stats };
  },
  component: SetDetail,
});

function buildStatsRows(stats: SetStats): Array<[string, string]> {
  const rows: Array<[string, string]> = [["plays", `${stats.playCount}`]];
  if (stats.totalSeconds > 0)
    rows.push(["signal_time", `${fmtDuration(stats.totalSeconds)} total`]);
  if (stats.avgSeconds > 0) rows.push(["avg_session", fmtDuration(Math.round(stats.avgSeconds))]);
  if (stats.countryCount > 0)
    rows.push([
      "reach",
      `${stats.countryCount} ${stats.countryCount === 1 ? "territory" : "territories"}`,
    ]);
  if (stats.topCountries.length > 0) rows.push(["top_territories", stats.topCountries.join(" / ")]);
  if (stats.firstPlay) rows.push(["first_tx", fmtDate(stats.firstPlay)]);
  return rows;
}

function SetDetail() {
  const { set, stats } = Route.useLoaderData();
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const loadTrack = useStore((s) => s.loadTrack);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const isLoaded = nowPlaying?.id === set.id;
  const isThisPlaying = isLoaded && isPlaying;

  const metaRows: Array<[string, string]> = (
    [
      set.date && ["date", set.date],
      set.venue && ["loc", set.venue],
      set.duration && ["duration", set.duration],
    ] as Array<[string, string] | false>
  ).filter((row): row is [string, string] => Boolean(row));

  const statsRows = stats ? buildStatsRows(stats) : [];

  return (
    <PageLayout footer="[ end_of_transmission ]">
      <div className="flex-1">
        <Link
          to="/sets"
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-grey hover:text-purple transition-colors mb-10"
        >
          ‹ sets_archive
        </Link>

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
              <Label className="pt-3 text-grey">· · ·</Label>
              {statsRows.map(([label, value]) => (
                <TerminalRow key={label} label={label} value={value} dimValue />
              ))}
            </>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight mb-2">
          <BrandTitle>{set.title}</BrandTitle>
        </h1>
        <Body className="mb-10">{set.artist}</Body>

        {set.description && (
          <Body className="leading-relaxed mb-10 border-l border-grey/10 pl-4">
            {set.description}
          </Body>
        )}

        <button
          type="button"
          onClick={() => (isLoaded ? setIsPlaying(!isPlaying) : loadTrack(set))}
          className="inline-flex items-center gap-4 border border-grey/20 px-6 py-3 text-sm sm:text-base hover:border-purple hover:text-white transition-colors"
        >
          <span className="text-gold">{isThisPlaying ? "⏸" : "▶"}</span>
          {isThisPlaying ? "now_playing" : "play_set"}
        </button>
      </div>
    </PageLayout>
  );
}
