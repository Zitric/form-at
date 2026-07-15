import { createFileRoute } from "@tanstack/react-router";

// Convention choice: mirrors `api/event.ts` (exported `validate` for unit
// tests, try/catch-swallow, always-204 response) rather than the older
// `api/signal.ts` pattern — `push_subscriptions` is a Phase-2 sibling of
// the deliberately-designed `events` table, not a play-tracking beacon, so
// it follows the newer/better-practice convention rather than the one that
// predates "export pure logic for tests."
//
// Wire shape: `endpoint` / `keys.p256dh` / `keys.auth` are NOT our casing
// choice — that's exactly what the browser's `PushSubscription.toJSON()`
// produces (a Web-standard shape, see MDN). `is_standalone` is the one
// field this app adds, snake_case to match `api/event.ts`'s established
// convention for fields we do control.
type SubscribeBody = {
  endpoint: string;
  p256dh: string;
  auth: string;
  isStandalone: boolean;
};

const MAX_ENDPOINT_LEN = 2048; // generous — real push-service endpoints run ~100-200 chars
const MAX_KEY_LEN = 256; // p256dh/auth are short base64url strings, this is a sanity cap not a spec limit

// Exported for unit tests — same convention as `api/event.ts`'s `validate`.
export function validate(raw: unknown): SubscribeBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (
    typeof r.endpoint !== "string" ||
    r.endpoint.length === 0 ||
    r.endpoint.length > MAX_ENDPOINT_LEN
  ) {
    return null;
  }
  // Push service endpoints are always HTTPS — reject anything else outright
  // rather than storing (and later POSTing to) an unexpected scheme.
  if (!r.endpoint.startsWith("https://")) return null;

  const keys = r.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys !== "object") return null;
  if (
    typeof keys.p256dh !== "string" ||
    keys.p256dh.length === 0 ||
    keys.p256dh.length > MAX_KEY_LEN
  ) {
    return null;
  }
  if (typeof keys.auth !== "string" || keys.auth.length === 0 || keys.auth.length > MAX_KEY_LEN) {
    return null;
  }

  if (typeof r.is_standalone !== "boolean") return null;

  return {
    endpoint: r.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    isStandalone: r.is_standalone,
  };
}

export const Route = createFileRoute("/api/push-subscribe")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const body = validate(await request.json());
          // Always 204 — same "don't leak what we accepted/rejected"
          // rationale as api/event.ts and api/signal.ts.
          if (!body) return new Response(null, { status: 204 });

          const cf = (context as unknown as Record<string, unknown>).cloudflare as
            | { env: { DB: D1Database } }
            | undefined;
          const db = cf?.env?.DB;

          if (db) {
            // OR REPLACE: `endpoint` is the primary key, and a re-subscribe
            // (permission re-granted, browser refreshed the subscription,
            // or the client simply calls subscribe() again) should overwrite
            // cleanly rather than erroring on the duplicate-PK insert.
            await db
              .prepare(
                "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, is_standalone, created_at) VALUES (?, ?, ?, ?, ?)",
              )
              .bind(body.endpoint, body.p256dh, body.auth, body.isStandalone ? 1 : 0, Date.now())
              .run();
          }
        } catch {
          // Same rule as the other two endpoints: this must never break the app.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
