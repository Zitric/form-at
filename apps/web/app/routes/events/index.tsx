import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card } from "~/components/Card";
import { PageLayout } from "~/components/PageLayout";
import { PageTitle } from "~/components/Text";
import { getPastEvents, getUpcomingEvents } from "~/data/events";
import { pageHead } from "~/utils/head";

export const Route = createFileRoute("/events/")({
  head: () =>
    pageHead({
      title: "Events · Form:at",
      description: "Upcoming and past Form:at events. Glasgow techno collective.",
      path: "/events",
    }),
  component: Events,
});

function Events() {
  const upcoming = getUpcomingEvents();
  const past = getPastEvents();

  return (
    <PageLayout>
      {upcoming.length > 0 && (
        <section className="mb-12">
          <PageTitle>next_transmission</PageTitle>
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
  const navigate = useNavigate();

  return (
    <Card
      animationDelay={index}
      variant={past ? "default" : "cta"}
      className={past ? "opacity-60" : ""}
      onClick={() => navigate({ to: "/events/$eventId", params: { eventId: event.id } })}
    >
      <p className="text-sm sm:text-base tracking-tight truncate text-center">
        {event.title} · {event.date} · Glasgow
      </p>
    </Card>
  );
}
