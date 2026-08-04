import { useEffect } from "react";
import { fetchAllSetsLive } from "~/data/sets";
import { useStore, useStoreHydrated } from "~/store";

// Boot-time refresh of the live-D1 half of the catalogue (admin set-upload
// feature, PR3). Runs once after persist hydration, same trigger
// OfflineReconciler uses and for the same reason — earlier than that and
// we'd be racing our own rehydration of the persisted `catalogueSets`.
//
// Deliberately calls `fetchAllSetsLive`, NOT `fetchAllSets` (nor
// `fetchAllSetsForRoute`) — both of those swallow a missing D1 binding or a
// D1 query failure into a *resolved* bare-snapshot value, which is
// indistinguishable from a genuine live result to a plain `.then()`. This
// component specifically needs that distinction: `catalogueConfirmed` (see
// catalogueSlice.ts) must only go true when a live D1 read actually
// succeeded, never when ANY fallback was substituted — including
// server-side ones (no binding, or a D1 outage) that never reach the client
// as a network failure. `fetchAllSetsLive` rejects in exactly those cases
// instead of swallowing them, so `.then()` vs `.catch()` below is a
// trustworthy success/failure signal. This was a real bug found in review:
// an earlier version called the swallowing `fetchAllSets` here, so a
// server-side D1 outage (or plain local `pnpm dev`, which has no D1 binding
// at all) would resolve with the bare snapshot, mark the catalogue
// confirmed, and arm reconcileFromIdb's destructive purge against a
// snapshot-only catalogue.
//
// This does mean `catalogueSets` itself is only ever updated on a genuine
// live success now (never written from this component on failure/timeout,
// same as before) — that's still correct: `catalogueSets` was already left
// untouched on failure/timeout, so no new fallback-writing path was removed
// by this change, only the swallowing read that fed markCatalogueConfirmed.
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
