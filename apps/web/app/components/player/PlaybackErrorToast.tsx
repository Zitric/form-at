import { BracketLabel } from "~/components/BracketLabel";
import { useStore } from "~/store";
import { Z } from "~/styles/z";

// Surfaces a play() failure visibly so users (and the team debugging on Discord)
// notice when audio silently fails to start. Sits above the player + bottom nav
// on mobile, above the player on desktop. Three variants:
//
//   - Generic playback failure (`playbackBlockedReason === null`): the audio
//     element rejected play(). Tap to retry, [ x ] to dismiss.
//   - Offline-unsaved gate, standalone (`"not-saved-offline"`): fired by
//     `playerSlice.playTrack` when the user tapped play on a set that isn't
//     in IDB while `!navigator.onLine` AND we're running standalone. The
//     app user has the language of "saved"; surface that directly.
//   - Offline-unsaved gate, browser tab (`"tab-offline-needs-network"`):
//     same gate, but in a tab tabs never read IDB (the SW pure-passes on a
//     missing `?ctx=app` marker — see sw.ts) so EVERY offline play in a tab
//     hits this branch. Tab users have no concept of "saved" — point them
//     at the app instead.
// No retry for either gate variant — retrying lands on the same condition.
// The save-this-set affordance lives on the detail page; pointing the user
// there would mean cross-route navigation from a transient toast, which we
// don't currently support.
export function PlaybackErrorToast() {
  const hasError = useStore((s) => s.hasError);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const playbackBlockedReason = useStore((s) => s.playbackBlockedReason);
  const playTrack = useStore((s) => s.playTrack);
  const setHasError = useStore((s) => s.setHasError);

  if (!hasError || !nowPlaying) return null;

  const isAppOfflineGate = playbackBlockedReason === "not-saved-offline";
  const isTabOfflineGate = playbackBlockedReason === "tab-offline-needs-network";

  const dismiss = () => setHasError(false);

  return (
    <div
      // Same bottom math as <Toast>: nav (55) + mini-player (50) + safe-area + 12.
      className={`fixed inset-x-0 ${Z.toast} flex items-center justify-center pointer-events-none px-4 bottom-[calc(105px+env(safe-area-inset-bottom)+12px)] sm:bottom-[100px]`}
    >
      <div className="pointer-events-auto bg-black border border-red-400/40 text-red-400 text-xs font-mono flex items-center max-w-sm">
        {isAppOfflineGate ? (
          <button
            type="button"
            onClick={dismiss}
            className="px-4 py-2 hover:text-red-300 transition-colors text-left whitespace-nowrap"
          >
            <BracketLabel tone="red">✗ not saved for offline listening</BracketLabel>
          </button>
        ) : isTabOfflineGate ? (
          <button
            type="button"
            onClick={dismiss}
            className="px-4 py-2 hover:text-red-300 transition-colors text-left"
          >
            <BracketLabel tone="red">
              ✗ playback needs connection — open the app to listen offline
            </BracketLabel>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => playTrack(nowPlaying)}
            className="px-4 py-2 hover:text-red-300 transition-colors text-left"
          >
            <BracketLabel tone="red">playback_error :: tap to retry</BracketLabel>
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="px-3 py-2 border-l border-red-400/30 hover:text-red-300 transition-colors"
        >
          <BracketLabel tone="red">x</BracketLabel>
        </button>
      </div>
    </div>
  );
}
