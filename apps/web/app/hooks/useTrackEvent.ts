import { useCallback } from "react";
import { isStandalone } from "~/utils/installCapability";
import type { TrackableEventType } from "~/utils/trackableEvents";

// Fires a first-party analytics event via `navigator.sendBeacon` — same
// fire-and-forget convention as `useAudioPlayer`'s play-tracking (`sendPlay`):
// survives page unload, never blocks the action it's attached to.
//
// A hook rather than a wrapper component because the tracked actions render
// either the design-system <Button> or a raw <button> depending on surface, and
// the real "this is a save" moment is often one branch of a state machine (see
// `useOfflineDownload.ts`). A wrapper would be either Button-specific and miss
// the icon-button surface, or so generic it adds nothing over calling a
// function inline.
//
// `is_standalone` is read fresh at call time, never cached — same as
// `withAppContext` re-reading `isStandalone()` per call, so a display-mode
// change between renders is always reflected.
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
