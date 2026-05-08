import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { PageTitle } from "~/components/Text";
import { sets } from "~/data/sets";
import { useStore } from "~/store";

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
  staleTime: 5 * 60 * 1000, // play counts are slow-changing — reuse for 5 min
  pendingMs: 0,
  pendingComponent: SetsSkeleton,
  component: Sets,
});

function SetsSkeleton() {
  return (
    <PageLayout footer="[ end_of_archive ]">
      <div className="flex-1">
        <div className="mb-10">
          <div className="h-9 w-52 bg-white/10 animate-pulse mb-2" />
          <div className="h-3 w-28 bg-white/10 animate-pulse" />
        </div>
        <div className="mb-10">
          <div className="h-3 w-36 bg-white/10 animate-pulse mb-3" />
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
            <div key={i} className="flex items-center py-3 border-b border-white/5">
              <div className="flex-1 h-3.5 bg-white/10 animate-pulse" />
              <div className="shrink-0 ml-8 w-3 h-3.5 bg-white/10 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

function Sets() {
  const playCounts = Route.useLoaderData();
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const loadTrack = useStore((s) => s.loadTrack);
  const setIsPlaying = useStore((s) => s.setIsPlaying);

  const groups = sets.reduce<Record<string, typeof sets>>((acc, set) => {
    if (!acc[set.title]) acc[set.title] = [];
    const group = acc[set.title];
    if (group) group.push(set);
    return acc;
  }, {});

  return (
    <PageLayout footer="[ end_of_archive ]">
      {Object.entries(groups).map(([title, groupSets]) => {
        const shortTitle = title.replace(/^form:at\s+/i, "").trim();
        return (
          <section key={title} className="mb-10">
            <PageTitle>002 : audio_extracted</PageTitle>

            <ul>
              {groupSets.map((set) => {
                const isLoaded = nowPlaying?.id === set.id;
                const isThisPlaying = isLoaded && isPlaying;
                const plays = playCounts[set.id] ?? 0;
                return (
                  <li
                    key={set.id}
                    className="flex items-center py-3 border-b border-white/5 last:border-0"
                  >
                    <Link
                      to="/sets/$setId"
                      params={{ setId: set.id }}
                      className="flex-1 min-w-0 cursor-pointer group"
                    >
                      <span
                        className={`text-sm sm:text-base transition-colors ${
                          isThisPlaying ? "text-gold" : "text-grey group-hover:text-white"
                        }`}
                      >
                        {set.artist}
                      </span>
                      {plays > 0 && (
                        <span className="ml-3 text-xs text-gold tabular-nums">› {plays}</span>
                      )}
                    </Link>
                    <button
                      type="button"
                      onClick={() => (isLoaded ? setIsPlaying(!isPlaying) : loadTrack(set))}
                      aria-label={`Play ${set.artist}`}
                      className="shrink-0 ml-8 text-grey hover:text-gold transition-colors cursor-pointer text-sm"
                    >
                      {isThisPlaying ? "⏸" : "▶"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </PageLayout>
  );
}
