import { Link, createFileRoute } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { Image } from "~/components/Image";
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
          {residents.map((dj) => (
            <li key={dj.id}>
              <Link
                to="/djs/$djId"
                params={{ djId: dj.id }}
                preload="intent"
                className="flex items-center gap-4 px-4 py-4 border border-grey/10 hover:border-purple transition-colors group"
              >
                {dj.photo && (
                  <Image
                    src={dj.photo}
                    alt={dj.name}
                    sizes="64px"
                    className="w-16 h-16 object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-xl sm:text-2xl tracking-tight group-hover:text-white transition-colors">
                    {dj.name}
                  </h2>
                  {dj.bio && <Body className="line-clamp-1 mt-0.5">{dj.bio}</Body>}
                </div>
                <Label className="shrink-0 text-grey group-hover:text-purple transition-colors">
                  [ info ]
                </Label>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Guests */}
      <section className="mb-12">
        <PageTitle>guest_transmissions</PageTitle>
        <ul className="space-y-px">
          {guests.map((dj) => (
            <li key={dj.id}>
              <Link
                to="/djs/$djId"
                params={{ djId: dj.id }}
                preload="intent"
                className="block px-4 py-5 border border-grey/10 hover:border-purple transition-colors group"
              >
                <h2 className="font-display text-2xl sm:text-3xl tracking-tight group-hover:text-white transition-colors mb-1">
                  {dj.name}
                </h2>
                {dj.bio && <Body className="line-clamp-1">{dj.bio}</Body>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageLayout>
  );
}
