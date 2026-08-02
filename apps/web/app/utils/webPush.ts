// Transitional re-export — the real module moved to
// packages/data/src/webPush.ts in Phase D1 (2026-08-01) so apps/admin's
// send-push endpoint could import it too (apps never import each other's
// code directly in this monorepo). Kept as a shim rather than sweeping
// every import site (sw.ts, pushNotification.ts, scripts/send-push.ts) to
// the new path directly — same transitional-shim convention as
// ~/data/sets.ts / ~/utils/audioHost.ts. See TECH_DEBT.md item 21 for the
// deferred follow-up sweep.
export {
  sendWebPush,
  type PushPayload,
  type PushSubscriptionRecord,
  type SendPushResult,
} from "@form-at/data/webPush";
