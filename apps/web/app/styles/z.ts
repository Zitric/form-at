// Single source of truth for the fixed/sticky stacking order across the app.
// Higher Tailwind value = closer to the viewer. Route every ad-hoc `z-40` /
// `z-50` in components through this object so we never accidentally end up
// with two surfaces fighting at the same layer.
//
// `Modal` is intentionally absent — it's built on the native `<dialog>` element
// and `showModal()` puts it in the browser's top layer, which always wins over
// CSS z-index. So Modal needs no entry here.
export const Z = {
  /** Persistent audio bar at the bottom edge. */
  player: "z-10",
  /** Mobile bottom nav — slides above the player when audio is loaded. */
  bottomNav: "z-20",
  /** Page-swipe direction indicator dots. Sits above the nav so it remains
   *  visible during a drag, but stays *below* `toast` so a copy-success or
   *  error-retry pill never disappears behind it. */
  swipeIndicator: "z-30",
  /** Mobile full-screen "now playing" overlay. Covers nav + mini-player +
   *  swipe indicator when open. Toast stays above it so share-success and
   *  error pills are still visible while the overlay is up. */
  fullPlayer: "z-40",
  /** Transient feedback pills — copy success, playback error retry. Top of
   *  the stack (excluding the native dialog top layer used by Modal). */
  toast: "z-50",
} as const;
