import { Link, createFileRoute, notFound } from "@tanstack/react-router";
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

  return (
    <main className="min-h-dvh flex flex-col px-6 py-10 font-mono">
      <header className="flex items-center gap-3 mb-12">
        <Link to="/" className="flex items-center gap-3 group">
          <img src="/logo.png" alt="Form:at" className="w-7 h-7 mix-blend-screen" />
          <span className="text-xs tracking-[0.3em] text-white/30 group-hover:text-white/60 uppercase transition-colors">
            Form:at
          </span>
        </Link>
      </header>

      <div className="flex-1 max-w-lg">
        <Link
          to="/sets"
          className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-gold transition-colors mb-10"
        >
          ‹ sets_archive
        </Link>

        <div className="space-y-1 text-xs text-white/30 mb-8">
          {set.date && <p><span className="text-gold mr-2">›</span>date: {set.date}</p>}
          {set.venue && <p><span className="text-gold mr-2">›</span>loc: {set.venue}</p>}
          {set.duration && <p><span className="text-gold mr-2">›</span>duration: {set.duration}</p>}
          <p>
            <span className="text-gold mr-2">›</span>status:{" "}
            {isPlaying ? (
              <span className="text-gold">[ live ]</span>
            ) : (
              <span>[ ready ]</span>
            )}
          </p>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight mb-2">
          {set.title}
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

      <footer className="mt-12 text-xs text-white/20">
        [ end_of_transmission ] █
      </footer>
    </main>
  );
}
