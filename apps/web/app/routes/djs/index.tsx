import { Link, createFileRoute } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { Card } from "~/components/Card";
import { PageLayout } from "~/components/PageLayout";
import { Body, Label, PageTitle } from "~/components/Text";
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
          {residents.map((dj, index) => (
            <li key={dj.id}>
              <Card
                imageSrc={dj.photo}
                imageAlt={dj.name}
                onClick={() => {}}
                action={
                  <Link
                    to="/djs/$djId"
                    params={{ djId: dj.id }}
                    preload="intent"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs text-grey hover:text-purple hover:border hover:border-purple/30 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    [ info ]
                  </Link>
                }
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
          ))}
        </ul>
      </section>

      {/* Guests */}
      <section className="mb-12">
        <PageTitle>guest_transmissions</PageTitle>
        <ul className="space-y-px">
          {guests.map((dj, index) => (
            <li key={dj.id}>
              <Card
                action={
                  <Link
                    to="/djs/$djId"
                    params={{ djId: dj.id }}
                    preload="intent"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs text-grey hover:text-purple hover:border hover:border-purple/30 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    [ info ]
                  </Link>
                }
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
          ))}
        </ul>
      </section>
    </PageLayout>
  );
}
