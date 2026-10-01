import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { AppLaunchTracker } from "~/components/AppLaunchTracker";
import { BeaconQueueFlusher } from "~/components/BeaconQueueFlusher";
import { BottomNav } from "~/components/BottomNav";
import { CatalogueSync } from "~/components/CatalogueSync";
import { DevModeBanner } from "~/components/DevModeBanner";
import { Header } from "~/components/Header";
import { HydrateStore } from "~/components/HydrateStore";
import { InAppBrowserBanner } from "~/components/InAppBrowserBanner";
import { InstallEventsListener } from "~/components/InstallEventsListener";
import { NotFoundPage } from "~/components/NotFoundPage";
import { OfflineReconciler } from "~/components/OfflineReconciler";
import { ShareModal } from "~/components/ShareModal";
import { SwipeNavigator } from "~/components/SwipeNavigator";
import { Toast } from "~/components/Toast";
import { PlaybackErrorToast, Player } from "~/components/player";
import { StoryFlowHost } from "~/components/story/StoryFlowHost";
import { fontCSS } from "~/styles/fontCSS";
import { LAYOUT } from "~/styles/layout";
import "~/styles/global.css";
import { rootHead } from "~/utils/rootHead";

export const Route = createRootRoute({
  notFoundComponent: NotFoundPage,
  head: rootHead,
  component: Root,
});

function Root() {
  return (
    // --mini-player-h: the home page always reserves the mini player's height
    // on phones ("Fitting the home page on a short phone", global.css).
    <html
      lang="en"
      style={{ "--mini-player-h": `${LAYOUT.playerHeightMobile}px` } as CSSProperties}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: critical font + reset CSS must be inlined */}
        <style dangerouslySetInnerHTML={{ __html: fontCSS }} suppressHydrationWarning />
        <HeadContent />
      </head>
      <body className="bg-black text-white font-mono antialiased min-h-dvh flex flex-col">
        <DevModeBanner />
        <HydrateStore />
        <InstallEventsListener />
        <CatalogueSync />
        <OfflineReconciler />
        <BeaconQueueFlusher />
        <AppLaunchTracker />
        <Header />
        <SwipeNavigator />
        <Player />
        <PlaybackErrorToast />
        <Toast />
        <ShareModal />
        <StoryFlowHost />
        <InAppBrowserBanner />
        <BottomNav />
        <Scripts />
      </body>
    </html>
  );
}
