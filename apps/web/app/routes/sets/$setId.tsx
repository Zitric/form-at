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
    <main className="max-w-2xl mx-auto px-6 py-16">
      <Link to="/sets" className="text-sm text-white/40 hover:text-white/70 transition-colors">
        ← Sets
      </Link>
      <h1 className="text-3xl font-bold mt-6">{set.title}</h1>
      <p className="text-white/50 mt-2">
        {set.artist} · {set.date}
      </p>
      {set.duration && <p className="text-white/30 text-sm mt-1">{set.duration}</p>}
      <button
        type="button"
        onClick={() => loadTrack(set)}
        className="mt-10 border border-white px-8 py-3 text-sm uppercase tracking-widest hover:bg-white hover:text-[#0a0a0a] transition-colors"
      >
        {isPlaying ? "Now playing" : "Play set"}
      </button>
    </main>
  );
}
