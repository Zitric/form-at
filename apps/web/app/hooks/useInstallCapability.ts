import { useCallback } from "react";
import { useStore, useStoreHydrated } from "~/store";
import { detectPlatform, isStandalone } from "~/utils/installCapability";

export type InstallCapability =
  | "native"
  | "chromium-manual"
  | "ios-safari"
  | "installed"
  | "unsupported";

// Composite of pure platform detection (utils/installCapability) and reactive
// store state (deferredPrompt + pwaInstalled). Lives here, not in the util,
// because the util is a pure leaf for testing and the composition needs React.
export function useInstallCapability(): InstallCapability {
  const hydrated = useStoreHydrated();
  const pwaInstalled = useStore((s) => s.pwaInstalled);
  const deferredPrompt = useStore((s) => s.deferredPrompt);

  // Before hydration we don't know pwaInstalled — be conservative and treat
  // as unsupported so consumer buttons stay hidden rather than flash.
  if (!hydrated) return "unsupported";

  // Already-installed takes priority. Even on Chromium with a stale deferred
  // prompt floating around, if isStandalone() or pwaInstalled, we want the
  // "coming soon" path, not a re-install offer.
  if (isStandalone() || pwaInstalled) return "installed";

  const platform = detectPlatform();
  // Chromium splits two ways: with a captured deferredPrompt we can fire the
  // one-tap native dialog; without it (engagement heuristic not yet met on
  // this device), we still want the user reachable — the install path is
  // available via the browser's menu / address-bar icon at all times once
  // PWA installability criteria are met (manifest + SW + HTTPS). Sending
  // them to "unsupported" here would hide the offline feature behind
  // Chrome's loyalty heuristic — not a product decision we want to delegate.
  if (platform === "chromium") {
    return deferredPrompt ? "native" : "chromium-manual";
  }
  if (platform === "ios-safari") return "ios-safari";

  // Falls through: Firefox, iOS Chrome/Firefox/Edge, macOS Safari, empty UA.
  // These genuinely cannot install — SaveForOfflineButton hides itself.
  return "unsupported";
}

export type TriggerInstallOutcome = "accepted" | "dismissed" | "no-prompt";

// Fires the native install prompt + handles user choice + cleans up the
// deferred event. Extracted so InstallCta (home) and InstallPromptModal
// (set page) have identical accept/dismiss handling — single source of truth
// for "what happens when the user agrees or declines Chrome's install dialog".
export function useTriggerInstallPrompt(): () => Promise<TriggerInstallOutcome> {
  const deferredPrompt = useStore((s) => s.deferredPrompt);
  const setDeferredPrompt = useStore((s) => s.setDeferredPrompt);
  const setPwaInstallDismissed = useStore((s) => s.setPwaInstallDismissed);

  return useCallback(async () => {
    if (!deferredPrompt) return "no-prompt";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "dismissed") {
      setPwaInstallDismissed(true);
    }
    // Single-use per Chrome spec — clear it either way. Accepted path also
    // fires `appinstalled` which is handled globally in InstallEventsListener.
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt, setDeferredPrompt, setPwaInstallDismissed]);
}
