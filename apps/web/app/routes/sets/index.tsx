import { Link, createFileRoute } from "@tanstack/react-router";
import { usePlayer } from "~/contexts/player-context";
import { sets } from "~/data/sets";

export const Route = createFileRoute("/sets/")({
  component: Sets,
});

function Sets() {
  const { nowPlaying, loadTrack } = usePlayer();

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

      <div className="flex-1">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">SETS_ARCHIVE</h1>
          <p className="text-xs text-white/30">
            › {sets.length} record{sets.length !== 1 ? "s" : ""} found
          </p>
        </div>

        <ul className="space-y-px">
          {sets.map((set, i) => {
            const isPlaying = nowPlaying?.id === set.id;
            return (
              <li key={set.id}>
                <button
                  type="button"
                  onClick={() => loadTrack(set)}
                  className="w-full text-left px-4 py-4 flex items-center gap-5 border border-white/10 hover:border-white/30 transition-colors group"
                >
                  <span className="text-xs text-white/20 tabular-nums w-5 shrink-0">
                    {isPlaying ? (
                      <span className="text-gold">▶</span>
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate group-hover:text-gold transition-colors">
                      {set.title}
                    </div>
                    <div className="text-xs text-white/40 truncate mt-0.5">
                      {set.artist}
                      {set.venue && (
                        <span className="text-white/20"> › {set.venue}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right hidden sm:block">
                    <div className="text-[10px] text-white/25">{set.date}</div>
                    {set.duration && (
                      <div className="text-[10px] text-white/20 mt-0.5">{set.duration}</div>
                    )}
                  </div>

                  <Link
                    to="/sets/$setId"
                    params={{ setId: set.id }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-[10px] text-white/20 hover:text-gold transition-colors px-2 py-1 border border-transparent hover:border-white/20"
                  >
                    [ info ]
                  </Link>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="mt-12 text-xs text-white/20">
        [ end_of_archive ] █
      </footer>
    </main>
  );
}
