import type { PushPayload } from "@form-at/data/webPush";

// Shapes a received push payload into `showNotification()`'s options, and
// resolves a `notificationclick` tap into a navigation target (or none).
// Pure, SW-global-free (no `self`, no `clients`) — unlike the rest of
// `sw.ts`, which has no jsdom test harness (verified 2026-07-20, still true:
// it imports `workbox-precaching` and reads `self.__WB_MANIFEST`), this file
// is plain TypeScript and is unit-tested directly.

// TypeScript's bundled DOM/WebWorker lib.d.ts predates several shipped,
// spec'd `NotificationOptions` fields — `image`, `vibrate`, `actions`, and
// `timestamp` are all absent from BOTH lib.dom.d.ts and lib.webworker.d.ts
// (checked directly against the installed typescript package, 2026-07-21;
// MDN documents all four as real, shipped options). Extended locally rather
// than reaching for `any`, per CLAUDE.md's "unknown + narrowing, no any"
// rule — structural typing means this widened object still satisfies
// `showNotification`'s narrower `NotificationOptions` parameter with no cast.
export type PushNotificationOptions = NotificationOptions & {
  image?: string;
  vibrate?: number[];
  actions?: { action: string; title: string }[];
  timestamp?: number;
};

// Short buzz-pause-buzz (~250ms total) — a vibe check, not a wake-up call.
// Fixed rather than payload-configurable: one non-intrusive pattern for
// every push, not an option to design around per send.
const VIBRATE_PATTERN = [100, 50, 100];

// Fixed action pair, not payload/CLI-configurable — every push gets the
// same two, keeping the CLI free of an "actions" flag. Wording: "view" (not
// "listen now") because a push can be a set OR an event announcement, and
// "later" (not "dismiss") to match the app's existing soft-decline voice —
// see PushOptInModal's "not now" — rather than reading as a rejection of the
// channel itself. IDs routed in `resolveNotificationClickUrl` below.
const NOTIFICATION_ACTIONS: PushNotificationOptions["actions"] = [
  { action: "view", title: "view" },
  { action: "later", title: "later" },
];

// `payload` is untrusted, arbitrary JSON off the wire (verified against
// MDN: `event.data` is legitimately absent, and `.json()` throws on
// non-JSON bodies) — every field is read defensively with a fallback, no
// field is assumed present.
export function buildNotificationOptions(payload: Partial<PushPayload>): PushNotificationOptions {
  const options: PushNotificationOptions = {
    body: payload.body || "",
    icon: "/icon-192.png",
    // `badge` is a DIFFERENT asset from `icon`, not a smaller copy of it —
    // MDN (verified 2026-07-21): ~96x96, "the image will be automatically
    // masked." See PWA_PROGRESS's Phase 2 badge entry for the derivation.
    badge: "/badge-96.png",
    vibrate: VIBRATE_PATTERN,
    actions: NOTIFICATION_ACTIONS,
    data: { url: payload.url || "/" },
  };
  // Each conditionally added rather than always set to `undefined` —
  // `showNotification` treats an explicit `undefined` the same as absent
  // per spec, but omitting the key entirely keeps the resulting object
  // (and any future logging of it) honest about what THIS payload asked for.
  if (payload.image) options.image = payload.image;
  if (payload.requireInteraction) options.requireInteraction = true;
  if (payload.timestamp !== undefined) options.timestamp = payload.timestamp;
  return options;
}

// `action` is `event.action` from the `notificationclick` event — the
// empty string for a body tap (verified against MDN's `NotificationEvent`
// reference: "returns the string ID of the notification button the user
// clicked... empty string if the user clicked the notification somewhere
// other than an action button"), or one of `NOTIFICATION_ACTIONS`' ids for
// a button tap. Returns `null` to mean "close only, do not navigate" — the
// "later" action's whole point, since the OS closing the notification on
// any action tap already happens regardless of what this returns.
export function resolveNotificationClickUrl(
  action: string,
  dataUrl: string | undefined,
): string | null {
  if (action === "later") return null;
  return dataUrl || "/";
}
