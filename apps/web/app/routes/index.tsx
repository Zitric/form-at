import { Link, createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "~/components/PageLayout";

const taglines = [
  "system: glasgow techno initiative",
  "source: analog soul in a digital world",
  "mission: disconnect to reconnect",
  "focus: community / music / respect",
];

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <PageLayout footer="[ disconnect_to_reconnect ]">
      <div className="flex-1 flex flex-col justify-start sm:justify-center pt-4 sm:py-16">
        <div className="space-y-2 text-sm text-white/40 mb-8 sm:mb-12">
          {taglines.map((line) => (
            <p key={line}>
              <span className="text-gold mr-2">›</span>
              {line}
            </p>
          ))}
        </div>

        <Link
          to="/sets"
          className="inline-flex items-center gap-4 self-start border border-white/20 px-5 py-3 text-sm text-white/60 hover:border-gold hover:text-gold transition-colors"
        >
          <span className="text-gold">›</span>
          sets_archive
          <span className="text-white/30">[ enter ]</span>
        </Link>
      </div>
    </PageLayout>
  );
}
