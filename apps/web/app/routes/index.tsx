import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConsoleWriter } from "~/components/ConsoleWriter";
import { PageLayout } from "~/components/PageLayout";
import { SocialLink } from "~/components/SocialLink";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import { useStore } from "~/store";
import { pageHead } from "~/utils/head";

const mainText =
  "Based in Glasgow, Form:at is an underground techno and electro initiative, dedicated to finding an analog soul in an increasingly digital world. Our operations are grassroots, building intimate, community-focused spaces where music is curated with care and mutual respect is prioritized. We create void points to escape the noise. Join us to disconnect and reconnect with the source.";

// Module-level flag — true once the typewriter has played in this client session.
// Resets on full page reload (the JS bundle re-evaluates), persists across
// client-side navigations (Home unmounts/remounts but the module stays loaded).
// SSR also gets a fresh module per request so the first server render animates.
let hasTypedHome = false;

export const Route = createFileRoute("/")({
  head: () =>
    pageHead({
      title: "Form:at",
      description: "Glasgow techno collective. Analog soul in a digital world.",
      path: "/",
    }),
  component: Home,
});

function Home() {
  const isFirstLoading = !hasTypedHome;
  const isFirstLoad = useFirstLoad();
  const navigate = useNavigate();

  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const playTrack = useStore((s) => s.playTrack);

  useEffect(() => {
    hasTypedHome = true;
  }, []);

  const handleListenClick = () => {
    // If track is saved and not playing: resume it (synchronously, preserves user gesture)
    if (nowPlaying && !isPlaying) {
      playTrack(nowPlaying);
    } else {
      // Otherwise navigate to sets (either no track or already playing)
      navigate({ to: "/sets" });
    }
  };

  return (
    <PageLayout>
      <div className="flex flex-col justify-start sm:justify-center sm:py-16">
        <div className="space-y-2 mb-8 sm:mb-12 min-h-[20dvh]">
          <ConsoleWriter isFirstLoading={isFirstLoading}>{mainText}</ConsoleWriter>
        </div>

        <button
          type="button"
          onClick={handleListenClick}
          className="flex items-center justify-center gap-4 self-center w-full sm:w-auto sm:px-24 border border-grey/20 px-6 py-4 text-sm sm:text-base text-grey hover:border-purple hover:text-white transition-colors"
          style={{
            animation: isFirstLoad
              ? "fade-in 5s ease-out, border-pulse 2s ease-in-out 5s infinite"
              : "fade-in 0.6s ease-out, border-pulse 2s ease-in-out 0.6s infinite",
          }}
          suppressHydrationWarning
        >
          <span className="text-gold">›</span>
          <span>{nowPlaying && !isPlaying ? "resume_signal" : "access_audio [ listen ]"}</span>
        </button>

        <div
          className="flex items-center justify-center gap-10 my-8"
          style={{ animation: isFirstLoad ? "fade-in 5s ease-out" : "fade-in 0.6s ease-out" }}
          suppressHydrationWarning
        >
          <SocialLink
            href="https://www.instagram.com/form.at_glasgow/"
            className="text-sm text-grey hover:text-white transition-colors tracking-widest"
          >
            [ instagram ]
          </SocialLink>
          <a
            href="mailto:format.gla@gmail.com"
            className="text-sm text-grey hover:text-white transition-colors tracking-widest"
          >
            [ bookings ]
          </a>
        </div>
      </div>
    </PageLayout>
  );
}
