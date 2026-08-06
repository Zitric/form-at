import { useCallback } from "react";
import { useStore } from "~/store";
import { isStandalone } from "~/utils/installCapability";
import { VAPID_PUBLIC_KEY } from "~/utils/vapidPublicKey";

export type PushSubscribeOutcome = "subscribed" | "denied" | "unsupported" | "failed";

// Standard MDN conversion — `PushManager.subscribe()`'s `applicationServerKey`
// accepts a base64-ENCODED STRING OR an ArrayBuffer per spec, but browsers do
// NOT accept a raw base64url string directly in practice — it must be decoded
// into a Uint8Array first. This is the standard, widely-documented conversion
// function, not a local invention.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Capability check — deliberately feature-detection, not UA sniffing
// (matches this codebase's established preference, e.g. installCapability.ts's
// platform detection is UA-based only where the API genuinely can't be
// feature-detected). Push works in a regular browser tab on most platforms,
// but iOS Safari ONLY supports the Push API for INSTALLED (standalone)
// PWAs — a tab there has no `PushManager` at all. Checking for the API's
// actual presence handles that platform split for free, with no iOS
// version-sniffing needed.
export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// POSTs a subscription's wire shape to the server. Fire-and-forget,
// matching the analytics endpoints' own convention (`useTrackEvent`) — a
// failed POST means the subscription exists in the browser but not in our D1
// table. That orphaned state is reachable in the field, which is why this is
// exported: the CTA re-beacons an existing subscription on mount to heal a
// missing row. `/api/push-subscribe` is INSERT OR REPLACE on `endpoint`, so
// re-sends are idempotent.
export function postSubscription(subscription: PushSubscription): void {
  const json = subscription.toJSON();
  navigator.sendBeacon(
    "/api/push-subscribe",
    new Blob(
      [
        JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          is_standalone: isStandalone(),
        }),
      ],
      { type: "application/json" },
    ),
  );
}

// Orchestrates the opt-in flow: request permission → subscribe →
// POST to the server. Returns an outcome so the calling component can
// decide what (if anything) to show — this hook doesn't own any UI.
export function useSubscribeToPush(): () => Promise<PushSubscribeOutcome> {
  const setPushOptInDismissed = useStore((s) => s.setPushOptInDismissed);

  return useCallback(async () => {
    if (!isPushSupported()) return "unsupported";

    // Notification.requestPermission() MUST be called from a user-gesture
    // stack frame in most browsers (same mobile constraint this codebase
    // already works around for audio.play() in playerSlice.ts) — this
    // function is called directly from a button onClick, preserving that.
    // Skipped entirely when the grant already exists (the resume path:
    // granted in an earlier session, subscribe never completed) — a no-op
    // prompt call is still a prompt call, and the soft-prompt guarantee
    // ("the native dialog only ever fires from a modal accept") stays
    // literal rather than relying on the browser treating it as a no-op.
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      // Covers both an explicit "Block" AND a dismissed-without-choosing
      // prompt (Notification API resolves both cases outside "granted" —
      // see the uiSlice.ts comment on pushOptInDismissed for why this
      // single check is sufficient rather than trying to distinguish them).
      setPushOptInDismissed(true);
      return "denied";
    }

    // `pushManager.subscribe()` can reject with a DOMException (push service
    // unreachable, key mismatch, etc.) — without this catch the rejection
    // would float out of the button's onClick as an unhandled rejection with
    // zero user feedback. "failed" keeps the CTA visible and tappable
    // (unlike "denied") — the failure is transient, a retry is legitimate.
    let subscription: PushSubscription;
    try {
      const registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // required by Chrome/Edge — refuses the promise otherwise
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch {
      return "failed";
    }

    postSubscription(subscription);

    return "subscribed";
  }, [setPushOptInDismissed]);
}
