import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card } from "~/components/Card";
import { PageLayout } from "~/components/PageLayout";
import { Label, PageTitle } from "~/components/Text";
import { getGuests, getResidents } from "~/data/djs";

export const Route = createFileRoute("/djs/")({
  component: DJs,
});

function DJs() {
  const guests = getGuests();
  const residents = getResidents();

  return (
    <PageLayout footer="[ end_of_transmission ]">
      {/* Residents */}
      <section>
        <PageTitle>system_architects</PageTitle>
        <ul className="space-y-px mb-6">
          {residents.map((dj, index) => {
            const navigate = useNavigate();
            return (
              <li key={dj.id}>
                <Card
                  imageSrc={dj.photo}
                  imageAlt={dj.name}
                  onClick={() => navigate({ to: "/djs/$djId", params: { djId: dj.id } })}
                  animationDelay={index}
                >
                  <div className="flex flex-col gap-1">
                    <p className="font-display text-base sm:text-lg tracking-tight truncate">
                      {dj.name}
                    </p>
                    {dj.bio && <p className="text-xs sm:text-sm text-grey truncate">{dj.bio}</p>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Guests */}
      <section className="mb-12">
        <PageTitle>guest_transmissions</PageTitle>
        <ul className="space-y-px">
          {guests.map((dj, index) => {
            const navigate = useNavigate();
            return (
              <li key={dj.id}>
                <Card
                  onClick={() => navigate({ to: "/djs/$djId", params: { djId: dj.id } })}
                  animationDelay={index + residents.length}
                >
                  <div className="flex flex-col gap-1">
                    <p className="font-display text-base sm:text-lg tracking-tight truncate">
                      {dj.name}
                    </p>
                    {dj.bio && <p className="text-xs sm:text-sm text-grey truncate">{dj.bio}</p>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </PageLayout>
  );
}
