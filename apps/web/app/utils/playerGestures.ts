// Shared snap thresholds for the follow-finger drag gestures that morph the
// audio player between its mini-bar and full-screen states. Pulled out as
// pure functions so MobileMiniPlayer + FullPlayer share the same decision
// logic (and unit tests can cover the boundary cases without simulating raw
// pointer events).

/** Fraction of the viewport-height drag distance at which a gesture commits
 *  to its target state — mirrors Apple Music / Spotify's ~30% threshold. */
export const SNAP_PROGRESS = 0.3;
/** Velocity (px/ms) above which a flick commits regardless of distance. */
export const SNAP_VELOCITY = 0.4;

/** Decide whether a drag-up from the mini-player should snap open: distance
 *  only — the user must have pulled past the threshold.
 *
 *  Deliberately NO velocity commit here (removed 2026-07-03, field bug): the
 *  mini-player strip sits exactly where upward scroll flicks start, and a
 *  normal list-scroll flick beginning on the strip is a high-velocity
 *  ~100–200px gesture — indistinguishable from a "flick open". With the
 *  velocity shortcut, every such accidental flick launched the full player
 *  (CDP-reproduced: 210px fling = 25% of viewport → committed open).
 *  Distance-only means a deliberate pull past ~30% opens; a scroll flick
 *  peeks during contact and snaps back on release. `shouldSnapClose` keeps
 *  its velocity commit — there's no accidental path to it (the overlay must
 *  already be open) and easy dismissal matters. */
export function shouldSnapOpen(progress: number): boolean {
  return progress > SNAP_PROGRESS;
}

/** Decide whether a drag-down from the full player should snap closed.
 *  `progress` is negative when dragging toward closed (matches the
 *  `dragProgress` field in the UI slice). */
export function shouldSnapClose(progress: number, velocityY: number, movementY: number): boolean {
  if (progress < -SNAP_PROGRESS) return true;
  if (velocityY > SNAP_VELOCITY && movementY > 0) return true;
  return false;
}
