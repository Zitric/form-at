// Mobile vs desktop classification from the User-Agent string. Deliberately
// kept SEPARATE from `detectPlatform` in installCapability.ts: form-factor is
// an orthogonal axis (the install modal needs it to say where the install
// affordance lives for Chromium users), and folding it in would either expand
// that settled union or break its return shape.
//
// Matches `Mobi` (the MDN-canonical marker) OR `Android` on its own. Keep the
// Android branch: Android *tablets* omit `Mobile` from their UA so sites render
// desktop-style, but they still install via the three-dot menu — no Android
// Chrome variant has an address-bar install icon. `/Mobi/` alone would send
// tablet users to an icon that doesn't exist.
//
// Remaining misclassifications are all benign: iPad Safari and iPad Chrome
// never reach this function (`detectPlatform` routes them first), and a
// touchscreen Windows laptop correctly classifies as desktop. An empty or
// unreadable UA falls back to desktop, which degrades gracefully.

export type FormFactor = "mobile" | "desktop";

export function detectFormFactor(ua = navigator.userAgent): FormFactor {
  if (!ua) return "desktop";
  return /Mobi|Android/i.test(ua) ? "mobile" : "desktop";
}
