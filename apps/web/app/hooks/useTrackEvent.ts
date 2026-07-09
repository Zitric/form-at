import { useCallback } from "react";
import { isStandalone } from "~/utils/installCapability";
import type { TrackableEventType } from "~/utils/trackableEvents";

// Fires a first-party analytics event via `navigator.sendBeacon` — same
// fire-and-forget convention as `useAudioPlayer`'s play-tracking (`sendPlay`):
// survives page unload, never blocks the action it's attached to.
//
// Why a hook, not a wrapper component: the tracked actions (save-for-offline,
// share) live inside components that render EITHER the design-system
// <Button> or a raw <button> depending on surface (detail page vs list-card
// icon — chunk 4's two component paths), and the actual "this is a save"
// moment is often one branch of a multi-branch state machine (see
// `useOfflineDownload.ts` — only some `offlineState.status` branches are a
// real save attempt). A wrapper component would have to be either
// Button-specific (misses the icon-button surface) or generic enough that
// it stops being more than "call this function inline" — so this hook
// exposes exactly that, called directly at the handful of real call sites.
//
// `is_standalone` is read fresh at call time, not cached — same pattern as
// `withAppContext` re-reading `isStandalone()` per call, so a display-mode
// change between renders is always reflected correctly.
export function useTrackEvent(): (eventType: TrackableEventType, setId?: string) => void {
  return useCallback((eventType: TrackableEventType, setId?: string) => {
    navigator.sendBeacon(
      "/api/event",
      new Blob(
        [
          JSON.stringify({
            event_type: eventType,
            set_id: setId ?? null,
            is_standalone: isStandalone(),
          }),
        ],
        { type: "application/json" },
      ),
    );
  }, []);
}
