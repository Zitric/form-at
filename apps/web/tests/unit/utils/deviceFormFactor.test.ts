import { describe, expect, it } from "vitest";
import { detectFormFactor } from "~/utils/deviceFormFactor";

// Real production UA strings, same convention as inAppBrowser.test.ts and
// installCapability.test.ts — don't invent UAs, copy what real browsers send.
const UA = {
  androidChromePhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
  // Android tablets omit "Mobile" — Chrome's tablet UA on Pixel Tablet.
  androidChromeTablet:
    "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Safari/537.36",
  iPhoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  edgeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.2210.144",

  desktopChromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Safari/537.36",
  desktopChromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  desktopEdgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91",
  chromeOS:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // iPad Safari in iOS 13+ identifies as Macintosh by default. Doesn't reach
  // this helper in practice (detectPlatform routes iPad Safari to ios-safari
  // before chromium-manual), but verifying the helper's classification keeps
  // the contract documented.
  iPadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
};

describe("detectFormFactor", () => {
  describe("mobile (gets the browser-menu instruction)", () => {
    it("classifies Android Chrome phone as mobile (Mobile + Android markers)", () => {
      expect(detectFormFactor(UA.androidChromePhone)).toBe("mobile");
    });

    it("classifies Android Chrome tablet as mobile (Android only, no Mobile — covered by Android branch)", () => {
      expect(detectFormFactor(UA.androidChromeTablet)).toBe("mobile");
    });

    it("classifies iPhone Safari as mobile (Mobi marker)", () => {
      expect(detectFormFactor(UA.iPhoneSafari)).toBe("mobile");
    });

    it("classifies Samsung Internet on phone as mobile", () => {
      expect(detectFormFactor(UA.samsungInternet)).toBe("mobile");
    });

    it("classifies Edge Android as mobile", () => {
      expect(detectFormFactor(UA.edgeAndroid)).toBe("mobile");
    });
  });

  describe("desktop (gets the address-bar instruction)", () => {
    it("classifies desktop Chrome on macOS as desktop", () => {
      expect(detectFormFactor(UA.desktopChromeMac)).toBe("desktop");
    });

    it("classifies desktop Chrome on Windows as desktop", () => {
      expect(detectFormFactor(UA.desktopChromeWindows)).toBe("desktop");
    });

    it("classifies Edge on Windows as desktop", () => {
      expect(detectFormFactor(UA.desktopEdgeWindows)).toBe("desktop");
    });

    it("classifies ChromeOS as desktop (has the address-bar install icon)", () => {
      expect(detectFormFactor(UA.chromeOS)).toBe("desktop");
    });

    it("classifies iPad Safari as desktop (Macintosh UA — benign, doesn't reach this branch in practice)", () => {
      expect(detectFormFactor(UA.iPadSafari)).toBe("desktop");
    });
  });

  describe("fallback", () => {
    it("falls back to desktop on an empty UA", () => {
      expect(detectFormFactor("")).toBe("desktop");
    });
  });
});
