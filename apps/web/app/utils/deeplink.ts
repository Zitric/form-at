// Helpers for routing taps to native apps when present, falling back to the
// web URL when not. iOS handles app handoff via Universal Links, so for that
// platform a plain <a href> is the right answer — these utilities target the
// Android side, where Chrome's `intent://` scheme is the most reliable way
// to launch a specific app with a graceful browser fallback.

export const isAndroid = (): boolean =>
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

/** Builds an Android Chrome `intent://` URL that opens `packageName` if
 *  installed, or falls back to the web URL via `S.browser_fallback_url`. */
export function buildAndroidIntent(webUrl: string, packageName: string): string {
  const stripped = webUrl.replace(/^https?:\/\//, "");
  const fallback = encodeURIComponent(webUrl);
  return `intent://${stripped}#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${fallback};end`;
}
