import { useEffect } from "react";
import { useStore, useStoreHydrated } from "~/store";

// Boot-time sync between IDB (truth) and persisted state (fast index).
// Runs once after persist hydration completes AND the catalogue is known-
// complete (see `catalogueReady` in catalogueSlice.ts) — earlier than
// hydration and we'd reconcile against an empty in-memory state; earlier
// than catalogueReady and reconcileFromIdb's catalogue-membership check
// could mistake "the live-D1 fetch hasn't resolved yet" for "this set was
// removed from the catalogue," permanently deleting a user's real saved
// download over nothing (admin set-upload feature, PR3 review). The guard
// against that actually lives inside reconcileFromIdb itself (it no-ops if
// called before catalogueReady) — this component's gate just avoids the
// wasted, guaranteed-to-no-op call.
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
