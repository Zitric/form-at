import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "~/components/PlayerIcons";
import { Waveform } from "~/components/Waveform";
import { type MusicSet, sets } from "~/data/sets";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";
import { ABOVE_NAV_BOTTOM } from "~/styles/layout";
import { Z } from "~/styles/z";
import { fmtTimestamp } from "~/utils/fmt";

const skipBtnClass =
  "shrink-0 w-6 text-base sm:w-5 sm:text-sm text-grey hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors";

// Resolves the glyph for the central play/pause button. Loading takes priority
// because a press during load should read as "busy", not as "ready to play".
function playToggleIcon({ loading, isPlaying }: { loading: boolean; isPlaying: boolean }) {
  if (loading) return <span className="animate-pulse opacity-60">…</span>;
  return isPlaying ? <PauseIcon /> : <PlayIcon />;
}

// Inline separator used in track meta rows. Kept as a single source of truth so
// the dot styling doesn't drift between mobile and desktop layouts.
const metaSeparator = <span className="mx-2 text-grey/40">·</span>;

// Memoised — only re-renders when play state or loading changes, not on every timeUpdate
const PlayerControls = memo(function PlayerControls({
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

// Owns currentTime/duration/peaks state and subscribes to audio events directly.
// Isolated here so the 4×/sec timeupdate re-renders never reach the rest of Player.
const PlayerSeeker = memo(function PlayerSeeker({
  audioRef,
  nowPlaying,
  seek,
  disabled,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  nowPlaying: MusicSet | null;
  seek: (time: number) => void;
  disabled: boolean;
}) {
  const cachedPeaks = useStore((s) => (nowPlaying ? s.peaksCache[nowPlaying.id] : undefined));
  const cachedDuration = useStore((s) => (nowPlaying ? s.durations[nowPlaying.id] : undefined));
  const savedPosition = useStore((s) => (nowPlaying ? s.positions[nowPlaying.id] : undefined));
  const setCachedPeaks = useStore((s) => s.setPeaks);
  const setTrackDuration = useStore((s) => s.setTrackDuration);

  // audioDuration / audioCurrentTime track what the <audio> element reports
  // (authoritative once playing). We DERIVE the displayed values on every render,
  // falling back to the cached values from the store. This means the very moment
  // rehydrate populates the store, the seeker renders with the right time, duration,
  // and waveform — no useState-init lag, no 0:00 flash.
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number | null>(null);
  const duration = audioDuration > 0 ? audioDuration : (cachedDuration ?? 0);
  const currentTime = audioCurrentTime !== null ? audioCurrentTime : (savedPosition ?? 0);
  const peaks = cachedPeaks ?? [];

  // Reset audio-derived values on track change. Cached duration/peaks/position
  // fill the gap until the new track's metadata and peaks fetch resolve.
  // biome-ignore lint/correctness/useExhaustiveDependencies: nowPlaying?.id is the trigger; the body uses store setters
  useEffect(() => {
    setAudioDuration(0);
    setAudioCurrentTime(null);
  }, [nowPlaying?.id]);

  // Subscribe to audio events directly — isolated from the main Player render cycle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setAudioCurrentTime(audio.currentTime);
    const onDuration = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      setAudioDuration(d);
      const id = useStore.getState().nowPlaying?.id;
      if (id && d > 0) setTrackDuration(id, d);
    };
    const onEnded = () => setAudioCurrentTime(0);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("seeked", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("seeked", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioRef, setTrackDuration]);

  // Fetch waveform peaks only when we don't already have them in cache. The fetched
  // result is written straight to the store, so `peaks` (derived above) updates with it.
  // Failures degrade gracefully — the seeker falls back to a plain range slider —
  // but we surface them in dev so a misconfigured peaks URL doesn't go unnoticed.
  useEffect(() => {
    if (!nowPlaying?.peaks) return;
    if (cachedPeaks && cachedPeaks.length > 0) return;
    const trackId = nowPlaying.id;
    const peaksUrl = nowPlaying.peaks;
    fetch(peaksUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setCachedPeaks(trackId, (d as { peaks: number[] }).peaks))
      .catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[player] peaks fetch failed for ${trackId} (${peaksUrl}):`, err);
        }
      });
  }, [nowPlaying?.peaks, nowPlaying?.id, cachedPeaks, setCachedPeaks]);

  const seeker =
    peaks.length > 0 ? (
      <Waveform
        peaks={peaks}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        disabled={disabled}
      />
    ) : (
      <input
        type="range"
        min={0}
        max={duration || 0}
        value={currentTime}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={disabled}
        className="flex-1 accent-gold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Seek"
      />
    );

  return (
    <>
      <span className="text-xs text-grey tabular-nums shrink-0 w-8 text-right">
        {fmtTimestamp(currentTime)}
      </span>
      {seeker}
      <span className="text-xs text-grey tabular-nums shrink-0 w-8">{fmtTimestamp(duration)}</span>
    </>
  );
});

export function Player() {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const playTrack = useStore((s) => s.playTrack);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { loading, hasError, togglePlay, seek, audioProps } = useAudioPlayer(audioRef);

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

  // Mobile lays meta out as a single inline row `artist · title · date`.
  const mobileTrackInfo = nowPlaying && (
    <>
      <span className="text-white">{nowPlaying.artist}</span>
      {metaSeparator}
      <span className="text-grey">{nowPlaying.title}</span>
      {nowPlaying.date && (
        <>
          {metaSeparator}
          <span className="text-grey">{nowPlaying.date}</span>
        </>
      )}
    </>
  );

  // Desktop stacks artist on its own line, then `title · date` underneath.
  const desktopTrackInfo = nowPlaying && (
    <div className="shrink-0 w-52 min-w-0">
      <div className="text-sm text-white truncate leading-tight">{nowPlaying.artist}</div>
      <div className="text-xs text-grey truncate">
        {nowPlaying.title}
        {nowPlaying.date && (
          <>
            {metaSeparator}
            {nowPlaying.date}
          </>
        )}
      </div>
    </div>
  );

  // The mobile player slides in/out by animating grid-template-rows between 0fr
  // and 1fr — toggled here so the rest of the JSX stays declarative.
  const mobileRowsClass = nowPlaying ? "grid-rows-[1fr]" : "grid-rows-[0fr]";

  return (
    <>
      <audio ref={audioRef} {...audioProps} preload="none" />

      {/* Mobile player — always in DOM, animates from height 0 when a track
          loads. Sits directly on top of the BottomNav (which is permanently
          anchored to the bottom edge), so its `bottom` is the nav's full
          height including iOS safe-area inset. */}
      <div
        className={`sm:hidden fixed inset-x-0 ${Z.player} bg-black grid ${mobileRowsClass}`}
        style={{
          bottom: ABOVE_NAV_BOTTOM,
          transition: "grid-template-rows 300ms ease-in-out",
        }}
      >
        <div className="overflow-hidden">
          <div className="h-[78px] pb-[5px] border-t border-white/10 font-mono flex flex-col">
            <div className="px-4 pt-1.5 pb-0.5 text-xs truncate text-center">{mobileTrackInfo}</div>
            {/* Controls + seeker */}
            <div className="px-4 flex items-center gap-2 flex-1">
              <PlayerControls
                loading={loading}
                hasError={hasError}
                isPlaying={isPlaying}
                hasPrev={!!prevSet}
                hasNext={!!nextSet}
                onPrev={onPrev}
                onNext={onNext}
                onToggle={togglePlay}
              />
              <PlayerSeeker
                audioRef={audioRef}
                nowPlaying={nowPlaying}
                seek={seek}
                disabled={loading || hasError}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop player */}
      {nowPlaying && (
        <div
          className={`hidden sm:block fixed bottom-0 inset-x-0 ${Z.player} bg-black border-t border-white/10 px-4 py-3 font-mono`}
        >
          <div className="flex items-center gap-4 max-w-2xl mx-auto w-full">
            <PlayerControls
              loading={loading}
              hasError={hasError}
              isPlaying={isPlaying}
              hasPrev={!!prevSet}
              hasNext={!!nextSet}
              onPrev={onPrev}
              onNext={onNext}
              onToggle={togglePlay}
            />

            {desktopTrackInfo}

            <div className="flex items-center gap-3 flex-1 min-w-0">
              <PlayerSeeker
                audioRef={audioRef}
                nowPlaying={nowPlaying}
                seek={seek}
                disabled={loading || hasError}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
