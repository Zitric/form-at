import { getDJ } from "@form-at/data/djs";
import { events, type Event } from "@form-at/data/events";
import { BracketLabel, Card, PageTitle, TerminalRow } from "@form-at/ui";
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { ConsoleWriter } from "~/components/ConsoleWriter";
import { Image } from "~/components/Image";
import { JsonLd } from "~/components/JsonLd";
import { PageLayout } from "~/components/PageLayout";
import { SetCard } from "~/components/SetCard";
import { SocialLink } from "~/components/SocialLink";
import { fetchAllSetsForRoute } from "~/data/setsForRoute";
import { useTypedOnce } from "~/hooks/useTypedOnce";
import { fmtEventDay } from "~/utils/fmt";
import { pageHead } from "~/utils/head";
import { djLd } from "~/utils/jsonld";
import { SOCIALS, SOCIAL_ORDER, type SocialKey } from "~/utils/socials";

export const Route = createFileRoute("/djs/$djId")({
  // Async + fetchAllSetsForRoute (the same merged live-D1 + snapshot read
  // /sets/index.tsx uses), not `getSet` against the bare snapshot — a set
  // uploaded since the last deploy used to be invisible on its DJ's page
  // until the next deploy regenerated the snapshot. Filters by `djId`, a
  // real foreign key (see MusicSet.djId's comment in packages/data/src/sets.ts)
  // rather than `dj.setIds`, a hand-maintained array that had drifted to
  // covering only each resident's Form:at 002 set and nothing for guests at
  // all.
  loader: async ({ params }) => {
    const dj = getDJ(params.djId);
    if (!dj) throw notFound();
    const djEvents = events.filter((e) => e.lineupIds.includes(params.djId));
    const upcomingEvents = djEvents.filter((e) => e.status === "upcoming");
    const pastEvents = djEvents.filter((e) => e.status === "past");
    const allSets = await fetchAllSetsForRoute();
    const sets = allSets.filter((s) => s.djId === params.djId);
    return { dj, upcomingEvents, pastEvents, sets };
  },
  head: ({ loaderData }) => {
    const dj = loaderData?.dj;
    if (!dj) return {};
    return pageHead({
      title: `${dj.name} · Form:at`,
      description:
        dj.bio ??
        `${dj.name} — ${dj.type === "resident" ? "resident" : "guest"} DJ at Form:at, Glasgow.`,
      path: `/djs/${dj.id}`,
      // Per-DJ banner generated at build by scripts/generate-og.ts. Falls back
      // to the root /og-image.png if a DJ has no photo (script skips them).
      image: dj.photo ? `/og/djs/${dj.id}.jpg` : undefined,
    });
  },
  component: DJDetail,
});

function DJDetail() {
  const { dj, upcomingEvents, pastEvents, sets } = Route.useLoaderData();
  const navigate = useNavigate();
  const eventCount = upcomingEvents.length + pastEvents.length;
  const eventCountLabel = `${eventCount} ${eventCount === 1 ? "transmission" : "transmissions"}`;

  const isFirstLoading = useTypedOnce("dj-detail");

  return (
    <PageLayout>
      <JsonLd data={djLd(dj)} />
      <div className="flex-1">
        <Link
          to="/djs"
          preload="intent"
          className="inline-flex items-center gap-2 text-sm sm:text-base text-grey hover:text-purple transition-colors mb-6"
        >
          ‹ djs_collective
        </Link>

        {dj.photo && (
          <Image
            src={dj.photo}
            alt={dj.name}
            sizes="(min-width: 768px) 672px, 100vw"
            priority
            className="w-full aspect-square object-cover mb-6 rounded-card"
          />
        )}

        {dj.socials && Object.values(dj.socials).some(Boolean) && (
          <div className="flex justify-center flex-wrap gap-x-5 gap-y-2 mb-6 ">
            {SOCIAL_ORDER.map((key: SocialKey) => {
              const handle = dj.socials?.[key];
              if (!handle) return null;
              const { label, toUrl, androidPackage } = SOCIALS[key];
              return (
                <SocialLink
                  key={key}
                  href={toUrl(handle)}
                  androidPackage={androidPackage}
                  className="text-sm text-grey hover:text-white transition-colors tracking-widest"
                >
                  <BracketLabel>{label}</BracketLabel>
                </SocialLink>
              );
            })}
          </div>
        )}

        <div className="space-y-1 mb-8">
          <TerminalRow label="type" value={dj.type} />
          {eventCount > 0 && <TerminalRow label="events" value={eventCountLabel} />}
          {upcomingEvents.map((event) => (
            <TerminalRow
              key={event.id}
              label="next_transmission"
              value={
                <Link
                  to="/events/$eventId"
                  params={{ eventId: event.id }}
                  preload="intent"
                  className="hover:text-gold transition-colors"
                >
                  {upcomingLabel(event)}
                </Link>
              }
            />
          ))}
        </div>

        <h1 className="font-display text-4xl sm:text-6xl tracking-tight mb-2">
          <BrandTitle>{dj.name}</BrandTitle>
        </h1>

        {dj.bio && <ConsoleWriter isFirstLoading={isFirstLoading}>{dj.bio}</ConsoleWriter>}

        {sets.length > 0 && (
          <section className="mb-12">
            <PageTitle className="mb-4 text-grey tracking-widest">audio_logs</PageTitle>
            <ul className="space-y-px">
              {sets.map((set, index) => (
                <li key={set.id}>
                  <SetCard set={set} index={index} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {pastEvents.length > 0 && (
          <section>
            <PageTitle className="mb-4 text-grey tracking-widest">deployment_history</PageTitle>
            <ul className="space-y-px">
              {pastEvents.map((event, index) => (
                <li key={event.id}>
                  <Card
                    animationDelay={index + sets.length}
                    className="opacity-60"
                    onClick={() =>
                      navigate({ to: "/events/$eventId", params: { eventId: event.id } })
                    }
                  >
                    <p className="text-sm sm:text-base tracking-tight truncate">
                      {event.title} · {event.date} · {event.city}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageLayout>
  );
}

// "Form:at 004 · Sat 05.12 · Stereo": the venue's name without its city. The
// space before each "·" is non-breaking, so a narrow screen (375px) wraps
// after the dot rather than starting a line with it.
function upcomingLabel(event: Event): string {
  const venueName = event.venue.split(",")[0]?.trim() ?? event.venue;
  return [event.title, fmtEventDay(event.date), venueName].join("\u00A0· ");
}
