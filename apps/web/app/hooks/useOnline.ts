import { useSyncExternalStore } from "react";

// navigator.onLine as React state, updated on the online/offline events.
// `false` is reliable (the device has no network); `true` only means some
// interface is up, not that formatglasgow.com is reachable, so callers still
// handle fetch failures. Server render assumes online.
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
