import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectPlatform, isStandalone } from "~/utils/installCapability";

// Real-world UA strings — copied from production browsers rather than invented
// so the matchers stay aligned with what we'd see in the wild. Same convention
// as inAppBrowser.test.ts.
const UA = {
  // Install-capable (Chromium family)
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  desktopEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",

  // iOS Safari — manual install path
  iosSafariPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosSafariPad:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",

  // iOS browsers that can't install PWAs (Apple lock-down). Critical that
  // these return "other", NOT "ios-safari" — we don't want to show
  // Share-menu instructions that wouldn't produce a PWA when followed.
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
  iosFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15",
  iosEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/120.0.0.0 Mobile/15E148 Safari/604.1",

  // No install path
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

describe("detectPlatform", () => {
  it("detects Android Chrome as chromium", () => {
    expect(detectPlatform(UA.androidChrome)).toBe("chromium");
  });

  it("detects desktop Chrome as chromium", () => {
    expect(detectPlatform(UA.desktopChrome)).toBe("chromium");
  });

  it("detects desktop Edge as chromium (Edg/ marker)", () => {
    expect(detectPlatform(UA.desktopEdge)).toBe("chromium");
  });

  it("detects Edge on Android as chromium (carries both Chrome/ and EdgA/)", () => {
    expect(detectPlatform(UA.androidEdge)).toBe("chromium");
  });

  it("detects Samsung Internet as chromium", () => {
    expect(detectPlatform(UA.samsungInternet)).toBe("chromium");
  });

  it("detects iOS Safari on iPhone as ios-safari", () => {
    expect(detectPlatform(UA.iosSafariPhone)).toBe("ios-safari");
  });

  it("detects iOS Safari on iPad as ios-safari", () => {
    expect(detectPlatform(UA.iosSafariPad)).toBe("ios-safari");
  });

  it("returns 'other' for iOS Chrome (CriOS) — Apple blocks PWA install in non-Safari iOS browsers", () => {
    expect(detectPlatform(UA.iosChrome)).toBe("other");
  });

  it("returns 'other' for iOS Firefox (FxiOS)", () => {
    expect(detectPlatform(UA.iosFirefox)).toBe("other");
  });

  it("returns 'other' for iOS Edge (EdgiOS) — and proves the Edg/ vs EdgiOS regex distinction works", () => {
    expect(detectPlatform(UA.iosEdge)).toBe("other");
  });

  it("returns 'other' for Android Firefox", () => {
    expect(detectPlatform(UA.androidFirefox)).toBe("other");
  });

  it("returns 'other' for macOS Safari (no programmatic install path)", () => {
    expect(detectPlatform(UA.macSafari)).toBe("other");
  });

  it("returns 'other' for an empty UA (SSR safety)", () => {
    expect(detectPlatform("")).toBe("other");
  });
});

describe("isStandalone", () => {
  // Each test mutates global `matchMedia` and/or `navigator.standalone`. We
  // restore them in afterEach so cross-test contamination doesn't sneak in.
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    }
    // Strip the iOS-only `standalone` property if a test set it.
    if ("standalone" in navigator) {
      // biome-ignore lint/performance/noDelete: test cleanup needs the property gone entirely, not undefined
      delete (navigator as Navigator & { standalone?: boolean }).standalone;
    }
    vi.restoreAllMocks();
  });

  function stubMatchMedia(matches: boolean) {
    window.matchMedia = ((query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as MediaQueryList) as typeof window.matchMedia;
  }

  it("returns false when neither standalone signal is set", () => {
    stubMatchMedia(false);
    expect(isStandalone()).toBe(false);
  });

  it("returns true when iOS navigator.standalone is true (PWA launched from home screen)", () => {
    stubMatchMedia(false);
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
    expect(isStandalone()).toBe(true);
  });

  it("returns true when display-mode media query matches (Android / desktop PWA)", () => {
    stubMatchMedia(true);
    expect(isStandalone()).toBe(true);
  });

  it("ignores navigator.standalone=false and falls through to media query", () => {
    stubMatchMedia(true);
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: false,
    });
    expect(isStandalone()).toBe(true);
  });
});
