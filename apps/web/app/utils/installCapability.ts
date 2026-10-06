// Platform detection for the PWA install flow. Pure functions — no React, no
// store reads — so they're easy to unit-test and safe to call from anywhere
// (SSR included).
//
// Composed by `useInstallCapability` (a hook that adds reactive state from
// the store: deferred-prompt availability + persisted install/dismiss flags)
// into the final `"native" | "ios-safari" | "installed" | "unsupported"`
// shape that the InstallPromptModal switches on. Keeping that composition
// outside this file means the pure parts stay testable in isolation.

import { inAppContext } from "./inAppBrowser";

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
//   - Firefox, Opera, Edge and Brave on Android stay "other" (see
//     isShortcutOnlyAndroidBrowser). Firefox's case is the least certain:
//     TECH_DEBT.md item 32.
export function detectPlatform(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  brave: boolean = hasBraveApi(),
): InstallPlatform {
  // An app's own browser (Instagram's, Facebook's…), on either OS: no
  // install path of its own, whatever its UA says — on Android it carries
  // `Chrome/`, on iOS it reads as Safari. Before every other branch, or it
  // gets Chrome's menu steps or Safari's share-menu steps, neither of which
  // exists inside the app.
  if (inAppContext(ua)) return "other";

  if (iosThirdPartyBrowser(ua)) return isIosAtLeast(ua, 16, 4) ? "ios-other" : "other";

  // Chromium-based, but they only add a home-screen shortcut: before the
  // chromium branch, or they get Chrome's install steps.
  if (isShortcutOnlyAndroidBrowser(ua, brave)) return "other";

  // Real iOS Safari (iOS device, none of the third-party browser markers
  // above). Returns ios-safari so the modal can render manual install
  // instructions (iOS has no programmatic install prompt).
  if (/iPad|iPhone|iPod/.test(ua)) return "ios-safari";

  // Chromium family (Android Chrome, Samsung Internet, and desktop Chrome,
  // Edge, Opera, Brave, Arc, Vivaldi — they all carry `Chrome/` or
  // `Chromium/` or `Edg/`). These fire `beforeinstallprompt`, so the modal
  // will surface the native install button.
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

/** Brave hides itself from its UA (it sends Chrome's); `navigator.brave` gives it away. */
function hasBraveApi(): boolean {
  return typeof navigator !== "undefined" && "brave" in navigator;
}

/**
 * An Android browser that "installs" only a home-screen shortcut opening an
 * ordinary tab, never the standalone app that saving offline and stories
 * need. web.dev ("Installation", learn/pwa): only Chrome and Samsung
 * Internet on Samsung devices install a real app; Firefox, Edge, Opera and
 * Brave "create shortcuts". Brave confirms it for itself
 * (github.com/brave/brave-browser/issues/56133). Samsung Internet on a
 * non-Samsung phone is the same, but its UA can't say which phone it's on.
 */
export function isShortcutOnlyAndroidBrowser(ua: string, brave = false): boolean {
  return /Android/.test(ua) && (/Firefox\/|OPR\/|EdgA\//.test(ua) || brave);
}

/**
 * Where to send someone whose browser can't install:
 *   - open-in-browser: an Android app's browser, out through its own menu
 *     (⋮) to the system default browser — which may be Opera or Brave, so
 *     the copy also says which browsers install
 *   - open-in-safari: an iOS app's browser, out through its menu (⋯) to Safari
 *   - use-chrome: an Android browser that only adds shortcuts
 *   - use-safari: an iOS browser older than 16.4
 *   - use-chrome-or-safari: anything else (desktop Safari / Firefox)
 */
export type NoInstallHint =
  | "open-in-browser"
  | "open-in-safari"
  | "use-chrome"
  | "use-safari"
  | "use-chrome-or-safari";

export function noInstallHint(ua: string, brave: boolean = hasBraveApi()): NoInstallHint {
  const inApp = inAppContext(ua);
  if (inApp) return inApp.destination === "safari" ? "open-in-safari" : "open-in-browser";
  if (iosThirdPartyBrowser(ua)) return "use-safari";
  if (isShortcutOnlyAndroidBrowser(ua, brave)) return "use-chrome";
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
