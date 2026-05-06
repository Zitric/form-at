import { Link, createFileRoute } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { Body, Label } from "~/components/Text";
import { getDJ } from "~/data/djs";
import { getPastEvents, getUpcomingEvents } from "~/data/events";

export const Route = createFileRoute("/events/")({
  component: Events,
});

function Events() {
  const upcoming = getUpcomingEvents();
  const past = getPastEvents();

  return (
    <PageLayout footer="[ end_of_transmission ]">
      <div className="flex-1">
        <div className="mb-10">
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight mb-1">
            <BrandTitle>EVENTS</BrandTitle>
          </h1>
          <Label>› {upcoming.length + past.length} transmissions logged</Label>
        </div>

        {upcoming.length > 0 && (
          <section className="mb-12">
            <Label className="mb-6 text-white/20 tracking-widest uppercase">
              — incoming signals
            </Label>
            <ul className="space-y-px">
              {upcoming.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {upcoming.length === 0 && (
          <section className="mb-12">
            <Label className="mb-6 text-white/20 tracking-widest uppercase">
              — incoming signals
            </Label>
            <p className="px-4 py-5 border border-white/10 t-body sm:t-body-md text-white/20">
              no transmissions scheduled — stay tuned
            </p>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <Label className="mb-6 text-white/20 tracking-widest uppercase">— archive</Label>
            <ul className="space-y-px">
              {past.map((event) => (
                <li key={event.id}>
                  <EventCard event={event} past />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageLayout>
  );
}

function EventCard({
  event,
  past = false,
}: { event: ReturnType<typeof getPastEvents>[number]; past?: boolean }) {
  const lineup = event.lineupIds.map((id) => getDJ(id)).filter(Boolean);

  return (
    <div className={`px-4 py-5 border border-white/10 ${past ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <h2 className="font-display text-2xl sm:text-3xl tracking-tight">
          <BrandTitle>{event.title}</BrandTitle>
        </h2>
        <Label className="shrink-0 text-white/20 pt-1">{past ? "[ past ]" : "[ upcoming ]"}</Label>
      </div>

      <div className="space-y-1 mb-4">
        <Label>
          {event.date} · {event.venue}
        </Label>
        <Label>{event.runtime}</Label>
        <Label className="text-white/20">{event.audio}</Label>
      </div>

      {lineup.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {lineup.map((dj) => {
            if (!dj) return null;
            return (
              <Link
                key={dj.id}
                to="/djs/$djId"
                params={{ djId: dj.id }}
                className="text-xs border border-white/20 px-3 py-1 text-white/50 hover:border-gold hover:text-gold transition-colors"
              >
                {dj.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
