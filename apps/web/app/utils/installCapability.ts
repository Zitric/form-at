// Platform detection for the PWA install flow. Pure functions — no React, no
// store reads — so they're easy to unit-test and safe to call from anywhere
// (SSR included).
//
// Composed by `useInstallCapability` (a hook that adds reactive state from
// the store: deferred-prompt availability + persisted install/dismiss flags)
// into the final `"native" | "ios-safari" | "installed" | "unsupported"`
// shape that the InstallPromptModal switches on. Keeping that composition
// outside this file means the pure parts stay testable in isolation.

export type InstallPlatform = "chromium" | "ios-safari" | "other";

// Categorises the browser based on UA, narrowly enough to make a correct
// install-flow decision. The traps worth knowing:
//   - iOS Chrome / Firefox / Edge are NOT install-capable (Apple only allows
//     Safari to install PWAs on iOS), so they must NOT return "ios-safari"
//     even though they run on an iOS device. UA markers: CriOS, FxiOS, EdgiOS.
//   - "Edg/" (desktop / Android Edge) and "EdgiOS/" (iOS Edge) share the
//     prefix "Edg" but the literal slash in the regex separates them safely.
//   - Order matters: iOS-browser block comes FIRST so iOS Chrome can't fall
//     through to the "chromium" branch via its embedded `Chrome/` marker.
export function detectPlatform(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): InstallPlatform {
  // iOS Chrome / Firefox / Edge → no install path at all. Bail before the
  // ios-safari check so we don't promise Share-menu instructions that wouldn't
  // produce a PWA when followed.
  if (/CriOS|FxiOS|EdgiOS/.test(ua)) return "other";

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
