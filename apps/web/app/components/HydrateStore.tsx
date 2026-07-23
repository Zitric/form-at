import { useEffect } from "react";
import { useStore } from "~/store";

// Triggers persist rehydration after mount so SSR and the first client render
// match exactly (both unhydrated). Without this, the saved track flips in during
// React hydration and causes a visible re-render.
//
// Also stamps `body[data-hydrated="true"]` once the effect runs — Playwright tests
// wait for this marker before clicking interactive elements. Without it, headless
// browsers in CI fire clicks before React attaches event handlers and clicks
// silently no-op (false-positive race).
export function HydrateStore() {
  useEffect(() => {
    useStore.persist.rehydrate();
    document.body.dataset.hydrated = "true";
  }, []);
  return null;
}
