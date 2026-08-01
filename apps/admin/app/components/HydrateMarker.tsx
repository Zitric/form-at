import { useEffect } from "react";

// Stamps `body[data-hydrated="true"]` once mounted — mirrors apps/web's
// HydrateStore.tsx (same problem, no store to rehydrate here though).
// Headless browsers in e2e can fire clicks before React attaches event
// handlers to interactive elements (tabs, the set picker); those clicks
// silently no-op. Playwright waits for this marker first — see
// tests/e2e/_helpers.ts's gotoAndHydrate.
export function HydrateMarker() {
  useEffect(() => {
    document.body.dataset.hydrated = "true";
  }, []);
  return null;
}
