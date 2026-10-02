// Platform detection for the PWA install flow. Pure functions — no React, no
// store reads — so they're easy to unit-test and safe to call from anywhere
// (SSR included).
//
// Composed by `useInstallCapability` (a hook that adds reactive state from
// the store: deferred-prompt availability + persisted install/dismiss flags)
// into the final `"native" | "ios-safari" | "installed" | "unsupported"`
// shape that the InstallPromptModal switches on. Keeping that composition
// outside this file means the pure parts stay testable in isolation.

import { isInAppBrowser } from "./inAppBrowser";

export type InstallPlatform = "chromium" | "ios-safari" | "ios-other" | "other";

// Categorises the browser based on UA, narrowly enough to make a correct
// install-flow decision. The traps worth knowing:
//   - iOS Chrome / Firefox / Edge (UA markers CriOS, FxiOS, EdgiOS) can add a
//     web app to the Home Screen from their Share menu since iOS 16.4
//     (webkit.org/blog/13878; MDN's "Making PWAs installable"). Before 16.4
//     only Safari could, so an older iOS third-party browser is "other" and
//     gets "open it in Safari" rather than steps that produce no app.
//   - "Edg/" (desktop / Android Edge) and "EdgiOS/" (iOS Edge) share the
//     prefix "Edg" but the literal slash in the regex separates them safely.
//   - Order matters: iOS-browser block comes FIRST so iOS Chrome can't fall
//     through to the "chromium" branch via its embedded `Chrome/` marker.
//   - Firefox on Android stays "other": per MDN it adds a browser-badged
//     shortcut that opens the site in the browser, and whether that runs in
//     standalone display-mode (which saving offline needs) is unverified.
//     TECH_DEBT.md item 32.
export function detectPlatform(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): InstallPlatform {
  if (iosThirdPartyBrowser(ua)) return isIosAtLeast(ua, 16, 4) ? "ios-other" : "other";

  // An Android WebView (Instagram's, Facebook's…) carries `Chrome/` but isn't
  // Chrome: MDN lists only Chrome and Samsung Internet as Android browsers
  // that install a web app, and a WebView has neither browser's install menu.
  // Before the chromium branch, or it gets Chrome's menu steps.
  if (isAndroidWebView(ua)) return "other";

  // Real iOS Safari (iOS device, none of the third-party browser markers
  // above). Returns ios-safari so the modal can render manual install
  // instructions (iOS has no programmatic install prompt).
  if (/iPad|iPhone|iPod/.test(ua)) return "ios-safari";

  // Chromium family (Android Chrome, desktop Chrome, Edge, Samsung Internet,
  // Opera, Brave, Arc, Vivaldi — they all carry `Chrome/` or `Chromium/`
  // or `Edg/`). These fire `beforeinstallprompt`, so the modal will surface
  // the native install button.
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return "chromium";

  // Firefox (any platform), macOS Safari, anything else — no install path
  // we can drive. The modal will render a graceful fallback or hide entirely.
  return "other";
}

export type IosThirdPartyBrowser = "Chrome" | "Firefox" | "Edge";

/** Which third-party browser this is on iOS, or null for anything else. */
export function iosThirdPartyBrowser(ua: string): IosThirdPartyBrowser | null {
  if (/CriOS\//.test(ua)) return "Chrome";
  if (/FxiOS\//.test(ua)) return "Firefox";
  if (/EdgiOS\//.test(ua)) return "Edge";
  return null;
}

// "CPU iPhone OS 16_4 like Mac OS X" / "CPU OS 17_5 like Mac OS X" (iPad).
// No version in the UA reads as too old: the guidance then says "use Safari",
// which works on every iOS version.
function isIosAtLeast(ua: string, major: number, minor: number): boolean {
  const m = /OS (\d+)_(\d+)/.exec(ua);
  if (!m) return false;
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj > major || (maj === major && min >= minor);
}

/**
 * An app's built-in browser on Android: a known in-app browser, or any
 * WebView (`; wv)` in the UA, Android's own WebView marker). It can't install
 * the app, and has no Web Share at all (MDN's compat data: `navigator.share`
 * unsupported in WebView Android).
 */
export function isAndroidWebView(ua: string): boolean {
  return /Android/.test(ua) && (/; wv\)/.test(ua) || isInAppBrowser(ua) !== null);
}

/**
 * Where to send someone whose browser can't install: an Android in-app
 * browser out to Chrome through its own menu, Firefox on Android to Chrome,
 * an iOS browser older than 16.4 to Safari, anything else (desktop Safari /
 * Firefox) to either.
 */
export type NoInstallHint = "open-in-chrome" | "use-chrome" | "use-safari" | "use-chrome-or-safari";

export function noInstallHint(ua: string): NoInstallHint {
  if (isAndroidWebView(ua)) return "open-in-chrome";
  if (iosThirdPartyBrowser(ua)) return "use-safari";
  if (/Android/.test(ua) && /Firefox\//.test(ua)) return "use-chrome";
  return "use-chrome-or-safari";
}

// Detects whether the page is currently being rendered inside an installed
// PWA (launched from a home-screen icon, not from a browser address bar).
// Two signals because the platforms disagree on which to expose:
//   - iOS Safari sets `navigator.standalone` (non-standard, boolean)
//   - Android / desktop use the standard `(display-mode: standalone)` media
//     query
// SSR-safe via the `typeof window` guard.
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (
    "standalone" in navigator &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  ) {
    return true;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}
