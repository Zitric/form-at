import { Link, createFileRoute } from "@tanstack/react-router";
import { BrandTitle } from "~/components/BrandTitle";
import { PageLayout } from "~/components/PageLayout";
import { Body, Label } from "~/components/Text";
import { getGuests, getResidents } from "~/data/djs";

export const Route = createFileRoute("/djs/")({
  component: DJs,
});

function DJs() {
  const guests = getGuests();
  const residents = getResidents();

  return (
    <PageLayout footer="[ end_of_transmission ]">
      <div className="flex-1">
        <div className="mb-10">
          <h1 className="font-display text-4xl sm:text-5xl tracking-tight mb-1">
            <BrandTitle>DJS_COLLECTIVE</BrandTitle>
          </h1>
          <Label>› {guests.length + residents.length} selectors found</Label>
        </div>

        {/* Guests */}
        <section className="mb-12">
          <Label className="mb-6 text-white/20 tracking-widest uppercase">
            — guest transmissions
          </Label>
          <ul className="space-y-px">
            {guests.map((dj) => (
              <li key={dj.id}>
                <Link
                  to="/djs/$djId"
                  params={{ djId: dj.id }}
                  className="block px-4 py-5 border border-white/10 hover:border-white/30 transition-colors group"
                >
                  <h2 className="font-display text-2xl sm:text-3xl tracking-tight group-hover:text-gold transition-colors mb-1">
                    {dj.name}
                  </h2>
                  {dj.bio && <Body className="line-clamp-1">{dj.bio}</Body>}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Residents */}
        <section>
          <Label className="mb-6 text-white/20 tracking-widest uppercase">— residents</Label>
          <ul className="space-y-px">
            {residents.map((dj) => (
              <li key={dj.id}>
                <Link
                  to="/djs/$djId"
                  params={{ djId: dj.id }}
                  className="flex items-center justify-between px-4 py-4 border border-white/10 hover:border-white/30 transition-colors group"
                >
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl tracking-tight group-hover:text-gold transition-colors">
                      {dj.name}
                    </h2>
                    {dj.bio && <Body className="line-clamp-1 mt-0.5">{dj.bio}</Body>}
                  </div>
                  <Label className="shrink-0 ml-4 text-white/20">[ info ]</Label>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageLayout>
  );
}
