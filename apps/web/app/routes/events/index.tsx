import { Link, createFileRoute } from "@tanstack/react-router";
import { Card } from "~/components/Card";
import { PageLayout } from "~/components/PageLayout";
import { Label, PageTitle } from "~/components/Text";
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
      {upcoming.length > 0 && (
        <section className="mb-12">
          <Label className="mb-6 text-grey tracking-widest uppercase">— incoming signals</Label>
          <ul className="space-y-px">
            {upcoming.map((event, index) => (
              <li key={event.id}>
                <EventCard event={event} index={index} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <PageTitle>sequence_log</PageTitle>
          <ul className="space-y-px">
            {past.map((event, index) => (
              <li key={event.id}>
                <EventCard event={event} index={index + upcoming.length} past />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageLayout>
  );
}

function EventCard({
  event,
  index,
  past = false,
}: {
  event: ReturnType<typeof getPastEvents>[number];
  index: number;
  past?: boolean;
}) {
  const lineup = event.lineupIds.map((id) => getDJ(id)).filter(Boolean);

  return (
    <Card animationDelay={index} className={past ? "opacity-60" : ""}>
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <p className="font-display text-base sm:text-lg tracking-tight truncate">{event.title}</p>
        <p className="text-xs sm:text-sm text-grey truncate">
          {event.date} · {event.venue}
        </p>
        {lineup.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {lineup.map((dj) => {
              if (!dj) return null;
              return (
                <Link
                  key={dj.id}
                  to="/djs/$djId"
                  params={{ djId: dj.id }}
                  preload="intent"
                  className="text-xs border border-grey/20 px-2 py-0.5 text-grey hover:border-purple hover:text-purple transition-colors"
                >
                  {dj.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
