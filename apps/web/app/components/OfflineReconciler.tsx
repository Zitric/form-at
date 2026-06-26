import { useEffect } from "react";
import { useStore, useStoreHydrated } from "~/store";

// Boot-time sync between IDB (truth) and persisted state (fast index).
// Runs once after persist hydration completes — earlier than that and we'd
// reconcile against an empty in-memory state, then immediately overwrite our
// own corrections when persist hydrates with the localStorage payload.
//
// Cheap: single IDB readAll + at most one Zustand write + one IDB purge tx
// (only if catalogue-removed orphans exist). Typically <100ms.
export function OfflineReconciler() {
  const hydrated = useStoreHydrated();
  useEffect(() => {
    if (!hydrated) return;
    useStore.getState().reconcileFromIdb();
  }, [hydrated]);
  return null;
}
