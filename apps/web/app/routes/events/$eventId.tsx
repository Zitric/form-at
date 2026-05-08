import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { Image } from "~/components/Image";
import { PageLayout } from "~/components/PageLayout";
import { TerminalRow } from "~/components/TerminalRow";
import { Label } from "~/components/Text";
import { getDJ } from "~/data/djs";
import { getEvent } from "~/data/events";

export const Route = createFileRoute("/events/$eventId")({
  loader: async ({ params }) => {
    const event = getEvent(params.eventId);
    if (!event) throw notFound();
    const lineup = event.lineupIds.map((id) => getDJ(id)).filter(Boolean);
    return { event, lineup };
  },
  component: EventDetail,
});

function EventDetail() {
  const { event, lineup } = Route.useLoaderData();

  const metaRows: Array<[string, string]> = [
    ["date", event.date],
    ["venue", event.venue],
    ["time", event.runtime],
    ["audio", event.audio],
  ];

  return (
    <PageLayout footer="[ end_of_transmission ]">
      <div className="flex-1">
        <Link
          to="/events"
          preload="intent"
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-grey hover:text-purple transition-colors mb-10"
        >
          ‹ events_archive
        </Link>

        {event.flyer && (
          <Image
            src={event.flyer}
            alt={event.title}
            sizes="(min-width: 768px) 560px, 100vw"
            priority
            className="w-full max-w-2xl object-contain mb-10 mx-auto rounded-lg"
          />
        )}

        <h1 className="text-3xl sm:text-4xl font-display font-bold leading-tight tracking-tight mb-2">
          {event.title}
        </h1>

        <div className="space-y-1 mb-8">
          {metaRows.map(([label, value]) => (
            <TerminalRow key={label} label={label} value={value} />
          ))}
        </div>

        {lineup.length > 0 && (
          <div className="mb-10">
            <Label className="mb-3 text-grey">lineup</Label>
            <ul className="space-y-1.5">
              {lineup.map((dj) => {
                if (!dj) return null;
                return (
                  <li key={dj.id}>
                    <Link
                      to="/djs/$djId"
                      params={{ djId: dj.id }}
                      preload="intent"
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-grey/20 text-grey hover:border-purple hover:text-purple transition-colors rounded"
                    >
                      {dj.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
