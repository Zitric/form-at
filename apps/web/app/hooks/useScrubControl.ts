import { useRef } from "react";
import { useStore } from "~/store";

/** Pixel movement above which we consider a gesture a real drag (not a tap),
 *  triggering the pause-during-scrub. Mirrors Apple Music / Spotify's feel. */
const DRAG_THRESHOLD_PX = 4;

/** Shared state machine for any surface that lets the user drag-to-scrub the
 *  audio playhead. Owns three concerns that <Waveform> and <MobileProgressBar>
 *  used to duplicate:
 *
 *  1. **Pause-during-scrub.** Once the drag moves past 4px (so it's not a
 *     plain tap), pause playback so the audio doesn't stutter as the playhead
 *     leaps. Resume on release iff the audio was playing when the drag began.
 *  2. **Disabled-state snapshot.** Take `disabled` once on the first event of
 *     the gesture. Streaming audio fires `loadstart` on every seek, so
 *     `loading` (and thus `disabled`) flips back to true mid-drag — re-checking
 *     every event would freeze the scrub. The snapshot lets us follow the
 *     finger through the rest of the gesture.
 *  3. **Cleanup.** A single `endScrub` call resets all three flags at the
 *     gesture's end, so callers can't forget to reset one and leak state
 *     into the next gesture.
 *
 *  Mirrors the structure of a `useDrag` lifecycle:
 *      first → acceptIfReady() → was the drag accepted? if not, bail.
 *      every move → maybePauseOnMove(mx)
 *      last → endScrub()
 */
export function useScrubControl(disabled: boolean, duration: number) {
  const isPlaying = useStore((s) => s.isPlaying);
  const togglePlay = useStore((s) => s.togglePlay);
  const wasPlayingBeforeScrubRef = useRef(false);
  const pausedForScrubRef = useRef(false);
  const acceptedRef = useRef(false);

  return {
    /** Call on the gesture's first event. Returns true if the drag should
     *  proceed. Subsequent calls to `isAccepted` reflect this decision. */
    acceptIfReady(): boolean {
      acceptedRef.current = !disabled && duration > 0;
      return acceptedRef.current;
    },
    /** Whether the current gesture has been accepted. Use this on every
     *  move event to decide whether to keep processing. */
    isAccepted(): boolean {
      return acceptedRef.current;
    },
    /** Call on each active move event with the gesture's horizontal movement
     *  delta. Pauses playback the first time we cross the drag threshold,
     *  and only if audio was actually playing. */
    maybePauseOnMove(movementX: number): void {
      if (pausedForScrubRef.current || Math.abs(movementX) <= DRAG_THRESHOLD_PX) return;
      pausedForScrubRef.current = true;
      if (isPlaying) {
        wasPlayingBeforeScrubRef.current = true;
        togglePlay();
      }
    },
    /** Call on the gesture's last event. Resumes playback if we paused for
     *  this scrub, then clears all flags so the next gesture starts clean. */
    endScrub(): void {
      if (wasPlayingBeforeScrubRef.current) togglePlay();
      wasPlayingBeforeScrubRef.current = false;
      pausedForScrubRef.current = false;
      acceptedRef.current = false;
    },
  };
}
