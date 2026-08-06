import { useEffect } from "react";
import { dequeueSignal, getQueuedSignals } from "~/data/beacon-queue";

// Fallback replay path for browsers with no Background Sync support at all
// (Safari — desktop and iOS — and Firefox; Background Sync is Chromium-only).
// `sw.ts`'s
// `sync` handler is the primary replay mechanism where supported, working
// even after the page closes; this component is the pragmatic degradation
// everywhere else — it can only replay while a tab is actually open, but
// that's the best available without Background Sync.
//
// Replays on mount (covers reopening the app after being offline — the
// common case for someone who listened on the metro, then relaunches once
// back on Wi-Fi) and again on the `online` event (covers connectivity
// returning while the app stays open). No UI either way — invisible
// infrastructure, matching TECH_DEBT 4's own scope note.
async function flushQueue(): Promise<void> {
  const queued = await getQueuedSignals();
  for (const { id, payload } of queued) {
    const sent = navigator.sendBeacon(
      "/api/signal",
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
    );
    // Only dequeue on success — a rejected beacon (e.g. connectivity dropped
    // again mid-flush) stays queued for the next mount or `online` event.
    if (sent) await dequeueSignal(id);
  }
}

export function BeaconQueueFlusher() {
  useEffect(() => {
    if (navigator.onLine) void flushQueue();
    const handleOnline = () => void flushQueue();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);
  return null;
}
