import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BrandTitle } from "~/components/BrandTitle";
import { Card } from "~/components/Card";
import { CirclePlayButton } from "~/components/CirclePlayButton";
import { ConsoleWriter } from "~/components/ConsoleWriter";
import { Image } from "~/components/Image";
import { JsonLd } from "~/components/JsonLd";
import { PageLayout } from "~/components/PageLayout";
import { SocialLink } from "~/components/SocialLink";
import { TerminalRow } from "~/components/TerminalRow";
import { PageTitle } from "~/components/Text";
import { getDJ } from "~/data/djs";
import { events } from "~/data/events";
import { getSet } from "~/data/sets";
import { useStore } from "~/store";
import { pageHead } from "~/utils/head";
import { djLd } from "~/utils/jsonld";
import { SOCIALS, SOCIAL_ORDER, type SocialKey } from "~/utils/socials";

// Module-level flag — true once the typewriter has played on any DJ detail page in this client session.
let hasTypedDjDetail = false;

export const Route = createFileRoute("/djs/$djId")({
  loader: ({ params }) => {
    const dj = getDJ(params.djId);
    if (!dj) throw notFound();
    const djEvents = events.filter((e) => e.lineupIds.includes(params.djId));
    const sets = (dj.setIds ?? []).map((id) => getSet(id)).filter(Boolean);
    return { dj, djEvents, sets };
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
      image: dj.photo ? `/og/djs/${dj.id}.png` : undefined,
    });
  },
  component: DJDetail,
});

function DJDetail() {
  const { dj, djEvents, sets } = Route.useLoaderData();
  const playTrack = useStore((s) => s.playTrack);
  const isPlaying = useStore((s) => s.isPlaying);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const navigate = useNavigate();

  const isFirstLoading = !hasTypedDjDetail;
  useEffect(() => {
    hasTypedDjDetail = true;
  }, []);

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
            className="w-full aspect-square object-cover mb-6"
          />
        )}

        {dj.socials && Object.values(dj.socials).some(Boolean) && (
          <div className="flex justify-center flex-wrap gap-x-5 gap-y-2 mb-6 ">
            {SOCIAL_ORDER.map((key: SocialKey) => {
              const handle = dj.socials?.[key];
              if (!handle) return null;
              const { label, toUrl } = SOCIALS[key];
              return (
                <SocialLink
                  key={key}
                  href={toUrl(handle)}
                  className="text-sm text-grey hover:text-white transition-colors tracking-widest"
                >
                  [ {label} ]
                </SocialLink>
              );
            })}
          </div>
        )}

        <div className="space-y-1 mb-8">
          <TerminalRow label="type" value={dj.type} />
          {djEvents.length > 0 && (
            <TerminalRow label="events" value={`${djEvents.length} transmissions`} />
          )}
        </div>

        <h1 className="font-display text-4xl sm:text-6xl tracking-tight mb-2">
          <BrandTitle>{dj.name}</BrandTitle>
        </h1>

        {dj.bio && <ConsoleWriter isFirstLoading={isFirstLoading}>{dj.bio}</ConsoleWriter>}

        {sets.length > 0 && (
          <section className="mb-12">
            <PageTitle className="mb-4 text-grey tracking-widest">audio_logs</PageTitle>
            <ul className="space-y-px">
              {sets.map((set, index) => {
                if (!set) return null;
                const isThisPlaying = nowPlaying?.id === set.id && isPlaying;

                return (
                  <li key={set.id}>
                    <Card
                      imageSrc={set.artwork}
                      imageAlt={set.title}
                      onClick={() => navigate({ to: "/sets/$setId", params: { setId: set.id } })}
                      action={
                        <CirclePlayButton
                          isThisPlaying={isThisPlaying}
                          onClick={(e) => {
                            e.stopPropagation();
                            playTrack(set);
                          }}
                        />
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
        )}

        {djEvents.length > 0 && (
          <section>
            <PageTitle className="mb-4 text-grey tracking-widest">deployment_history</PageTitle>
            <ul className="space-y-px">
              {djEvents.map((event, index) => (
                <li key={event.id}>
                  <Card
                    animationDelay={index + sets.length}
                    className={event.status === "past" ? "opacity-60" : ""}
                    onClick={() =>
                      navigate({ to: "/events/$eventId", params: { eventId: event.id } })
                    }
                  >
                    <p className="text-sm sm:text-base tracking-tight truncate">
                      {event.title} · {event.date} · Glasgow
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
