import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { AppLaunchTracker } from "~/components/AppLaunchTracker";
import { BeaconQueueFlusher } from "~/components/BeaconQueueFlusher";
import { BottomNav } from "~/components/BottomNav";
import { Header } from "~/components/Header";
import { HydrateStore } from "~/components/HydrateStore";
import { InAppBrowserBanner } from "~/components/InAppBrowserBanner";
import { InstallEventsListener } from "~/components/InstallEventsListener";
import { NotFoundPage } from "~/components/NotFoundPage";
import { OfflineReconciler } from "~/components/OfflineReconciler";
import { ShareModal } from "~/components/ShareModal";
import { SwipeNavigator } from "~/components/SwipeNavigator";
import { Toast } from "~/components/Toast";
import { UpdateToast } from "~/components/UpdateToast";
import { PlaybackErrorToast, Player } from "~/components/player";
import { fontCSS } from "~/styles/fontCSS";
import "~/styles/global.css";
import { rootHead } from "~/utils/rootHead";

export const Route = createRootRoute({
  notFoundComponent: NotFoundPage,
  head: rootHead,
  component: Root,
});

function Root() {
  return (
    <html lang="en">
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: critical font + reset CSS must be inlined */}
        <style dangerouslySetInnerHTML={{ __html: fontCSS }} suppressHydrationWarning />
        <HeadContent />
      </head>
      <body className="bg-black text-white font-mono antialiased min-h-dvh flex flex-col">
        <HydrateStore />
        <InstallEventsListener />
        <OfflineReconciler />
        <BeaconQueueFlusher />
        <AppLaunchTracker />
        <Header />
        <SwipeNavigator />
        <Player />
        <PlaybackErrorToast />
        <Toast />
        <UpdateToast />
        <ShareModal />
        <InAppBrowserBanner />
        <BottomNav />
        <Scripts />
      </body>
    </html>
  );
}
