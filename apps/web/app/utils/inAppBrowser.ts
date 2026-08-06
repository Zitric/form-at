// Detects whether the page is rendered inside a known in-app browser (i.e. a
// WebView embedded in a social app rather than a real browser). Pure function,
// no side effects — UA in, brand name (or null) out.
//
// Used by <InAppBrowserBanner> to surface a "tap ⋯ and open in safari"
// instruction. Don't add automatic WebView escape: iOS in-app browsers trap
// users by design, and the URL-scheme tricks that appear to work (e.g.
// `x-safari-https://`) are version-dependent and fail silently on most current
// host-app builds. Teaching the manual escape beats a button that fails opaquely.
//
// UA matchers chosen for narrow specificity:
//   - Instagram: literal "Instagram"
//   - Facebook:  "FBAN" or "FBAV" (FB App Native / App Version tags injected
//                by the Facebook app's WebView)
//   - TikTok:    "TikTok" or the legacy "musical_ly" tag still present in
//                older app builds
//   - Line:      "Line/" (the slash version separator avoids matching any
//                website with "Line" in its name)
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
