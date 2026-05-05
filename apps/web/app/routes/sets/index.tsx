import { Link, createFileRoute } from "@tanstack/react-router";
import { usePlayer } from "~/contexts/player-context";
import { sets } from "~/data/sets";

export const Route = createFileRoute("/sets/")({
  component: Sets,
});

function Sets() {
  const { nowPlaying, loadTrack } = usePlayer();

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-8">Sets</h1>
      <ul className="space-y-px">
        {sets.map((set) => (
          <li key={set.id}>
            <button
              type="button"
              onClick={() => loadTrack(set)}
              className="w-full text-left px-4 py-4 flex items-center gap-4 border border-white/10 hover:border-white/40 transition-colors group"
            >
              <span className="w-4 shrink-0 text-white/40 group-hover:text-white/70 text-sm">
                {nowPlaying?.id === set.id ? "▶" : ""}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{set.title}</div>
                <div className="text-sm text-white/50 truncate">
                  {set.artist} · {set.date}
                </div>
              </div>
              <Link
                to="/sets/$setId"
                params={{ setId: set.id }}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-white/30 hover:text-white/70 shrink-0 transition-colors"
              >
                Details
              </Link>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
