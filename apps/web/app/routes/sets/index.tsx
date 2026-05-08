import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Card } from "~/components/Card";
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
            <div key={i} className="flex items-center gap-4 p-4 border border-grey/10 mb-px">
              <div className="shrink-0 w-20 h-20 sm:w-28 sm:h-28 bg-white/10 animate-pulse" />
              <div className="flex-1">
                <div className="h-4 bg-white/10 animate-pulse mb-2 w-48" />
                <div className="h-3 bg-white/10 animate-pulse w-32" />
              </div>
              <div className="shrink-0 h-4 w-12 bg-white/10 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

function Sets() {
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
        return (
          <section key={title} className="mb-10">
            <PageTitle>002 : audio_extracted</PageTitle>

            <ul className="space-y-px">
              {groupSets.map((set, index) => {
                const isLoaded = nowPlaying?.id === set.id;
                return (
                  <li key={set.id}>
                    <Card
                      imageSrc={set.artwork}
                      imageAlt={set.title}
                      onClick={() => (isLoaded ? setIsPlaying(!isPlaying) : loadTrack(set))}
                      action={
                        <Link
                          to="/sets/$setId"
                          params={{ setId: set.id }}
                          preload="intent"
                          className="inline-flex items-center gap-2 px-3 py-2 text-xs text-grey hover:text-purple hover:border hover:border-purple/30 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          [ info ]
                        </Link>
                      }
                      animationDelay={index}
                    >
                      <div className="flex flex-col gap-1">
                        <p className="text-sm sm:text-base tracking-tight truncate">
                          {set.artist} @ {set.title}, Glasgow
                        </p>
                        {set.date && (
                          <p className="text-xs sm:text-sm text-grey truncate">{set.date}</p>
                        )}
                      </div>
                    </Card>
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
