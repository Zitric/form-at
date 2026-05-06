import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { usePlayer } from "~/contexts/player-context";
import { getSet } from "~/data/sets";

export const Route = createFileRoute("/sets/$setId")({
  loader: ({ params }) => {
    const set = getSet(params.setId);
    if (!set) throw notFound();
    return set;
  },
  component: SetDetail,
});

function SetDetail() {
  const set = Route.useLoaderData();
  const { nowPlaying, loadTrack } = usePlayer();
  const isPlaying = nowPlaying?.id === set.id;

  const metaRows = (
    [
      set.date && ["date", set.date],
      set.venue && ["loc", set.venue],
      set.duration && ["duration", set.duration],
    ] as Array<[string, string] | false>
  ).filter((row): row is [string, string] => Boolean(row));

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
