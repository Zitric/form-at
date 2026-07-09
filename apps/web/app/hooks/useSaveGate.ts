import { useCallback } from "react";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore, useStoreHydrated } from "~/store";
import { detectPlatform, isStandalone } from "~/utils/installCapability";
import { clearStashedInstallPrompt } from "~/utils/installPromptStash";

// Decides whether the `save_for_offline` action is allowed right now, and if
// not, which guidance to surface in <SaveGateModal>. The gate is binary:
// `allow: true` ONLY when the page is running in standalone display-mode.
// Anything else (regular browser tab, including a tab where the PWA is
// installed elsewhere on the device) routes through the modal instead of
// firing a download.
//
// Why the strict standalone rule: web (browser tab) streams ANY set over the
// network and never reads IDB; the app (standalone) is a superset that adds
// download + offline playback. Drawing the line at `isStandalone()` keeps the
// SW read-path coherent with the UI gate — see `withAppContext` + the SW
// audio handler in `sw.ts`.
//
// Misclassification — `pwaInstalled` is a POSITIVE-ONLY signal:
//   - true  → we trust it: the user already installed somewhere on this
//             device, so the modal says "open it from your home screen"
//             (case b).
//   - false → may mean "never installed" OR "installed but our listener
//             missed it" (older sessions, cleared site data). Default to
//             "install the app" (case a) and let the case-a modal include
//             an "already installed → open it" escape-hatch that flips
//             `pwaInstalled` to true. The case-b modal includes the inverse
//             ("not installed?") so users can recover either direction.
export type SaveGate =
  | { allow: true }
  | { allow: false; reason: "pending" }
  | { allow: false; reason: "open-app" }
  | {
      allow: false;
      reason: "needs-install";
      platform: "chromium" | "ios-safari";
      canPrompt: boolean;
    }
  | { allow: false; reason: "cannot-install" };

export function useSaveGate(): SaveGate {
  const hydrated = useStoreHydrated();
  const pwaInstalled = useStore((s) => s.pwaInstalled);
  const deferredPrompt = useStore((s) => s.deferredPrompt);

  // Before hydration we don't know `pwaInstalled` yet — return `pending` so
  // consumer surfaces render nothing (or a neutral placeholder) rather than
  // briefly assuming the user needs to install.
  if (!hydrated) return { allow: false, reason: "pending" };

  // Authoritative: running in a home-screen-launched PWA → download path is on.
  if (isStandalone()) return { allow: true };

  // Persisted positive signal: user installed before (this device, this
  // origin), but the current document is a browser tab. Send them to the
  // home-screen icon, not back through the install flow.
  if (pwaInstalled) return { allow: false, reason: "open-app" };

  const platform = detectPlatform();
  if (platform === "chromium") {
    return {
      allow: false,
      reason: "needs-install",
      platform: "chromium",
      canPrompt: !!deferredPrompt,
    };
  }
  if (platform === "ios-safari") {
    return { allow: false, reason: "needs-install", platform: "ios-safari", canPrompt: false };
  }

  // Firefox (any platform), iOS Chrome / Firefox / Edge, macOS Safari, empty
  // UA — no install path the user can drive. Modal explains where to open
  // the site instead.
  return { allow: false, reason: "cannot-install" };
}

export type TriggerInstallOutcome = "accepted" | "dismissed" | "no-prompt";

// Fires the native install prompt + handles user choice + cleans up the
// deferred event. Same surface as before (InstallCta on home + SaveGateModal
// share it).
export function useTriggerInstallPrompt(): () => Promise<TriggerInstallOutcome> {
  const deferredPrompt = useStore((s) => s.deferredPrompt);
  const setDeferredPrompt = useStore((s) => s.setDeferredPrompt);
  const setPwaInstallDismissed = useStore((s) => s.setPwaInstallDismissed);
  const trackEvent = useTrackEvent();

  return useCallback(async () => {
    if (!deferredPrompt) return "no-prompt";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "dismissed") {
      setPwaInstallDismissed(true);
      // Native browser dialog dismiss — shared by InstallCta's tap-to-install
      // AND SaveGateModal's "install" button, since both call this same hook.
      trackEvent("install_dismissed");
    }
    // Single-use per Chrome spec — clear it either way (store AND the
    // pre-hydration stash, so a later mount can't re-adopt a consumed event).
    // Accepted path also fires `appinstalled` which is handled globally in
    // InstallEventsListener.
    setDeferredPrompt(null);
    clearStashedInstallPrompt();
    return choice.outcome;
  }, [deferredPrompt, setDeferredPrompt, setPwaInstallDismissed, trackEvent]);
}
