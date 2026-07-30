import { Card, PageTitle } from "@form-at/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CardArtwork } from "~/components/CardArtwork";
import { PageLayout } from "~/components/PageLayout";
import { getGuests, getResidents } from "~/data/djs";
import { pageHead } from "~/utils/head";

export const Route = createFileRoute("/djs/")({
  head: () =>
    pageHead({
      title: "DJs · Form:at",
      description: "Residents and guest DJs at Form:at, Glasgow's techno collective.",
      path: "/djs",
    }),
  component: DJs,
});

function DJs() {
  const guests = getGuests();
  const residents = getResidents();
  const navigate = useNavigate();

  return (
    <PageLayout>
      {/* Residents */}
      <section>
        <PageTitle>system_architects</PageTitle>
        <ul className="space-y-px mb-6">
          {residents.map((dj, index) => (
            <li key={dj.id}>
              <Card
                image={dj.photo && <CardArtwork src={dj.photo} alt={dj.name} />}
                onClick={() => navigate({ to: "/djs/$djId", params: { djId: dj.id } })}
                animationDelay={index}
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm sm:text-base tracking-tight truncate">{dj.name}</p>
                  {dj.bio && <p className="text-xs sm:text-sm text-grey truncate">{dj.bio}</p>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* Guests */}
      <section className="mb-12">
        <PageTitle>guest_operators</PageTitle>
        <ul className="space-y-px">
          {guests.map((dj, index) => (
            <li key={dj.id}>
              <Card
                image={dj.photo && <CardArtwork src={dj.photo} alt={dj.name} />}
                onClick={() => navigate({ to: "/djs/$djId", params: { djId: dj.id } })}
                animationDelay={index + residents.length}
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm sm:text-base tracking-tight truncate">{dj.name}</p>
                  {dj.bio && <p className="text-xs sm:text-sm text-grey truncate">{dj.bio}</p>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </PageLayout>
  );
}
