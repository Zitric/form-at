import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getEvent } from "vinxi/http";
import { Header } from "~/components/Header";
import { usePlayer } from "~/contexts/player-context";
import { sets } from "~/data/sets";

const fetchPlayCounts = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const event = getEvent();
    const cf = (event.context as Record<string, unknown>).cloudflare as
      | { env: { DB: D1Database } }
      | undefined;
    const db = cf?.env?.DB;
    if (!db) return {} as Record<string, number>;

    const { results } = await db
      .prepare("SELECT set_id, COUNT(*) AS count FROM plays GROUP BY set_id")
      .all<{ set_id: string; count: number }>();

    return Object.fromEntries(results.map((r) => [r.set_id, r.count]));
  } catch {
    return {} as Record<string, number>;
  }
});

export const Route = createFileRoute("/sets/")({
  loader: () => fetchPlayCounts(),
  component: Sets,
});

function Sets() {
  const playCounts = Route.useLoaderData();
  const { nowPlaying, loadTrack } = usePlayer();

  return (
    <main className="min-h-dvh flex flex-col px-6 py-10 font-mono max-w-2xl mx-auto w-full">
      <Header />

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
            const plays = playCounts[set.id] ?? 0;
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
                    {plays > 0 && (
                      <div className="text-[10px] text-gold/50 mt-0.5">
                        › {plays} play{plays !== 1 ? "s" : ""}
                      </div>
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
