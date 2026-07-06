import { useEffect, useRef, useState } from "react";
import { releaseAudioStream } from "~/store/playerSlice";

// Detects a new service-worker build waiting to activate and exposes the
// user-consented swap (H2: no unconditional skipWaiting in the SW — see the
// message listener in sw.ts).
//
// Detection covers both orders of arrival:
//   1. `registration.waiting` already set when this hook mounts (the page
//      stayed open across a deploy and the browser's background update
//      check finished before mount).
//   2. `updatefound` → installing worker reaches "installed" while the page
//      is open.
//
// `navigator.serviceWorker.ready` (not `getRegistration()`): registration
// happens in an inline script on window `load`, which can be AFTER this
// hook mounts — `getRegistration()` would resolve undefined and the
// updatefound listener would never attach. `ready` waits for an active
// registration; where the SW never registers (dev server, unsupported
// browser) it simply never resolves and the hook stays idle.

// controllerchange normally lands well under a second after SKIP_WAITING;
// 2s is comfortably past that without making a genuinely-needed fallback
// reload feel unresponsive.
const RELOAD_FALLBACK_MS = 2000;

// Pure decision — exported for unit tests. A worker reaching "installed"
// only means "update ready" when the page already has a controller: on the
// very first install there is no controller, the worker isn't an update,
// and clientsClaim() takes over silently without a reload.
export function isUpdateReady(state: ServiceWorkerState, hasController: boolean): boolean {
  return state === "installed" && hasController;
}

export function useSwUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let disposed = false;
    const cleanups: (() => void)[] = [];

    // Reload ONLY when this tab explicitly requested the swap. `clientsClaim`
    // also fires controllerchange on first install — reloading then would
    // interrupt a first-visit user for no reason (and is the classic
    // reload-loop footgun). Other open tabs don't reload either: their user
    // didn't consent; they accept the same stale-chunk risk they had before
    // this flow existed, now bounded by an explicit action elsewhere.
    const onControllerChange = () => {
      if (requestedRef.current) window.location.reload();
    };
    sw.addEventListener("controllerchange", onControllerChange);
    cleanups.push(() => sw.removeEventListener("controllerchange", onControllerChange));

    sw.ready.then((reg) => {
      if (disposed) return;

      if (reg.waiting && sw.controller) setWaiting(reg.waiting);

      const onUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        const onStateChange = () => {
          if (isUpdateReady(installing.state, sw.controller !== null)) setWaiting(installing);
        };
        installing.addEventListener("statechange", onStateChange);
        cleanups.push(() => installing.removeEventListener("statechange", onStateChange));
      };
      reg.addEventListener("updatefound", onUpdateFound);
      cleanups.push(() => reg.removeEventListener("updatefound", onUpdateFound));
    });

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  const applyUpdate = () => {
    if (!waiting) return;
    requestedRef.current = true;
    // Playing audio streams through the OLD worker's fetch handler and
    // blocks the waiting worker's activation for the rest of the track —
    // the 2026-07-03 "tap does nothing" field bug. We're reloading anyway,
    // so tear the stream down first; activation then proceeds immediately.
    releaseAudioStream();
    // Re-resolve the waiting worker AT TAP TIME instead of posting to the
    // captured state object: with multiple deploys while a tab stays open
    // (mobile tabs live for hours), the captured worker can have gone
    // REDUNDANT — replaced by a newer waiting worker — and postMessage to a
    // redundant worker is silently dropped: the tap does nothing (2026-07-03
    // field bug's only silent-drop path; the tap→click→handler chain itself
    // is CDP-verified working on mobile emulation).
    navigator.serviceWorker.getRegistration().then((reg) => {
      (reg?.waiting ?? waiting).postMessage({ type: "SKIP_WAITING" });
    });
    // Convergence guarantee: a consent tap must ALWAYS visibly do something.
    // If controllerchange hasn't reloaded us shortly (worker was redundant
    // with nothing to activate, message lost, activation wedged), reload
    // anyway — a plain reload re-registers and picks up the newest build.
    // No double-reload risk: whichever fires first navigates away and the
    // page (with this timer) is gone.
    window.setTimeout(() => {
      if (requestedRef.current) window.location.reload();
    }, RELOAD_FALLBACK_MS);
  };

  return { updateReady: waiting !== null, applyUpdate };
}
