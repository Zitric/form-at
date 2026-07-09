import { useEffect } from "react";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { isStandalone } from "~/utils/installCapability";

// Fires `app_launch` exactly once per real page load (cold start / hard
// reload) when running as an installed PWA — never on client-side route
// changes. Like `<HydrateStore>` / `<InstallEventsListener>` /
// `<OfflineReconciler>`, this component lives once in __root's <body> and
// mounts exactly once per document load; TanStack Router's Outlet-based
// navigation between `/`, `/sets`, `/events`, `/djs` never remounts it, so
// a plain mount-only effect IS "session start" here — no dedicated
// session-start hook needed beyond this.
//
// Gated on `isStandalone()` alone, not the `?source=pwa` marker from the
// manifest's `start_url` (N1) — `isStandalone()` is the authoritative
// runtime signal used everywhere else in the app (`useSaveGate`,
// `canFetchPlaybackBytes`, `withAppContext`); requiring the query marker
// too would miss a standalone relaunch that deep-links somewhere other
// than `/` (the marker only appears on the manifest's declared start URL).
export function AppLaunchTracker() {
  const trackEvent = useTrackEvent();

  useEffect(() => {
    if (isStandalone()) trackEvent("app_launch");
  }, [trackEvent]);

  return null;
}
