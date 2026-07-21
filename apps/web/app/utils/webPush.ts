// Reusable Web Push sending module (Phase 2, 2026-07-15). THE single place
// that knows how to sign + send a push notification — used today by
// `scripts/send-push.ts` (a local Node script), and intended for the future
// admin panel to import directly rather than reimplementing this logic.
// Nothing in this file is Node-specific: it's built entirely on
// `globalThis.crypto.subtle` and `fetch`, both available in Node 20+,
// browsers, and the Cloudflare Workers runtime — verified directly against
// `@pushforge/builder`'s compiled source (`dist/lib/crypto.js` binds to
// `globalThis.crypto`, no `node:crypto` import anywhere in the package).
// See PWA_PROGRESS.md's Phase 2 section for the full research trail on why
// this library instead of the far more common `web-push` npm package (short
// version: `web-push` depends on Node's `crypto`/`https` modules and does
// not work in the Workers runtime — see web-push-libs/web-push#718, open
// since 2022, unresolved).
import { buildPushHTTPRequest } from "@pushforge/builder";

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// JSON-serializable notification content. `url` is optional — the
// `notificationclick` handler in sw.ts falls back to `/` when absent, so a
// generic announcement doesn't need one, but a "new set" or "new event"
// push should always include the deep-link path.
//
// `image`, `requireInteraction`, and `timestamp` are the per-send options
// (2026-07-21) — see `~/utils/pushNotification.ts` for how they (plus the
// fixed vibrate pattern + action buttons, which are NOT per-send) become
// `NotificationOptions`. `image` is just a URL, same shape/resolution rules
// as `url` — verified against MDN, no absolute-URL requirement (relative
// site paths resolve against the SW's own origin, same as `icon`/`badge`
// already do).
export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  image?: string;
  requireInteraction?: boolean;
  timestamp?: number;
};

export type VapidCredentials = {
  privateJWK: string | JsonWebKey;
  contact: string;
};

export type SendPushResult =
  | { outcome: "sent" }
  // Per the Web Push spec, a 404 or 410 from the push service means the
  // subscription is PERMANENTLY invalid (browser uninstalled, user revoked
  // notification permission at the OS level, endpoint expired) — the
  // sender must stop sending to it. Callers are expected to delete the row.
  | { outcome: "dead"; status: number }
  | { outcome: "failed"; status: number; statusText: string };

// Exported separately (not inlined into sendWebPush) so the dead-subscription
// rule itself is unit-testable without a real network call.
export function isDeadSubscriptionStatus(status: number): boolean {
  return status === 404 || status === 410;
}

// Sends one push notification to one subscription. Push services return
// 201 Created on success (some accept 200 too — Mozilla's autopush and
// Google's FCM both use 201; treating both as success is defensive, not
// speculative — this is the documented push-service contract, not this
// app inventing behavior).
export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
  vapid: VapidCredentials,
): Promise<SendPushResult> {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: vapid.privateJWK,
    subscription,
    message: {
      payload,
      adminContact: vapid.contact,
      // 24h is @pushforge/builder's own hard cap — it derives the VAPID
      // JWT `exp` claim FROM this ttl value (exp = now + ttl, request.js)
      // and throws above 24h because push services reject a JWT expiring
      // further out with 403. NOTE this coupling is a quirk of THIS
      // library: in the Web Push spec the TTL header (message retention,
      // can be weeks) and the JWT exp (auth token lifetime, ≤24h) are
      // independent — don't carry this comment's constraint to a
      // different library. Using the max: an announcement is still worth
      // delivering to a phone that comes back online hours later.
      options: { ttl: 24 * 60 * 60, urgency: "normal" },
    },
  });

  const response = await fetch(endpoint, { method: "POST", headers, body });

  if (response.status === 200 || response.status === 201) return { outcome: "sent" };
  if (isDeadSubscriptionStatus(response.status)) {
    return { outcome: "dead", status: response.status };
  }
  return { outcome: "failed", status: response.status, statusText: response.statusText };
}
