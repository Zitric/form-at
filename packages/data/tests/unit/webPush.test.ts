import { afterEach, describe, expect, it, vi } from "vitest";
import { type PushPayload, isDeadSubscriptionStatus, sendWebPush } from "~/webPush";

// Locks the Web Push spec's permanent-invalidation contract (Phase 2,
// 2026-07-15): 404 and 410 from the push service mean the subscription is
// gone for good and must stop being sent to — while transient failures
// (429 rate limit, 5xx) must NOT be treated as dead, or a caller would
// delete live subscriptions on a bad day at the push service.
//
// `sendWebPush`'s status→outcome mapping is tested below with the builder
// mocked and fetch stubbed — the crypto/signing itself and real
// push-service responses can only be verified on-device (see
// PWA_PROGRESS.md's checklist). Moved here unchanged from
// apps/web/tests/unit/utils/webPush.test.ts in Phase D1 (2026-08-01) when
// the module itself moved to packages/data so apps/admin could import it.

describe("isDeadSubscriptionStatus", () => {
  it("treats 404 as dead", () => {
    expect(isDeadSubscriptionStatus(404)).toBe(true);
  });

  it("treats 410 as dead", () => {
    expect(isDeadSubscriptionStatus(410)).toBe(true);
  });

  it("does not treat 200/201 (success) as dead", () => {
    expect(isDeadSubscriptionStatus(200)).toBe(false);
    expect(isDeadSubscriptionStatus(201)).toBe(false);
  });

  it("does not treat other error statuses (e.g. 429, 500, 401) as dead", () => {
    expect(isDeadSubscriptionStatus(429)).toBe(false);
    expect(isDeadSubscriptionStatus(500)).toBe(false);
    expect(isDeadSubscriptionStatus(401)).toBe(false);
  });
});

// Mocked at the module boundary: the builder's real implementation does
// ECDH + AES-GCM against the stored keys, which is exactly the part that
// can only be validated by a real push service accepting the result. What
// THIS suite locks is our own mapping of the service's HTTP status to a
// SendPushResult — the contract callers' delete-vs-retry decision hangs on.
vi.mock("@pushforge/builder", () => ({
  buildPushHTTPRequest: vi.fn().mockResolvedValue({
    endpoint: "https://push.example.com/send/abc",
    headers: { "Content-Encoding": "aesgcm" },
    body: new ArrayBuffer(8),
  }),
}));

const subscription = {
  endpoint: "https://push.example.com/send/abc",
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};
const payload = { title: "t", body: "b" };
const vapid = { privateJWK: "{}", contact: "mailto:x@example.com" };

function stubFetchStatus(status: number, statusText = "") {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, statusText }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendWebPush status→outcome mapping", () => {
  it("201 (the documented push-service success) → sent", async () => {
    stubFetchStatus(201);
    expect(await sendWebPush(subscription, payload, vapid)).toEqual({ outcome: "sent" });
  });

  it("200 → sent", async () => {
    stubFetchStatus(200);
    expect(await sendWebPush(subscription, payload, vapid)).toEqual({ outcome: "sent" });
  });

  it("404 and 410 → dead, with the status carried for the caller's log", async () => {
    stubFetchStatus(404);
    expect(await sendWebPush(subscription, payload, vapid)).toEqual({
      outcome: "dead",
      status: 404,
    });
    stubFetchStatus(410);
    expect(await sendWebPush(subscription, payload, vapid)).toEqual({
      outcome: "dead",
      status: 410,
    });
  });

  it("429 rate-limit → failed, NOT dead (transient — must not trigger deletion)", async () => {
    stubFetchStatus(429, "Too Many Requests");
    expect(await sendWebPush(subscription, payload, vapid)).toEqual({
      outcome: "failed",
      status: 429,
      statusText: "Too Many Requests",
    });
  });

  it("5xx → failed, NOT dead", async () => {
    stubFetchStatus(502, "Bad Gateway");
    expect(await sendWebPush(subscription, payload, vapid)).toEqual({
      outcome: "failed",
      status: 502,
      statusText: "Bad Gateway",
    });
  });
});

// `sendWebPush` treats `payload` as opaque — it's handed straight to
// `buildPushHTTPRequest` for encryption, never destructured. A regression
// here (e.g. someone later rebuilding the message object field-by-field)
// would silently drop new PushPayload fields with no type error, since
// they're all optional. Locks that the full 2026-07-21 shape (image,
// requireInteraction, timestamp) survives unchanged.
describe("sendWebPush — payload passthrough", () => {
  it("forwards every PushPayload field, including the new optional ones, unchanged", async () => {
    const { buildPushHTTPRequest } = await import("@pushforge/builder");
    stubFetchStatus(201);
    const fullPayload: PushPayload = {
      title: "New set: DJ Name",
      body: "Fresh from the booth",
      url: "/sets/003",
      image: "/images/sets/003-1080.webp",
      requireInteraction: true,
      timestamp: 1_700_000_000_000,
    };

    await sendWebPush(subscription, fullPayload, vapid);

    expect(buildPushHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.objectContaining({ payload: fullPayload }) }),
    );
  });
});
