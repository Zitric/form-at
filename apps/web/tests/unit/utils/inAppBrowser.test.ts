import { describe, expect, it } from "vitest";
import { inAppContext, isInAppBrowser } from "~/utils/inAppBrowser";

// Real-world UA strings — copied from recent host-app builds rather than
// invented, so the matchers stay aligned with what production sees.
const UA = {
  instagramIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 348.0.0.31.106 (iPhone15,3; iOS 17_5; en_GB; en-GB; scale=3.00; 1290x2796; 612234217)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36 Instagram 348.0.0.31.106 Android (34/14; 420dpi; 1080x2400; Google; Pixel 8; shiba; shiba; en_GB; 612234217)",
  facebookIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/465.0.0.40.97;FBBV/611234567;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5]",
  tiktokIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_2024.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en BytedanceWebview/d8a21c6",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 trill_2024100100/34.0.0 JsSdk/2.0 NetType/WIFI Channel/googleplay AppName/TikTok",
  lineIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.5.0",
  safariIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.5845.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/430.0.0.23.113;]",
  webviewAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240305.019; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.105 Mobile Safari/537.36",
  operaAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36 OPR/84.0.4452.82342",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  chromeDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

describe("isInAppBrowser", () => {
  it("detects Instagram on iOS", () => {
    expect(isInAppBrowser(UA.instagramIOS)).toBe("instagram");
  });

  it("detects Instagram on Android", () => {
    expect(isInAppBrowser(UA.instagramAndroid)).toBe("instagram");
  });

  it("detects Facebook via FBAN/FBAV tags", () => {
    expect(isInAppBrowser(UA.facebookIOS)).toBe("facebook");
  });

  it("detects TikTok via the legacy musical_ly tag (older app builds)", () => {
    expect(isInAppBrowser(UA.tiktokIOS)).toBe("tiktok");
  });

  it("detects TikTok via the modern AppName/TikTok marker", () => {
    expect(isInAppBrowser(UA.tiktokAndroid)).toBe("tiktok");
  });

  it("detects Line via the `Line/` version separator", () => {
    expect(isInAppBrowser(UA.lineIOS)).toBe("line");
  });

  it("returns null for real Safari on iOS", () => {
    expect(isInAppBrowser(UA.safariIOS)).toBeNull();
  });

  it("returns null for Chrome on Android", () => {
    expect(isInAppBrowser(UA.chromeAndroid)).toBeNull();
  });

  it("returns null for Chrome on desktop", () => {
    expect(isInAppBrowser(UA.chromeDesktop)).toBeNull();
  });

  it("returns null for an empty UA (SSR safety)", () => {
    expect(isInAppBrowser("")).toBeNull();
  });
});

// The one answer every "leave this app's browser" surface reads (the audio
// banner, the install gate, the story gate).
describe("inAppContext", () => {
  it("Instagram on Android: ⋮, out to the default browser", () => {
    expect(inAppContext(UA.instagramAndroid)).toEqual({
      app: "instagram",
      os: "android",
      menu: "⋮",
      destination: "browser",
    });
  });

  it("Instagram on iOS: ⋯, out to Safari", () => {
    expect(inAppContext(UA.instagramIOS)).toEqual({
      app: "instagram",
      os: "ios",
      menu: "⋯",
      destination: "safari",
    });
  });

  it("Facebook and TikTok on Android, and an unnamed Android WebView", () => {
    expect(inAppContext(UA.facebookAndroid)).toMatchObject({ app: "facebook", os: "android" });
    expect(inAppContext(UA.tiktokAndroid)).toMatchObject({ app: "tiktok", os: "android" });
    expect(inAppContext(UA.webviewAndroid)).toMatchObject({ app: "webview", os: "android" });
  });

  it("is null in a real browser: Chrome, Opera, Samsung (and Brave, which sends Chrome's UA), Safari, desktop", () => {
    for (const ua of [
      UA.chromeAndroid,
      UA.operaAndroid,
      UA.samsungAndroid,
      UA.safariIOS,
      UA.chromeDesktop,
    ]) {
      expect(inAppContext(ua)).toBeNull();
    }
  });
});
