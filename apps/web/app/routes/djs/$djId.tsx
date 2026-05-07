import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { TerminalRow } from "~/components/TerminalRow";
import { Body, Label } from "~/components/Text";
import { getDJ } from "~/data/djs";
import { events } from "~/data/events";
import { getSet } from "~/data/sets";
import { useStore } from "~/store";

export const Route = createFileRoute("/djs/$djId")({
  loader: ({ params }) => {
    const dj = getDJ(params.djId);
    if (!dj) throw notFound();
    const djEvents = events.filter((e) => e.lineupIds.includes(params.djId));
    const sets = (dj.setIds ?? []).map((id) => getSet(id)).filter(Boolean);
    return { dj, djEvents, sets };
  },
  component: DJDetail,
});

function DJDetail() {
  const { dj, djEvents, sets } = Route.useLoaderData();
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const loadTrack = useStore((s) => s.loadTrack);

  return (
    <PageLayout footer="[ end_of_transmission ]">
      <div className="flex-1">
        <Link
          to="/djs"
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-grey hover:text-purple transition-colors mb-10"
        >
          ‹ djs_collective
        </Link>

        <div className="space-y-1 mb-8">
          <TerminalRow label="type" value={dj.type} />
          {djEvents.length > 0 && (
            <TerminalRow label="events" value={`${djEvents.length} transmissions`} />
          )}
          {dj.socials?.instagram && (
            <TerminalRow label="instagram" value={`@${dj.socials.instagram}`} />
          )}
          {dj.socials?.soundcloud && (
            <TerminalRow label="soundcloud" value={dj.socials.soundcloud} />
          )}
        </div>

        <h1 className="font-display text-4xl sm:text-6xl tracking-tight mb-2">
          <BrandTitle>{dj.name}</BrandTitle>
        </h1>

        {dj.bio && <Body className="mb-10 border-l border-grey/10 pl-4 max-w-sm">{dj.bio}</Body>}

        {sets.length > 0 && (
          <section className="mb-12">
            <Label className="mb-4 text-grey tracking-widest uppercase">
              — recorded transmissions
            </Label>
            <ul className="space-y-px">
              {sets.map((set) => {
                if (!set) return null;
                const isThisPlaying = nowPlaying?.id === set.id && isPlaying;
                return (
                  <li key={set.id}>
                    <div className="flex items-center justify-between px-4 py-4 border border-grey/10 group">
                      <div>
                        <p className="font-display text-lg sm:text-xl tracking-tight transition-colors">
                          {set.title}
                        </p>
                        {set.date && <Label>{set.date}</Label>}
                      </div>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        <Link
                          to="/sets/$setId"
                          params={{ setId: set.id }}
                          className="text-xs text-grey hover:text-purple transition-colors"
                        >
                          [ info ]
                        </Link>
                        <button
                          type="button"
                          onClick={() => loadTrack(set)}
                          className={`text-xs transition-colors cursor-pointer ${isThisPlaying ? "text-gold" : "text-grey hover:text-gold"}`}
                        >
                          {isThisPlaying ? "⏸" : "▶"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {djEvents.length > 0 && (
          <section>
            <Label className="mb-4 text-grey tracking-widest uppercase">— events</Label>
            <ul className="space-y-px">
              {djEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    to="/events"
                    className="flex items-center justify-between px-4 py-4 border border-grey/10 hover:border-purple transition-colors group"
                  >
                    <div>
                      <p className="font-display text-lg sm:text-xl tracking-tight group-hover:text-white transition-colors">
                        {event.title}
                      </p>
                      <Label>
                        {event.date} · {event.venue}
                      </Label>
                    </div>
                    <Label className="shrink-0 ml-4 text-grey group-hover:text-purple transition-colors">
                      {event.status === "upcoming" ? "[ soon ]" : "[ past ]"}
                    </Label>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageLayout>
  );
}
