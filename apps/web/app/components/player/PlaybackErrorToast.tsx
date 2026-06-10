import { useStore } from "~/store";
import { Z } from "~/styles/z";

// Surfaces a play() failure visibly so users (and the team debugging on Discord)
// notice when audio silently fails to start. Sits above the player + bottom nav
// on mobile, above the player on desktop. Tap the message to retry, [ x ] to
// dismiss without retrying.
export function PlaybackErrorToast() {
  const hasError = useStore((s) => s.hasError);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const playTrack = useStore((s) => s.playTrack);
  const setHasError = useStore((s) => s.setHasError);

  if (!hasError || !nowPlaying) return null;

  return (
    <div
      // Same bottom math as <Toast>: nav (55) + mini-player (50) + safe-area + 12.
      className={`fixed inset-x-0 ${Z.toast} flex items-center justify-center pointer-events-none px-4 bottom-[calc(105px+env(safe-area-inset-bottom)+12px)] sm:bottom-[100px]`}
    >
      <div className="pointer-events-auto bg-black border border-red-400/40 text-red-400 text-xs font-mono flex items-center max-w-sm">
        <button
          type="button"
          onClick={() => playTrack(nowPlaying)}
          className="px-4 py-2 hover:text-red-300 transition-colors text-left"
        >
          [ playback_error :: tap to retry ]
        </button>
        <button
          type="button"
          onClick={() => setHasError(false)}
          aria-label="Dismiss"
          className="px-3 py-2 border-l border-red-400/30 hover:text-red-300 transition-colors"
        >
          [ x ]
        </button>
      </div>
    </div>
  );
}
