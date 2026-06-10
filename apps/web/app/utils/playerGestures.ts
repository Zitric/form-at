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

/** Decide whether a drag-up from the mini-player should snap open. Returns
 *  true if the user has either crossed the distance threshold OR released
 *  with a fast upward flick. `velocityY` is non-negative magnitude from
 *  @use-gesture/react; direction is read from `movementY`. */
export function shouldSnapOpen(progress: number, velocityY: number, movementY: number): boolean {
  if (progress > SNAP_PROGRESS) return true;
  if (velocityY > SNAP_VELOCITY && movementY < 0) return true;
  return false;
}

/** Decide whether a drag-down from the full player should snap closed.
 *  `progress` is negative when dragging toward closed (matches the
 *  `dragProgress` field in the UI slice). */
export function shouldSnapClose(progress: number, velocityY: number, movementY: number): boolean {
  if (progress < -SNAP_PROGRESS) return true;
  if (velocityY > SNAP_VELOCITY && movementY > 0) return true;
  return false;
}
