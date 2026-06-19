import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookingsButton } from "~/components/BookingsButton";
import { ConsoleWriter } from "~/components/ConsoleWriter";
import { InstallCta } from "~/components/InstallCta";
import { JsonLd } from "~/components/JsonLd";
import { PageLayout } from "~/components/PageLayout";
import { SocialLink } from "~/components/SocialLink";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import { useTypedOnce } from "~/hooks/useTypedOnce";
import { useStore } from "~/store";
import { pageHead } from "~/utils/head";
import { organizationLd } from "~/utils/jsonld";

const mainText =
  "Based in Glasgow, Form:at is an underground techno and electro initiative, dedicated to finding an analog soul in an increasingly digital world. Our operations are grassroots, building intimate, community-focused spaces where music is curated with care and mutual respect is prioritized. We create void points to escape the noise. Join us to disconnect and reconnect with the source.";

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
  const isFirstLoading = useTypedOnce("home");
  const isFirstLoad = useFirstLoad();
  const navigate = useNavigate();

  // Opacity-transition fade-in to avoid the appear → disappear → fade flash
  // the previous keyframe-on-mount approach caused (full diagnosis in
  // BottomNav.tsx). Unlike the chrome components, Home *does* remount on
  // navigation back to /, so we still honour the first-load gating:
  // 5s on the user's very first visit, 0.6s on subsequent returns.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
  }, []);
  const fadeDuration = isFirstLoad ? "5s" : "0.6s";

  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const playTrack = useStore((s) => s.playTrack);

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
      <JsonLd data={organizationLd()} />
      <div className="flex flex-col justify-start sm:justify-center sm:py-16">
        <div className="space-y-2 mb-8 sm:mb-12 min-h-[20dvh]">
          <ConsoleWriter isFirstLoading={isFirstLoading}>{mainText}</ConsoleWriter>
        </div>

        <button
          type="button"
          onClick={handleListenClick}
          className="flex items-center justify-center gap-4 self-center w-full sm:px-24 border-2 border-grey/20 px-6 py-4 text-sm sm:text-base text-grey hover:border-purple hover:text-white hover:cursor-pointer transition-colors shadow-[0_0_15px_rgba(197,133,56,0.2)] hover:shadow-[0_0_25px_rgba(197,133,56,0.4)]"
          style={{
            opacity: visible ? 1 : 0,
            // Opacity transition for fade-in, keyframe animation for the
            // border pulse — they're independent properties so they coexist
            // cleanly. The pulse waits out the fade by matching the
            // animation-delay to the fade duration so the user reads the
            // text before the border starts breathing.
            transition: `opacity ${fadeDuration} ease-out`,
            animation: `border-pulse 2s ease-in-out ${fadeDuration} infinite`,
          }}
          suppressHydrationWarning
        >
          <span className="text-gold">›</span>
          <span>{nowPlaying && !isPlaying ? "resume_signal" : "access_audio [ listen ]"}</span>
        </button>

        <div
          className="flex items-center justify-center gap-10 my-8"
          style={{
            opacity: visible ? 1 : 0,
            transition: `opacity ${fadeDuration} ease-out`,
          }}
          suppressHydrationWarning
        >
          <SocialLink
            href="https://www.instagram.com/form.at_glasgow/"
            androidPackage="com.instagram.android"
            className="text-sm text-grey hover:text-white transition-colors tracking-widest"
          >
            [ instagram ]
          </SocialLink>
          <BookingsButton className="text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer" />
        </div>

        {/* PWA install CTA — renders only when Chromium fires
            beforeinstallprompt (post-engagement + manifest + SW). Lives
            below the socials so it doesn't compete with the primary CTA but
            stays discoverable. iOS / Firefox: no event = nothing renders. */}
        <div className="flex justify-center -mt-4 mb-8">
          <InstallCta />
        </div>
      </div>
    </PageLayout>
  );
}
