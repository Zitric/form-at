import { useEffect, useState } from "react";
import { Button } from "~/components/Button";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import { useTriggerInstallPrompt } from "~/hooks/useSaveGate";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore, useStoreHydrated } from "~/store";
import { cn } from "~/utils/cn";

// "Install Form:at" CTA on the home route.
//
// Reads the captured `beforeinstallprompt` event + dismiss flag from the store
// (populated by <InstallEventsListener> in __root). The prompt-and-cleanup
// flow lives in `useTriggerInstallPrompt`, shared with <SaveGateModal> so
// both surfaces have identical accept/dismiss handling.
//
// Platform reality (unchanged from Phase 1):
//   - Chromium (Android/desktop Chrome, Edge, Samsung, Opera, Brave):
//     `beforeinstallprompt` fires → captured → button appears → tap → native dialog.
//   - iOS Safari: no `beforeinstallprompt` event exists. CTA stays hidden;
//     iOS install lives in <SaveGateModal> (reachable via the save button) as manual instructions.
//   - Firefox / iOS non-Safari browsers: no event API → CTA stays hidden.
//
// DISMISS SEMANTIC — different from <SaveForOfflineButton>:
// This is a PASSIVE CTA. When the user dismisses the install dialog, we hide
// the button entirely (`pwaInstallDismissed` gates the render). The user said
// "not now"; respecting that means removing the nudge, not leaving a tappable
// reminder of it. <SaveForOfflineButton> uses the opposite semantic — that
// button stays visible and tappable after dismiss because it's a user-
// initiated action, not a passive prompt. See uiSlice.ts for the full note.
export function InstallCta({ className }: { className?: string }) {
  const hydrated = useStoreHydrated();
  const deferredPrompt = useStore((s) => s.deferredPrompt);
  const pwaInstallDismissed = useStore((s) => s.pwaInstallDismissed);
  const triggerInstall = useTriggerInstallPrompt();

  // Hidden until: (a) store has rehydrated so we know the dismiss flag,
  // (b) Chrome has fired beforeinstallprompt (so we have something to .prompt()),
  // (c) user hasn't dismissed. The `hydrated` gate prevents a one-frame flash
  // for previously-dismissed users on the rare case where Chrome fires the
  // prompt before HydrateStore's rehydrate completes.
  if (!hydrated || !deferredPrompt || pwaInstallDismissed) return null;

  return <InstallCtaButton className={className} onInstall={() => triggerInstall()} />;
}

// Split so the entrance hooks run from the button's ACTUAL mount (the gate
// above renders null until the prompt arrives — hooks in the same component
// would start the fade while the button is still null-rendered). Same
// opacity-transition entrance as the rest of the home page (see
// routes/index.tsx): 5s on the session's true first paint, 0.6s otherwise.
// Thanks to the pre-hydration prompt stash the CTA usually mounts with the
// first render, so it joins the page's slow staged entrance; a genuinely
// late-arriving prompt gets the short fade — a lone button crawling in over
// 5s long after the page settled would read as broken, and 0.6s is the same
// duration every other element uses on non-first mounts.
function InstallCtaButton({
  className,
  onInstall,
}: {
  className?: string;
  onInstall: () => void;
}) {
  const isFirstLoad = useFirstLoad();
  const [visible, setVisible] = useState(false);
  const trackEvent = useTrackEvent();
  useEffect(() => {
    setVisible(true);
    // This component ONLY mounts once InstallCta's gate (hydrated + a
    // captured prompt + not dismissed) passes — i.e. exactly when the CTA
    // becomes visible to the user, not when Chromium's beforeinstallprompt
    // event fires (those can differ by seconds on a slow first visit, per
    // the pre-hydration stash in installPromptStash.ts).
    trackEvent("install_prompt_shown");
  }, [trackEvent]);
  const fadeDuration = isFirstLoad ? "5s" : "0.6s";

  // Fading wrapper div rather than a `style` prop on <Button> — Button
  // deliberately has no style passthrough, and the home page fades its other
  // buttons through styled containers the same way (routes/index.tsx socials
  // block).
  return (
    <div style={{ opacity: visible ? 1 : 0, transition: `opacity ${fadeDuration} ease-out` }}>
      <Button variant="secondary" onClick={onInstall} className={cn(className)}>
        install_form:at
      </Button>
    </div>
  );
}
