import { useEffect } from "react";
import { fetchAllSets } from "~/data/sets";
import { useStore, useStoreHydrated } from "~/store";

// Boot-time refresh of the live-D1 half of the catalogue (admin set-upload
// feature, PR3). Runs once after persist hydration, same trigger
// OfflineReconciler uses and for the same reason — earlier than that and
// we'd be racing our own rehydration of the persisted `catalogueSets`.
//
// Deliberately calls the raw `fetchAllSets` (not `fetchAllSetsForRoute`,
// which swallows its own failure and falls back to the bare snapshot): this
// component needs to tell success apart from failure itself, so it can
// leave `catalogueSets` untouched on failure rather than overwriting
// possibly-better persisted data with a bare-snapshot fallback. Concretely:
// if a previous session's fetch succeeded and got persisted, and THIS
// session is offline, blindly writing `fetchAllSetsForRoute`'s fallback
// would regress `catalogueSets` back to the bare snapshot, discarding
// perfectly good, already-known data for no reason.
//
// Race against a timeout so a hung connection can't block `catalogueReady`
// (and therefore `reconcileFromIdb`) indefinitely — 8s is generous for a D1
// round trip and short enough to bound the worst case.
const FETCH_TIMEOUT_MS = 8000;

export function CatalogueSync() {
  const hydrated = useStoreHydrated();

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("catalogue fetch timed out")), FETCH_TIMEOUT_MS);
    });

    Promise.race([fetchAllSets(), timeout])
      .then((live) => {
        if (!cancelled) useStore.getState().setCatalogueSets(live);
      })
      .catch(() => {
        // Network failure or timeout — leave catalogueSets exactly as it
        // was (persisted-from-before, or the bare snapshot default). See
        // the top-of-file comment for why this must not overwrite with a
        // worse fallback.
      })
      .finally(() => {
        if (!cancelled) useStore.getState().markCatalogueReady();
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  return null;
}
