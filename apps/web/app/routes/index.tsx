import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConsoleWriter } from "~/components/ConsoleWriter";
import { PageLayout } from "~/components/PageLayout";

const mainText =
  "Based in Glasgow, Form:at is an underground techno and electro initiative, dedicated to finding an analog soul in an increasingly digital world. Our operations are grassroots, building intimate, community-focused spaces where music is curated with care and mutual respect is prioritized. We create void points to escape the noise. Join us to disconnect and reconnect with the source.";

// Module-level flag — true once the typewriter has played in this client session.
// Resets on full page reload (the JS bundle re-evaluates), persists across
// client-side navigations (Home unmounts/remounts but the module stays loaded).
// SSR also gets a fresh module per request so the first server render animates.
let hasTypedHome = false;

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const isFirstLoading = !hasTypedHome;

  useEffect(() => {
    hasTypedHome = true;
  }, []);

  return (
    <PageLayout footer="[ disconnect_to_reconnect ]">
      <div className="flex flex-col justify-start sm:justify-center pt-4 sm:py-16">
        <div className="space-y-2 mb-8 sm:mb-12 min-h-[20dvh]">
          <ConsoleWriter isFirstLoading={isFirstLoading}>{mainText}</ConsoleWriter>
        </div>

        <Link
          to="/sets"
          preload="intent"
          className="inline-flex self-auto items-center gap-4 self-start border border-grey/20 px-5 py-3 text-sm sm:text-base text-grey hover:border-purple hover:text-white transition-colors "
        >
          <span className="text-gold">›</span>
          <span>access_audio [ listen ]</span>
        </Link>
      </div>
    </PageLayout>
  );
}
