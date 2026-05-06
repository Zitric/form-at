import { Link, createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "~/components/PageLayout";
import { Body } from "~/components/Text";

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
        <div className="space-y-2 mb-8 sm:mb-12">
          {taglines.map((line) => (
            <Body key={line}>
              <span className="text-gold mr-2">›</span>
              {line}
            </Body>
          ))}
        </div>

        <Link
          to="/sets"
          className="inline-flex items-center gap-4 self-start border border-grey/20 px-5 py-3 text-sm sm:text-base text-grey hover:border-purple hover:text-white transition-colors"
        >
          <span className="text-gold">›</span>
          sets_archive
          <span className="text-grey">[ enter ]</span>
        </Link>
      </div>
    </PageLayout>
  );
}
