import { useEffect } from "react";
import { useStore, useStoreHydrated } from "~/store";

// Boot-time sync between IDB (truth) and persisted state (fast index).
// Runs once after persist hydration completes AND the boot-time catalogue
// fetch has SETTLED (see `catalogueReady` in catalogueSlice.ts, one way or
// another — success, failure, or timeout) — earlier than hydration and
// we'd reconcile against an empty in-memory state; earlier than
// catalogueReady and reconcileFromIdb would just no-op immediately (it
// checks the same flag itself). NOTE: `catalogueReady` only means "stopped
// waiting," not "confirmed complete" — reconcileFromIdb's actually-
// destructive catalogue-membership purge additionally requires
// `catalogueConfirmed` (true only on a successful fetch), checked entirely
// inside the slice, not here. See catalogueSlice.ts's comment on why a
// failed/offline boot must NOT be treated as license to purge.
//
// Cheap: single IDB readAll + at most one Zustand write + one IDB purge tx
// (only if catalogue-removed orphans exist). Typically <100ms once both
// gates are open.
export function OfflineReconciler() {
  const hydrated = useStoreHydrated();
  const catalogueReady = useStore((s) => s.catalogueReady);
  useEffect(() => {
    if (!hydrated || !catalogueReady) return;
    useStore.getState().reconcileFromIdb();
  }, [hydrated, catalogueReady]);
  return null;
}
