import { useEffect } from "react";
import { useStore, useStoreHydrated } from "~/store";

// Boot-time sync between IDB (truth) and persisted state (fast index). Runs
// once after persist hydration AND after the boot catalogue fetch has SETTLED
// (`catalogueReady`): earlier than hydration would reconcile against empty
// in-memory state, and earlier than `catalogueReady` would just no-op.
//
// This gate is NOT what makes the purge safe — `catalogueReady` only means
// "stopped waiting." reconcileFromIdb's destructive catalogue-membership purge
// additionally requires `catalogueConfirmed`, checked inside the slice.
//
// Cheap: one IDB readAll, at most one Zustand write and one purge tx.
export function OfflineReconciler() {
  const hydrated = useStoreHydrated();
  const catalogueReady = useStore((s) => s.catalogueReady);
  useEffect(() => {
    if (!hydrated || !catalogueReady) return;
    useStore.getState().reconcileFromIdb();
  }, [hydrated, catalogueReady]);
  return null;
}
