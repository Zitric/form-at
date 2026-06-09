import { afterEach, describe, expect, it } from "vitest";
import { buildAndroidIntent, isAndroid } from "~/utils/deeplink";

const ORIGINAL_UA = navigator.userAgent;

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
}

afterEach(() => {
  setUserAgent(ORIGINAL_UA);
});

describe("isAndroid", () => {
  it("returns true for Android user agents", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 6) AppleWebKit/537.36");
    expect(isAndroid()).toBe(true);
  });

  it("returns false for iOS user agents", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    expect(isAndroid()).toBe(false);
  });

  it("returns false for desktop user agents", () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15");
    expect(isAndroid()).toBe(false);
  });
});

describe("buildAndroidIntent", () => {
  it("strips the https:// prefix and embeds the package + fallback", () => {
    const intent = buildAndroidIntent(
      "https://instagram.com/form.at_glasgow",
      "com.instagram.android",
    );
    expect(intent).toMatch(/^intent:\/\/instagram\.com\/form\.at_glasgow#Intent;/);
    expect(intent).toContain("scheme=https");
    expect(intent).toContain("package=com.instagram.android");
    expect(intent).toContain(
      `S.browser_fallback_url=${encodeURIComponent("https://instagram.com/form.at_glasgow")}`,
    );
    expect(intent).toMatch(/;end$/);
  });

  it("URL-encodes the fallback so query params survive the round trip", () => {
    const intent = buildAndroidIntent("https://example.com/path?a=1&b=2", "com.example");
    expect(intent).toContain(
      `S.browser_fallback_url=${encodeURIComponent("https://example.com/path?a=1&b=2")}`,
    );
  });
});
