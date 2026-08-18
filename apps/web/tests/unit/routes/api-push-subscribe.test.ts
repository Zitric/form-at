import { describe, expect, it } from "vitest";
import { validate } from "~/routes/api/push-subscribe";

// Locks the wire-shape contract with `PushSubscription.toJSON()` (a
// Web-standard shape we don't control) plus the app-added `is_standalone`
// field — same allowlist-style rigor as api/event.ts's validate, just
// against a fixed shape instead of an allowlist.

const validBody = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "p256dh-key-value", auth: "auth-key-value" },
  is_standalone: true,
};

describe("validate (api/push-subscribe)", () => {
  it("accepts a well-formed subscription payload", () => {
    expect(validate(validBody)).toEqual({
      endpoint: validBody.endpoint,
      p256dh: "p256dh-key-value",
      auth: "auth-key-value",
      isStandalone: true,
    });
  });

  it("accepts is_standalone: false", () => {
    const result = validate({ ...validBody, is_standalone: false });
    expect(result?.isStandalone).toBe(false);
  });

  it("rejects a non-https endpoint", () => {
    expect(
      validate({ ...validBody, endpoint: "http://fcm.googleapis.com/fcm/send/abc123" }),
    ).toBeNull();
  });

  it("rejects an endpoint pointing at a host that isn't a push service", () => {
    // This body is public and unauthenticated, and whatever it stores gets
    // POSTed to later — so an arbitrary host here is a request-forwarding
    // primitive, not just bad data. Full host-matching coverage lives in
    // packages/data's pushEndpoints.test.ts; this asserts the endpoint is
    // actually wired to it.
    expect(validate({ ...validBody, endpoint: "https://evil.example/collect" })).toBeNull();
  });

  it("rejects a host that only starts with a real push service", () => {
    expect(
      validate({ ...validBody, endpoint: "https://fcm.googleapis.com.evil.example/fcm/send/x" }),
    ).toBeNull();
  });

  it("accepts the other real push services, not just FCM", () => {
    // Guards against the allowlist being narrowed to whatever the fixture uses
    // and silently locking out Firefox or Safari subscribers.
    for (const endpoint of [
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QRSTUV-abc",
    ]) {
      expect(validate({ ...validBody, endpoint })).not.toBeNull();
    }
  });

  it("rejects a missing endpoint", () => {
    const { endpoint, ...rest } = validBody;
    expect(validate(rest)).toBeNull();
  });

  it("rejects an empty-string endpoint", () => {
    expect(validate({ ...validBody, endpoint: "" })).toBeNull();
  });

  it("rejects an endpoint over the length cap", () => {
    expect(validate({ ...validBody, endpoint: `https://${"a".repeat(2048)}` })).toBeNull();
  });

  it("rejects a missing keys object", () => {
    const { keys, ...rest } = validBody;
    expect(validate(rest)).toBeNull();
  });

  it("rejects a missing p256dh", () => {
    expect(validate({ ...validBody, keys: { auth: "auth-key-value" } })).toBeNull();
  });

  it("rejects a missing auth", () => {
    expect(validate({ ...validBody, keys: { p256dh: "p256dh-key-value" } })).toBeNull();
  });

  it("rejects a non-boolean is_standalone", () => {
    expect(validate({ ...validBody, is_standalone: "yes" })).toBeNull();
  });

  it("rejects non-object / null / primitive payloads", () => {
    expect(validate(null)).toBeNull();
    expect(validate(undefined)).toBeNull();
    expect(validate("string")).toBeNull();
    expect(validate(42)).toBeNull();
  });
});
