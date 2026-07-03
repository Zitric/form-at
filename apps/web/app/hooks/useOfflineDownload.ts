import { useStore } from "~/store";
import type { OfflineSetState } from "~/store/offlineSlice";

// Frozen sentinel for sets with no entry in `offlineSets` yet. MUST be
// module-level: a fresh object literal inside a Zustand selector would fail
// `Object.is` equality and trigger an infinite render loop. Frozen so
// callers can't accidentally mutate the shared reference.
export const NOT_SAVED: OfflineSetState = Object.freeze({ status: "not-saved" });

// Single Zustand selector pattern shared by every component that reads
// per-set offline status — keeps the `?? NOT_SAVED` fallback in one place
// and protects the selector's reference equality.
export function useOfflineStateFor(setId: string): OfflineSetState {
  return useStore((s) => s.offlineSets[setId] ?? NOT_SAVED);
}

// Wraps `startDownload(setId)` so callers don't have to repeat the three
// synchronous-throw sentinel translations. `startDownload` throws these
// BEFORE entering its own try/catch:
//   ONE_DOWNLOAD_AT_A_TIME — another download is in flight
//   SIZE_NOT_CONFIGURED    — set.sizeBytes hint missing in sets.ts
//   UNKNOWN_SET            — getSet(setId) returned undefined
// Network / fetch failures during the download itself land in the slice's
// own try/catch and surface via the per-set `failed` state — callers render
// those via the state machine, not via this wrapper.
//
// Shared between SaveForOfflineButton (detail page) and
// SaveForOfflineIconButton (card list). A bug here hits both at once,
// which is the point — single source of truth for "trigger download with
// sentinel-error toast handling".
export function useTriggerDownload(setId: string): () => void {
  const startDownload = useStore((s) => s.startDownload);
  const setToast = useStore((s) => s.setToast);

  return () => {
    startDownload(setId).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "ONE_DOWNLOAD_AT_A_TIME") {
        setToast("one download at a time — finish current first");
        return;
      }
      if (msg.startsWith("SIZE_NOT_CONFIGURED")) {
        setToast("size not configured for this set — flag it to the team");
        return;
      }
      // UNKNOWN_SET and other unexpected throws shouldn't happen with a
      // valid setId (the caller renders from the catalogue) — no user-facing
      // toast, but surface it in dev so a data-wiring mistake isn't
      // completely invisible.
      if (process.env.NODE_ENV === "development") {
        console.warn(`[offline] startDownload(${setId}) threw unexpectedly:`, e);
      }
    });
  };
}
