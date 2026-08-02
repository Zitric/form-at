// @vitest-environment node
//
// Forced to Node's native environment, not this project's default jsdom:
// signing a second JWT under jsdom threw "payload must be an instance of
// Uint8Array" from inside jose's own sign path — a cross-realm mismatch
// (jsdom's global Uint8Array/ArrayBuffer are distinct constructors from
// Node's, and jose's WebCrypto usage doesn't cross that boundary cleanly).
// This module has zero DOM surface anyway (pure JWT/crypto verification),
// so Node is also the more honest environment for it, matching
// packages/data's webPush.ts tests.
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { extractAccessToken, verifyAccessJwt } from "~/utils/verifyAccessJwt";

// Exercises the REAL jose verification code path — a locally-generated
// keypair signs test JWTs, and global fetch is stubbed to serve that key's
// JWK as the JWKS response, so createRemoteJWKSet's fetch resolves without
// a real network call. This is the standard way to test jose-based
// verification (see jose's own test suite for the same pattern) and gives
// real confidence the actual signature/issuer/audience/expiry checks work,
// not just that a mock returns what we told it to.
const TEAM_DOMAIN = "https://form-at-test.cloudflareaccess.com";
const AUD = "test-aud-tag";
const KID = "test-key-1";

let jwk: JsonWebKey;

// All test JWTs are signed once, upfront, before any fetch stubbing
// happens — signing (real Web Crypto) and stubbing global `fetch` turned
// out not to interleave safely: signing a second JWT after a
// stubGlobal/unstubAllGlobals cycle threw "payload must be an instance of
// Uint8Array" inside jose's own sign path. Presigning everything first
// sidesteps the interaction entirely and is equally valid — these are
// fixed test fixtures either way, not something that needs runtime timing.
let validToken: string;
let expiredToken: string;
let wrongAudienceToken: string;
let wrongIssuerToken: string;
let noEmailToken: string;

async function signTestJwt(
  privateKey: CryptoKey,
  overrides: {
    audience?: string;
    issuer?: string;
    expiresInSeconds?: number;
    email?: string | null;
  },
) {
  const now = Math.floor(Date.now() / 1000);
  const payload =
    overrides.email === null ? {} : { email: overrides.email ?? "person@example.com" };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: KID })
    .setIssuer(overrides.issuer ?? TEAM_DOMAIN)
    .setAudience(overrides.audience ?? AUD)
    .setIssuedAt(now)
    .setExpirationTime(now + (overrides.expiresInSeconds ?? 600))
    .sign(privateKey);
}

beforeAll(async () => {
  const keyPair = await generateKeyPair("ES256");
  jwk = await exportJWK(keyPair.publicKey);
  jwk.kid = KID;
  jwk.alg = "ES256";

  validToken = await signTestJwt(keyPair.privateKey, { email: "julian@example.com" });
  expiredToken = await signTestJwt(keyPair.privateKey, { expiresInSeconds: -60 });
  wrongAudienceToken = await signTestJwt(keyPair.privateKey, { audience: "some-other-app" });
  wrongIssuerToken = await signTestJwt(keyPair.privateKey, {
    issuer: "https://someone-elses-team.cloudflareaccess.com",
  });
  noEmailToken = await signTestJwt(keyPair.privateKey, { email: null });
});

function stubJwksFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ keys: [jwk] }),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractAccessToken", () => {
  it("reads the Cf-Access-Jwt-Assertion header when present", () => {
    const request = new Request("https://admin.formatglasgow.com/api/send-push", {
      headers: { "Cf-Access-Jwt-Assertion": "header-token" },
    });
    expect(extractAccessToken(request)).toBe("header-token");
  });

  it("falls back to the CF_Authorization cookie when the header is absent", () => {
    const request = new Request("https://admin.formatglasgow.com/api/send-push", {
      headers: { Cookie: "other=1; CF_Authorization=cookie-token; more=2" },
    });
    expect(extractAccessToken(request)).toBe("cookie-token");
  });

  it("prefers the header over the cookie when both are present", () => {
    const request = new Request("https://admin.formatglasgow.com/api/send-push", {
      headers: {
        "Cf-Access-Jwt-Assertion": "header-token",
        Cookie: "CF_Authorization=cookie-token",
      },
    });
    expect(extractAccessToken(request)).toBe("header-token");
  });

  it("returns null when neither is present — the fail-closed case", () => {
    const request = new Request("https://admin.formatglasgow.com/api/send-push");
    expect(extractAccessToken(request)).toBeNull();
  });
});

describe("verifyAccessJwt", () => {
  it("returns the identity for a valid, correctly-signed JWT", async () => {
    stubJwksFetch();
    const identity = await verifyAccessJwt(validToken, { teamDomain: TEAM_DOMAIN, aud: AUD });
    expect(identity).toEqual({ email: "julian@example.com" });
  });

  it("fails closed on an expired JWT", async () => {
    stubJwksFetch();
    const identity = await verifyAccessJwt(expiredToken, { teamDomain: TEAM_DOMAIN, aud: AUD });
    expect(identity).toBeNull();
  });

  it("fails closed on the wrong audience", async () => {
    stubJwksFetch();
    const identity = await verifyAccessJwt(wrongAudienceToken, {
      teamDomain: TEAM_DOMAIN,
      aud: AUD,
    });
    expect(identity).toBeNull();
  });

  it("fails closed on the wrong issuer", async () => {
    stubJwksFetch();
    const identity = await verifyAccessJwt(wrongIssuerToken, { teamDomain: TEAM_DOMAIN, aud: AUD });
    expect(identity).toBeNull();
  });

  it("fails closed when the email claim is missing", async () => {
    stubJwksFetch();
    const identity = await verifyAccessJwt(noEmailToken, { teamDomain: TEAM_DOMAIN, aud: AUD });
    expect(identity).toBeNull();
  });

  it("fails closed on a malformed/garbage token — the missing-header-entirely case in practice", async () => {
    stubJwksFetch();
    const identity = await verifyAccessJwt("not-a-real-jwt", { teamDomain: TEAM_DOMAIN, aud: AUD });
    expect(identity).toBeNull();
  });
});
