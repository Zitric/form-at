import { BracketLabel } from "~/components/BracketLabel";
import { useStore } from "~/store";
import { Z } from "~/styles/z";

// Surfaces a play() failure visibly so users (and the team debugging on Discord)
// notice when audio silently fails to start. Sits above the player + bottom nav
// on mobile, above the player on desktop. Three variants:
//
//   - Generic playback failure (`playbackBlockedReason === null`): the audio
//     element rejected play() for a runtime reason (decode error, mid-play
//     network drop). Brief informational message.
//   - Offline-unsaved gate, standalone (`"not-saved-offline"`): fired by
//     `playerSlice.playTrack` when the user tapped play on a set that isn't
//     in IDB while `!navigator.onLine` AND we're running standalone. The
//     app user has the language of "saved"; surface that directly.
//   - Offline gate, browser tab (`"tab-offline-needs-network"`): unified for
//     ALL offline tab-context attempts (whether the set is downloaded-in-the-
//     app or not). Tabs never read IDB (see `sw.ts` audio handler), so from
//     the web the downloaded/not-downloaded distinction is invisible — one
//     message, "open the app to listen offline."
//
// Shape: the whole toast surface is click-to-dismiss. The `[ x ]` on the
// right is a visual affordance signalling dismissability, not a separate
// button. No vertical separator between message and glyph — the message
// text runs plain, brackets live only on the `x` per the design-system
// bracket rules. Shortening the tab-offline copy also unwraps the toast on
// iPhone SE, which the previous "playback needs connection — open the app
// to listen offline" copy overflowed onto a second line.
export function PlaybackErrorToast() {
  const hasError = useStore((s) => s.hasError);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const playbackBlockedReason = useStore((s) => s.playbackBlockedReason);
  const setHasError = useStore((s) => s.setHasError);

  if (!hasError) return null;
  // Generic playback errors need a loaded track for context — but the
  // offline-blocked reasons are set by the playTrack gate BEFORE any track
  // is attached (playerSlice returns early on a blocked FIRST tap, so
  // `nowPlaying` can still be null). Requiring nowPlaying for those made a
  // fresh-session offline tap in a tab fail silently: gate fired, toast
  // never rendered, button read as dead (found via SW-preview diagnosis,
  // 2026-07-02 evening — TECH_DEBT 17 follow-up).
  if (!nowPlaying && !playbackBlockedReason) return null;

  const message =
    playbackBlockedReason === "not-saved-offline"
      ? "✗ not saved for offline listening"
      : playbackBlockedReason === "tab-offline-needs-network"
        ? "✗ open the app to listen offline"
        : "playback error";

  const dismiss = () => setHasError(false);

  return (
    <div
      // Same bottom math as <Toast>: nav (55) + mini-player (50) + safe-area + 12.
      className={`fixed inset-x-0 ${Z.toast} flex items-center justify-center pointer-events-none px-4 bottom-[calc(105px+env(safe-area-inset-bottom)+12px)] sm:bottom-[100px]`}
      role="alert"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss playback error"
        className="pointer-events-auto bg-black border border-red-400/40 text-red-400 text-xs font-mono flex items-center gap-3 max-w-sm px-4 py-2 hover:text-red-300 transition-colors text-left cursor-pointer"
      >
        <span className="flex-1">{message}</span>
        <BracketLabel tone="red">x</BracketLabel>
      </button>
    </div>
  );
}
