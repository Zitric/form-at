import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies the Cloudflare Access identity on a request server-side. Every
// mutating admin endpoint must call this — Access gates the page load, not the
// individual server-function call, so a gated page is not sufficient on its own.
//
// There's no first-party Cloudflare helper for this. Cloudflare's own docs
// recommend the approach used here: the `jose` package (zero dependencies,
// supports the Workers runtime) with `createRemoteJWKSet` + `jwtVerify`
// against the team's JWKS endpoint.
export interface AccessIdentity {
  email: string;
}

// Access injects the JWT into the `Cf-Access-Jwt-Assertion` header on every
// request to a gated hostname — not just top-level page loads, also
// same-origin fetch/XHR calls like the one this endpoint receives — and
// Cloudflare's own docs say to prefer it: "the cookie is not guaranteed to
// be passed". The `CF_Authorization` cookie is the documented fallback.
export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;

  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookieHeader);
  return match?.[1] ?? null;
}

// Keyed by team domain (not just a single cached value) so tests using a
// different domain never collide with each other's cache entries. In
// production there's only ever one domain, so this is functionally a
// module-scope singleton that persists across requests in the same warm
// isolate — the same caching `jose`'s own `createRemoteJWKSet` already does
// internally; keying here just avoids re-creating the resolver itself.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

// Fails closed on every path: missing token, bad signature, wrong
// issuer/audience, expired — all collapse to `null`, no distinction
// surfaced to the caller beyond "not authorized". Deliberately no
// environment-based bypass (e.g. for local dev) — see PWA_PROGRESS.md's
// Phase D1 entry for why this endpoint doesn't get the same kind of
// dev-mode escape hatch the sample-data dashboard fallback does.
export async function verifyAccessJwt(
  token: string,
  config: { teamDomain: string; aud: string },
): Promise<AccessIdentity | null> {
  try {
    const jwks = getJWKS(config.teamDomain);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.teamDomain,
      audience: config.aud,
    });
    // Confirmed via Cloudflare's own Workers example code on the
    // validate-jwt-tokens docs page: `payload.email` is the claim
    // identifying the authenticated user.
    if (typeof payload.email !== "string" || payload.email.length === 0) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
