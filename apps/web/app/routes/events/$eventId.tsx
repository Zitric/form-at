import { PageTitle, TerminalRow } from "@form-at/ui";

import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { AddToCalendarButton } from "~/components/AddToCalendarButton";
import { Image } from "~/components/Image";
import { JsonLd } from "~/components/JsonLd";
import { PageLayout } from "~/components/PageLayout";
import { getDJ } from "~/data/djs";
import { getEvent } from "~/data/events";
import { pageHead } from "~/utils/head";
import { eventLd } from "~/utils/jsonld";

export const Route = createFileRoute("/events/$eventId")({
  loader: async ({ params }) => {
    const event = getEvent(params.eventId);
    if (!event) throw notFound();
    const lineup = event.lineupIds.map((id) => getDJ(id)).filter(Boolean);
    return { event, lineup };
  },
  head: ({ loaderData }) => {
    const event = loaderData?.event;
    if (!event) return {};
    return pageHead({
      title: `${event.title} · ${event.date}`,
      description:
        event.description ?? `${event.title} on ${event.date} at ${event.venue}. ${event.audio}.`,
      path: `/events/${event.id}`,
      // Per-event banner generated at build by scripts/generate-og.ts
      // (flyer + title + date composition). Falls back to /og-image.png if missing.
      image: event.flyer ? `/og/events/${event.id}.png` : undefined,
    });
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
    <PageLayout>
      <JsonLd data={eventLd(event, lineup)} />
      <div className="flex-1">
        <Link
          to="/events"
          preload="intent"
          className="inline-flex items-center gap-2 text-sm sm:text-base text-grey hover:text-purple transition-colors mb-10"
        >
          ‹ events_archive
        </Link>

        <PageTitle className="text-3xl sm:text-4xl font-display font-bold leading-tight tracking-tight mb-2">
          {event.title}
        </PageTitle>

        <div className="space-y-1 mb-6">
          {metaRows.map(([label, value]) => (
            <TerminalRow key={label} label={label} value={value} />
          ))}
        </div>

        {lineup.length > 0 ? (
          <div className="mb-10">
            <PageTitle>lineup</PageTitle>
            <p className="text-sm sm:text-base text-grey leading-relaxed">
              {lineup.map((dj, i) => {
                if (!dj) return null;
                return (
                  <span key={dj.id}>
                    {i > 0 && <span className="text-grey/40 mx-2">/</span>}
                    <Link
                      to="/djs/$djId"
                      params={{ djId: dj.id }}
                      preload="intent"
                      className="hover:text-gold transition-colors"
                    >
                      {dj.name}
                    </Link>
                  </span>
                );
              })}
            </p>
            {/* Placed here, not at the top of the page: it exists to explain
                a lineup that might look partial (e.g. a co-organized event
                where some names have no Form:at DJ profile) — reads as a
                footnote to the names right above it, not a general blurb. */}
            {event.description && (
              <p className="text-xs text-grey/70 leading-relaxed mt-2">{event.description}</p>
            )}
          </div>
        ) : event.status === "upcoming" ? (
          <div className="mb-10">
            <PageTitle>lineup</PageTitle>
            <p className="text-sm sm:text-base text-grey leading-relaxed">
              lineup will be released soon !
            </p>
          </div>
        ) : null}
      </div>

      {event.flyer && (
        <Image
          src={event.flyer}
          alt={event.title}
          sizes="(min-width: 768px) 560px, 100vw"
          priority
          // Flyers vary in aspect ratio (square posters vs portrait designs),
          // so we let the image render at its natural ratio rather than
          // forcing a square crop. Brief CLS on load is the trade-off; on a
          // detail page with a single hero image, it's acceptable.
          className="w-full max-w-2xl h-auto mb-10 mx-auto rounded-card"
        />
      )}

      {event.status === "upcoming" && (
        <div className="mb-10 flex justify-center">
          <AddToCalendarButton event={event} />
        </div>
      )}
    </PageLayout>
  );
}
