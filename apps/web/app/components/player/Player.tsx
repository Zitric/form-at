import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopPlayer } from "~/components/player/DesktopPlayer";
import { FullPlayer } from "~/components/player/FullPlayer";
import { MobileMiniPlayer } from "~/components/player/MobileMiniPlayer";
import { sets } from "~/data/sets";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";

// Player orchestrator. Owns the single <audio> element, runs `useAudioPlayer`
// once, derives the prev/next set from the global `sets` list, and composes
// the four surfaces:
//   - <MobileMiniPlayer>  : sub-1fr-grid bar above the BottomNav (mobile)
//   - <DesktopPlayer>     : fixed bottom bar with the full transport (desktop)
//   - <FullPlayer>        : tap-to-expand full-screen overlay (mobile)
//   - <audio>             : the actual playback element
//
// All four share `audioRef` + the outputs of `useAudioPlayer`, which is why
// they live in one parent — avoids context plumbing or module-level refs.
export function Player() {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const playTrack = useStore((s) => s.playTrack);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { loading, hasError, togglePlay, seek, audioProps } = useAudioPlayer(audioRef);

  // Shared between MobileMiniPlayer (writer) and FullPlayer (host element) so
  // the follow-finger gestures can drive translateY via direct DOM writes,
  // bypassing React entirely during the 60fps drag — keeps mid-range Androids
  // smooth. `isDragging` is the only React state involved, and it flips at
  // most twice per gesture (start + end) so React never re-renders mid-drag.
  const fullPlayerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Expose the audio element to the store so click handlers in any component can
  // call audio.play() synchronously inside the user-gesture stack frame.
  useEffect(() => {
    registerAudioElement(audioRef.current);
    return () => registerAudioElement(null);
  }, []);

  const currentIdx = sets.findIndex((s) => s.id === nowPlaying?.id);
  const prevSet = currentIdx > 0 ? sets[currentIdx - 1] : null;
  const nextSet = currentIdx < sets.length - 1 ? sets[currentIdx + 1] : null;

  const onPrev = useCallback(() => prevSet && playTrack(prevSet), [prevSet, playTrack]);
  const onNext = useCallback(() => nextSet && playTrack(nextSet), [nextSet, playTrack]);

  return (
    <>
      <audio ref={audioRef} {...audioProps} preload="none" />

      <MobileMiniPlayer
        audioRef={audioRef}
        nowPlaying={nowPlaying}
        isPlaying={isPlaying}
        loading={loading}
        hasError={hasError}
        togglePlay={togglePlay}
        fullPlayerRef={fullPlayerRef}
        setIsDragging={setIsDragging}
      />

      {nowPlaying && (
        <DesktopPlayer
          audioRef={audioRef}
          nowPlaying={nowPlaying}
          isPlaying={isPlaying}
          loading={loading}
          hasError={hasError}
          togglePlay={togglePlay}
          seek={seek}
          hasPrev={!!prevSet}
          hasNext={!!nextSet}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}

      <FullPlayer
        audioRef={audioRef}
        isPlaying={isPlaying}
        loading={loading}
        hasError={hasError}
        togglePlay={togglePlay}
        seek={seek}
        hasPrev={!!prevSet}
        hasNext={!!nextSet}
        onPrev={onPrev}
        onNext={onNext}
        containerRef={fullPlayerRef}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
      />
    </>
  );
}
