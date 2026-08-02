import { type SendPushResult, sendWebPush } from "@form-at/data/webPush";
import { createFileRoute } from "@tanstack/react-router";
import { recordPushSend } from "~/data/push-sends";
import { extractAccessToken, verifyAccessJwt } from "~/utils/verifyAccessJwt";

// The first mutating admin endpoint. PWA_PROGRESS.md's admin-migration note
// (and routes/dashboard.tsx's top-of-file comment) both call this out by
// name: Cloudflare Access gates page loads, not individual server-function
// calls, so this endpoint verifies the Access identity itself rather than
// assuming the page being gated is enough. Fails closed, unconditionally —
// no environment-based bypass for local dev (see verifyAccessJwt.ts's
// comment and PWA_PROGRESS.md's Phase D1 entry for why this endpoint
// deliberately does NOT get the same kind of dev-mode escape hatch the
// sample-data dashboard fallback has).

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 1000;
const MAX_URL_LEN = 2048;

type SendPushBody = {
  title: string;
  body: string;
  url?: string;
  image?: string;
};

function isSiteRelativeOrHttpsPath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("https://");
}

// Exported for unit tests — same convention as api/push-subscribe.ts's
// validate(). Less paranoid than that endpoint's validation (this is
// reached only by Access-authenticated admins filling out a form, not
// arbitrary public input), but still a sanity check against a malformed
// request, not a substitute for the Access check above it.
export function validate(raw: unknown): SendPushBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.title !== "string" || r.title.length === 0 || r.title.length > MAX_TITLE_LEN) {
    return null;
  }
  if (typeof r.body !== "string" || r.body.length === 0 || r.body.length > MAX_BODY_LEN) {
    return null;
  }

  if (r.url !== undefined) {
    if (
      typeof r.url !== "string" ||
      r.url.length === 0 ||
      r.url.length > MAX_URL_LEN ||
      !isSiteRelativeOrHttpsPath(r.url)
    ) {
      return null;
    }
  }
  if (r.image !== undefined) {
    if (
      typeof r.image !== "string" ||
      r.image.length === 0 ||
      r.image.length > MAX_URL_LEN ||
      !isSiteRelativeOrHttpsPath(r.image)
    ) {
      return null;
    }
  }

  return {
    title: r.title,
    body: r.body,
    url: r.url as string | undefined,
    image: r.image as string | undefined,
  };
}

type SendPushResponseBody = {
  total: number;
  sent: number;
  failed: number;
  deadRemoved: number;
};

export const Route = createFileRoute("/api/send-push")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const cf = (context as unknown as Record<string, unknown>).cloudflare as
          | {
              env: {
                DB: D1Database;
                VAPID_PRIVATE_KEY_JWK?: string;
                VAPID_CONTACT_EMAIL?: string;
                CF_ACCESS_TEAM_DOMAIN?: string;
                CF_ACCESS_AUD?: string;
              };
            }
          | undefined;
        const env = cf?.env;

        // Verify the Access identity FIRST — before touching D1 or sending
        // anything. Fails closed on every path: missing config, missing
        // token, bad signature, wrong issuer/audience, expired.
        const teamDomain = env?.CF_ACCESS_TEAM_DOMAIN;
        const aud = env?.CF_ACCESS_AUD;
        if (!teamDomain || !aud) {
          return new Response(null, { status: 401 });
        }
        const token = extractAccessToken(request);
        if (!token) return new Response(null, { status: 401 });
        const identity = await verifyAccessJwt(token, { teamDomain, aud });
        if (!identity) return new Response(null, { status: 401 });

        let body: SendPushBody | null;
        try {
          body = validate(await request.json());
        } catch {
          body = null;
        }
        if (!body) return new Response(null, { status: 400 });

        const db = env?.DB;
        const vapidPrivateKey = env?.VAPID_PRIVATE_KEY_JWK;
        const vapidContact = env?.VAPID_CONTACT_EMAIL;
        if (!db || !vapidPrivateKey || !vapidContact) {
          return new Response(null, { status: 503 });
        }

        const subscriptions = await db
          .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions")
          .all<{ endpoint: string; p256dh: string; auth: string }>();

        let sent = 0;
        let failed = 0;
        let deadRemoved = 0;

        // Sequential, not concurrent — matches scripts/send-push.ts's own
        // sequencing (push services don't benefit from concurrency here,
        // and sequential keeps per-subscription error isolation simple).
        // See PWA_PROGRESS.md's Phase D1 entry for the documented scale
        // limit this loop runs into eventually (not a problem yet at
        // today's subscriber count).
        for (const row of subscriptions.results) {
          let result: SendPushResult;
          try {
            result = await sendWebPush(
              { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
              { title: body.title, body: body.body, url: body.url, image: body.image },
              { privateJWK: vapidPrivateKey, contact: vapidContact },
            );
          } catch {
            failed++;
            continue;
          }

          if (result.outcome === "sent") {
            sent++;
          } else if (result.outcome === "dead") {
            deadRemoved++;
            await db
              .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
              .bind(row.endpoint)
              .run();
          } else {
            failed++;
          }
        }

        await recordPushSend(
          db,
          {
            sentByEmail: identity.email,
            title: body.title,
            body: body.body,
            url: body.url,
            image: body.image,
            recipientCount: subscriptions.results.length,
            sentCount: sent,
            failedCount: failed,
            deadRemovedCount: deadRemoved,
          },
          Date.now(),
        );

        const responseBody: SendPushResponseBody = {
          total: subscriptions.results.length,
          sent,
          failed,
          deadRemoved,
        };
        return Response.json(responseBody);
      },
    },
  },
});
