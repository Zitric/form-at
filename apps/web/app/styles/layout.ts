// Layout dimensions for the fixed mobile chrome (bottom nav + audio bar).
// Centralised so any surface that needs to clear them — toasts, swipe dots,
// floating buttons — can derive its position from a single source. When one
// of these heights changes (e.g. Phase 2 shrinks the player into a
// mini-player), only this file moves.
//
// Pair with `env(safe-area-inset-bottom)` whenever positioning relative to
// the screen edge so devices with an iOS home indicator don't obscure the
// chrome.

export const LAYOUT = {
  /** Content height of `BottomNav` on mobile (excludes safe-area padding). */
  navHeightMobile: 55,
  /** Audio bar slot height on mobile. Phase 2 will reduce this when the
   *  rich player becomes a single-line mini-player. */
  playerHeightMobile: 78,
} as const;

/** CSS `bottom` value placing a fixed surface directly above the BottomNav,
 *  including iOS safe-area inset. */
export const ABOVE_NAV_BOTTOM = `calc(${LAYOUT.navHeightMobile}px + env(safe-area-inset-bottom))`;

/** CSS `bottom` value placing a fixed surface above both nav and player,
 *  including iOS safe-area inset. */
export const ABOVE_CHROME_BOTTOM = `calc(${LAYOUT.navHeightMobile + LAYOUT.playerHeightMobile}px + env(safe-area-inset-bottom))`;
