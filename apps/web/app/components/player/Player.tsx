import { useCallback, useEffect, useRef, useState } from "react";
import { DesktopPlayer } from "~/components/player/DesktopPlayer";
import { FullPlayer } from "~/components/player/FullPlayer";
import { MobileMiniPlayer } from "~/components/player/MobileMiniPlayer";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { getAdjacentSets } from "~/store/catalogueSlice";
import { registerAudioElement } from "~/store/playerSlice";

// Player orchestrator. Owns the single <audio> element, runs `useAudioPlayer`
// once, derives the prev/next set from the merged catalogue (live D1 +
// build-time snapshot — see catalogueSlice.ts), and composes the four
// surfaces:
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
  const catalogueSets = useStore((s) => s.catalogueSets);

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

  const { prev: prevSet, next: nextSet } = getAdjacentSets(catalogueSets, nowPlaying?.id);

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
