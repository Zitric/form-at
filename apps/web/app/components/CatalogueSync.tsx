import { useEffect } from "react";
import { fetchAllSetsLive } from "~/data/sets";
import { useStore, useStoreHydrated } from "~/store";

// Boot-time refresh of the live-D1 half of the catalogue. Runs once after
// persist hydration — earlier races our own rehydration of `catalogueSets`.
//
// Must call `fetchAllSetsLive`, never `fetchAllSets`/`fetchAllSetsForRoute`:
// those swallow a missing D1 binding or a failed query into a *resolved*
// bare-snapshot value, so `.then()` can't tell a genuine live read from a
// substituted fallback — and marking `catalogueConfirmed` on a fallback arms
// reconcileFromIdb's destructive purge against an incomplete catalogue.
// See PWA_PROGRESS.md's PR3 entry.
//
// The 8s timeout stops a hung connection blocking `catalogueReady` — and
// therefore `reconcileFromIdb` — indefinitely.
const FETCH_TIMEOUT_MS = 8000;

export function CatalogueSync() {
  const hydrated = useStoreHydrated();

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("catalogue fetch timed out")), FETCH_TIMEOUT_MS);
    });

    Promise.race([fetchAllSetsLive(), timeout])
      .then((live) => {
        if (cancelled) return;
        useStore.getState().setCatalogueSets(live);
        // Only the success path confirms the catalogue is complete — see
        // catalogueSlice.ts's comment on `catalogueConfirmed` vs
        // `catalogueReady`. A failure/timeout below deliberately does NOT
        // call this, even though it still calls markCatalogueReady() in the
        // `finally`.
        useStore.getState().markCatalogueConfirmed();
      })
      .catch(() => {
        // Network failure, no D1 binding, a D1 query error, or a timeout —
        // `fetchAllSetsLive` rejects on all of them (see its own comment).
        // Leave catalogueSets exactly as it was (persisted-from-before, or
        // the bare snapshot default). See the top-of-file comment for why
        // this must not overwrite with a worse fallback. Deliberately does
        // NOT mark catalogueConfirmed.
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
