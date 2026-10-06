// Detects whether the page is rendered inside an app's built-in browser (a
// WebView in Instagram, Facebook… rather than a real browser), on which OS,
// and how the visitor gets out of it. Pure: UA in, answer out.
//
// One helper for every surface that tells someone to leave — the full-audio
// banner (InAppBrowserBanner, iOS only: on Android the audio keeps playing,
// so its premise is false there; that file says why), the install gate and
// the story gate (both via installCapability.ts) — so they can't disagree
// about the platform again.
//
// Don't add automatic WebView escape: in-app browsers trap users by design,
// and the URL-scheme tricks that appear to work (e.g. `x-safari-https://`)
// are version-dependent and fail silently on most current host-app builds.
// Teaching the manual escape beats a button that fails opaquely.
//
// UA matchers chosen for narrow specificity:
//   - Instagram: literal "Instagram"
//   - Facebook:  "FBAN" or "FBAV" (FB App Native / App Version tags injected
//                by the Facebook app's WebView)
//   - TikTok:    "TikTok" or the legacy "musical_ly" tag still present in
//                older app builds
//   - Line:      "Line/" (the slash version separator avoids matching any
//                website with "Line" in its name)
//   - any other Android WebView: `; wv)`, Android's own WebView marker
export type InAppBrowser = "instagram" | "facebook" | "tiktok" | "line";

export function isInAppBrowser(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): InAppBrowser | null {
  if (/Instagram/.test(ua)) return "instagram";
  if (/FBAN|FBAV/.test(ua)) return "facebook";
  if (/TikTok|musical_ly/.test(ua)) return "tiktok";
  if (/Line\//.test(ua)) return "line";
  return null;
}

export interface InAppContext {
  /** A known app, or "webview" for an unnamed Android WebView. */
  app: InAppBrowser | "webview";
  os: "android" | "ios";
  /** The app browser's menu, as drawn: ⋮ on Android, ⋯ on iOS. */
  menu: "⋮" | "⋯";
  /**
   * Where its "open in…" entry goes. Android: the system default browser —
   * Opera, Brave, Samsung Internet or Chrome, whichever is set — under a
   * label that varies by app version ("Open in browser", "Open in Chrome",
   * "Open externally"). iOS: Safari, the only browser that installs the app
   * on every iOS version, which is also what the entry usually names.
   */
  destination: "browser" | "safari";
}

/** The app browser this page is in, or null in a real browser. */
export function inAppContext(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): InAppContext | null {
  const app = isInAppBrowser(ua);
  if (/Android/.test(ua) && (app || /; wv\)/.test(ua))) {
    return { app: app ?? "webview", os: "android", menu: "⋮", destination: "browser" };
  }
  if (/iPhone|iPad|iPod/.test(ua) && app) {
    return { app, os: "ios", menu: "⋯", destination: "safari" };
  }
  return null;
}
