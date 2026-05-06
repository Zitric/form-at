import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { usePlayer } from "~/contexts/player-context";
import { fetchSetStats } from "~/data/set-stats";
import type { SetStats } from "~/data/set-stats";
import { getSet } from "~/data/sets";
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
  const { nowPlaying, loadTrack } = usePlayer();
  const isPlaying = nowPlaying?.id === set.id;

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
          className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-gold transition-colors mb-10"
        >
          ‹ sets_archive
        </Link>

        <div className="space-y-1 text-xs text-white/30 mb-8">
          {metaRows.map(([label, value]) => (
            <p key={label}>
              <span className="text-gold mr-2">›</span>
              {label}: {value}
            </p>
          ))}
          <p>
            <span className="text-gold mr-2">›</span>status:{" "}
            {isPlaying ? <span className="text-gold">[ live ]</span> : <span>[ ready ]</span>}
          </p>

          {statsRows.length > 0 && (
            <>
              <p className="pt-3 text-white/10">· · ·</p>
              {statsRows.map(([label, value]) => (
                <p key={label}>
                  <span className="text-gold mr-2">›</span>
                  {label}: <span className="text-white/50">{value}</span>
                </p>
              ))}
            </>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight mb-2">
          <BrandTitle>{set.title}</BrandTitle>
        </h1>
        <p className="text-sm text-white/40 mb-10">{set.artist}</p>

        {set.description && (
          <p className="text-sm text-white/40 leading-relaxed mb-10 border-l border-white/10 pl-4">
            {set.description}
          </p>
        )}

        <button
          type="button"
          onClick={() => loadTrack(set)}
          className="inline-flex items-center gap-4 border border-white/20 px-6 py-3 text-sm hover:border-gold hover:text-gold transition-colors"
        >
          <span className="text-gold">{isPlaying ? "⏸" : "▶"}</span>
          {isPlaying ? "now_playing" : "play_set"}
        </button>
      </div>
    </PageLayout>
  );
}
