import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "~/pushEndpoints";

// `/api/push-subscribe` is public and unauthenticated, and whatever it stores is
// later POSTed to by sendWebPush. This allowlist is the only thing stopping that
// from being a request-forwarding primitive aimed wherever the caller likes, so
// both directions are locked: real endpoints keep working, and every shape of
// lookalike host is refused.

describe("real push-service endpoints are accepted", () => {
  // Shapes taken from web-push-libs' endpoint reference and Apple's Safari
  // web-push guidance, not from memory — see pushEndpoints.ts for the sources.
  it.each([
    ["Chrome / Edge / Opera / Brave (VAPID)", "https://fcm.googleapis.com/fcm/send/abc123"],
    ["Chrome (legacy GCM path)", "https://android.googleapis.com/gcm/send/abc123"],
    ["Firefox", "https://updates.push.services.mozilla.com/wpush/v2/abc123"],
    ["Safari / iOS", "https://web.push.apple.com/QRSTUV-abc123"],
    ["pre-Chromium Edge (WNS)", "https://db5p.notify.windows.com/w/?token=abc123"],
  ])("%s", (_label, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it("accepts an unseen subdomain of an allowed service", () => {
    // Apple's guidance is explicitly to allow ANY subdomain of push.apple.com,
    // and Mozilla's autopush fleet is likewise not a single host — so the match
    // has to be a suffix, not an exact hostname.
    expect(isAllowedPushEndpoint("https://api.push.apple.com/3/device/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://autopush-2.push.services.mozilla.com/wpush/v2/x")).toBe(
      true,
    );
  });
});

describe("attacker-controlled hosts are rejected", () => {
  it("rejects an arbitrary host", () => {
    expect(isAllowedPushEndpoint("https://evil.example/collect")).toBe(false);
  });

  it("rejects a host that merely STARTS with an allowed one", () => {
    // The case a `startsWith("https://fcm.googleapis.com")` check would wave
    // through. The real host is evil.example.
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/fcm/send/x")).toBe(false);
  });

  it("rejects userinfo smuggling", () => {
    // Parses to hostname `evil.example`; everything before the `@` is credentials.
    // This is the specific reason the check parses the URL instead of matching
    // the raw string.
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com@evil.example/fcm/send/x")).toBe(false);
  });

  it("rejects a lookalike that ends with an allowed host without the dot boundary", () => {
    // `evilpush.apple.com` ends with `push.apple.com` as a plain substring; only
    // the leading `.` in the suffix match keeps it out.
    expect(isAllowedPushEndpoint("https://evilpush.apple.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://notfcm.googleapis.com.co/x")).toBe(false);
  });

  it("rejects non-HTTPS schemes, including ones aimed at an allowed host", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
    expect(isAllowedPushEndpoint("file:///etc/passwd")).toBe(false);
  });

  it("rejects internal and loopback targets", () => {
    // SSRF-shaped inputs: these are the interesting ones on a Worker, where
    // 169.254.169.254-style metadata endpoints and private ranges are exactly
    // what an attacker would aim at.
    expect(isAllowedPushEndpoint("https://127.0.0.1/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
  });

  it("rejects unparseable input rather than throwing", () => {
    // validate() calls this on raw request-body data, so a malformed string must
    // return false, not blow up the handler.
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
    expect(isAllowedPushEndpoint("")).toBe(false);
  });
});
