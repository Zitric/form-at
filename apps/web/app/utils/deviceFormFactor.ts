// Mobile vs desktop classification from the User-Agent string. Pure function,
// sibling to `detectPlatform` / `isStandalone` in installCapability.ts and
// deliberately kept SEPARATE from them — `detectPlatform`'s "chromium | ios-safari
// | other" split is settled, tested, and load-bearing for the install capability
// state machine. Form-factor is an orthogonal axis the install modal needs to
// pick the right "where the install affordance lives" instruction for Chromium
// users; folding it into `detectPlatform` would either expand the union (ripple
// through useInstallCapability + all tests) or break a stable return shape.
//
// The regex matches `Mobi` (MDN-canonical mobile marker, covers iOS, Android
// phones, Windows Phone, Samsung Internet) OR `Android` on its own. The
// Android branch catches Android *tablets*, which deliberately omit `Mobile`
// from their UA so sites render desktop-style — but an Android tablet user
// still installs via the browser's three-dot menu (no address-bar install icon
// on any Android Chrome variant, phone or tablet). Without the Android branch,
// `/Mobi/` alone would misclassify tablets as desktop and send them to a
// non-existent address-bar icon.
//
// Benign misclassifications that don't matter for the consumer:
//   - iPad Safari (iOS 13+ identifies as Macintosh) → desktop. Doesn't reach
//     us — `detectPlatform` routes iPad Safari to "ios-safari" first.
//   - iPad Chrome (CriOS) → mobile (via Mobi). Doesn't reach us either —
//     `detectPlatform` routes CriOS to "other".
//   - Touchscreen Windows laptop with desktop Chrome → desktop. Correct: it
//     genuinely has the address-bar install icon.
//
// Empty / unreadable UA → desktop fallback. The address-bar instruction
// degrades gracefully on a misclassified mobile user (they don't see an icon
// that isn't there, but they also aren't led to a wrong action).

export type FormFactor = "mobile" | "desktop";

export function detectFormFactor(ua = navigator.userAgent): FormFactor {
  if (!ua) return "desktop";
  return /Mobi|Android/i.test(ua) ? "mobile" : "desktop";
}
