import { useEffect } from "react";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { isStandalone } from "~/utils/installCapability";

// Fires `app_launch` exactly once per real page load (cold start / hard
// reload) when running as an installed PWA — never on client-side route
// changes. This component lives once in __root's <body> and TanStack Router's
// Outlet-based navigation never remounts it, so a plain mount-only effect IS
// "session start" here — no dedicated session-start hook needed.
//
// Gated on `isStandalone()` alone, deliberately NOT the `?source=pwa` marker
// from the manifest's `start_url`: that marker only appears on the declared
// start URL, so requiring it too would miss a standalone relaunch that
// deep-links anywhere else. `isStandalone()` is the runtime signal the rest of
// the app already gates on (`useSaveGate`, `canFetchPlaybackBytes`).
export function AppLaunchTracker() {
  const trackEvent = useTrackEvent();

  useEffect(() => {
    if (isStandalone()) trackEvent("app_launch");
  }, [trackEvent]);

  return null;
}
