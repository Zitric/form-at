import { useEffect, useState } from "react";

// Mirrors the BottomNav's first-load fade-in duration. Anything that visually
// shifts when `nowPlaying` becomes truthy on a rehydrated load — the mobile
// mini-player slide-up, the swipe-navigator dot reposition — should hold
// until the navbar finishes coming in. Otherwise the motions stack into a
// single "everything shifts at once" jolt instead of feeling staged.
const NAV_FADE_MS = 800;

let navReady = false;
let started = false;
const listeners = new Set<(v: boolean) => void>();

function startTimer() {
  if (started) return;
  started = true;
  window.setTimeout(() => {
    navReady = true;
    for (const cb of listeners) cb(true);
  }, NAV_FADE_MS);
}

export function useNavReady(): boolean {
  const [ready, setReady] = useState(navReady);
  useEffect(() => {
    startTimer();
    if (navReady) {
      setReady(true);
      return;
    }
    listeners.add(setReady);
    return () => {
      listeners.delete(setReady);
    };
  }, []);
  return ready;
}
