import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { Body, Label } from "~/components/Text";
import { usePlayer } from "~/contexts/player-context";
import { sets } from "~/data/sets";

const fetchPlayCounts = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  try {
    const cf = (context as unknown as Record<string, unknown>).cloudflare as
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
  loader: async () => {
    try {
      return await fetchPlayCounts();
    } catch {
      return {} as Record<string, number>;
    }
  },
  component: Sets,
});

function Sets() {
  const playCounts = Route.useLoaderData();
  const { nowPlaying, loadTrack } = usePlayer();

  return (
    <PageLayout footer="[ end_of_archive ]">
      <div className="flex-1">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">SETS_ARCHIVE</h1>
          <Label>
            › {sets.length} record{sets.length !== 1 ? "s" : ""} found
          </Label>
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
                  <span className="text-sm text-white/20 tabular-nums w-5 shrink-0">
                    {isPlaying ? (
                      <span className="text-gold">▶</span>
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold truncate group-hover:text-gold transition-colors">
                      <BrandTitle>{set.title}</BrandTitle>
                    </div>
                    <Body as="div" className="truncate mt-0.5">
                      {set.artist}
                      {set.venue && <span className="text-white/20"> › {set.venue}</span>}
                    </Body>
                  </div>

                  <div className="shrink-0 text-right hidden sm:block">
                    <div className="text-xs text-white/25">{set.date}</div>
                    {set.duration && (
                      <div className="text-xs text-white/20 mt-0.5">{set.duration}</div>
                    )}
                    {plays > 0 && (
                      <div className="text-xs text-gold/50 mt-0.5">
                        › {plays} play{plays !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>

                  <Link
                    to="/sets/$setId"
                    params={{ setId: set.id }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-xs text-white/20 hover:text-gold transition-colors px-2 py-1 border border-transparent hover:border-white/20"
                  >
                    [ info ]
                  </Link>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </PageLayout>
  );
}
