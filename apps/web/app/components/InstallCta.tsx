import { Button } from "~/components/Button";
import { useTriggerInstallPrompt } from "~/hooks/useSaveGate";
import { useStore, useStoreHydrated } from "~/store";

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

  return (
    <Button variant="secondary" onClick={() => triggerInstall()} className={className}>
      install_form:at
    </Button>
  );
}
