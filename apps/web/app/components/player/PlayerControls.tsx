import { memo } from "react";
import { NextIcon } from "~/components/icons/NextIcon";
import { PrevIcon } from "~/components/icons/PrevIcon";
import { playToggleIcon } from "~/components/player/playerCommon";

const skipBtnClass =
  "shrink-0 w-6 text-base sm:w-5 sm:text-sm text-grey hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors";

// Three buttons in a row — prev / play-pause / next. Memoised so it only
// re-renders when its props actually change (play state, loading, has-prev/next).
// The 4×/sec timeupdate from PlayerSeeker stays scoped to PlayerSeeker.
export const PlayerControls = memo(function PlayerControls({
  loading,
  hasError,
  isPlaying,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onToggle,
}: {
  loading: boolean;
  hasError: boolean;
  isPlaying: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev || loading}
        aria-label="Previous track"
        className={skipBtnClass}
        suppressHydrationWarning
      >
        <PrevIcon />
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={loading || hasError}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="shrink-0 inline-flex items-center justify-center w-7 text-xl sm:w-10 sm:h-10 text-gold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
        suppressHydrationWarning
      >
        {playToggleIcon({ loading, isPlaying })}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || loading}
        aria-label="Next track"
        className={skipBtnClass}
        suppressHydrationWarning
      >
        <NextIcon />
      </button>
    </>
  );
});
