import { memo, useCallback, useEffect, useRef, useState } from "react";
import { BrandTitle } from "~/components/BrandTitle";
import { Waveform } from "~/components/Waveform";
import { type MusicSet, sets } from "~/data/sets";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const skipBtnClass =
  "shrink-0 w-5 text-grey hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer text-sm transition-colors";

// Memoised — only re-renders when play state or loading changes, not on every timeUpdate
const PlayerControls = memo(function PlayerControls({
  loading,
  error,
  isPlaying,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onToggle,
}: {
  loading: boolean;
  error: boolean;
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
      >
        ⏮
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={loading || error}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="shrink-0 w-5 text-gold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-sm"
      >
        {loading ? <span className="animate-pulse opacity-60">…</span> : isPlaying ? "⏸" : "▶"}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || loading}
        aria-label="Next track"
        className={skipBtnClass}
      >
        ⏭
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
  useEffect(() => {
    if (!nowPlaying?.peaks) return;
    if (cachedPeaks && cachedPeaks.length > 0) return;
    const trackId = nowPlaying.id;
    fetch(nowPlaying.peaks)
      .then((r) => r.json())
      .then((d) => setCachedPeaks(trackId, (d as { peaks: number[] }).peaks))
      .catch(() => {});
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
        {fmt(currentTime)}
      </span>
      {seeker}
      <span className="text-xs text-grey tabular-nums shrink-0 w-8">{fmt(duration)}</span>
    </>
  );
});

export function Player() {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const loadTrack = useStore((s) => s.loadTrack);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { loading, error, togglePlay, seek, audioProps } = useAudioPlayer(audioRef);

  const currentIdx = sets.findIndex((s) => s.id === nowPlaying?.id);
  const prevSet = currentIdx > 0 ? sets[currentIdx - 1] : null;
  const nextSet = currentIdx < sets.length - 1 ? sets[currentIdx + 1] : null;

  const onPrev = useCallback(() => prevSet && loadTrack(prevSet), [prevSet, loadTrack]);
  const onNext = useCallback(() => nextSet && loadTrack(nextSet), [nextSet, loadTrack]);

  return (
    <>
      <audio ref={audioRef} {...audioProps} preload="none" />

      {/* Mobile player — always in DOM, animates from height 0 when a track loads */}
      <div
        className={`sm:hidden fixed bottom-0 inset-x-0 z-30 bg-black grid ${nowPlaying ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        style={{ transition: "grid-template-rows 300ms ease-in-out" }}
      >
        <div className="overflow-hidden">
          <div className="h-[52px] border-t border-white/10 px-4 flex items-center gap-2 font-mono">
            <PlayerControls
              loading={loading}
              error={error}
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
              disabled={loading || error}
            />
          </div>
        </div>
      </div>

      {/* Desktop player */}
      {nowPlaying && (
        <div className="hidden sm:block fixed bottom-0 inset-x-0 z-30 bg-black border-t border-white/10 px-4 py-3 font-mono">
          <div className="flex items-center gap-4 max-w-2xl mx-auto w-full">
            <PlayerControls
              loading={loading}
              error={error}
              isPlaying={isPlaying}
              hasPrev={!!prevSet}
              hasNext={!!nextSet}
              onPrev={onPrev}
              onNext={onNext}
              onToggle={togglePlay}
            />

            <div className="shrink-0 w-52 min-w-0">
              <div className="text-xs text-grey mb-0.5">
                › signal:{" "}
                {error ? (
                  <span className="text-red-400">[ error ]</span>
                ) : isPlaying ? (
                  <span className="text-gold">[ live ]</span>
                ) : (
                  <span>[ standby ]</span>
                )}
              </div>
              <div className="text-sm font-bold truncate leading-tight">
                <BrandTitle>{nowPlaying.title}</BrandTitle>
              </div>
              <div className="text-xs text-grey truncate">{nowPlaying.artist}</div>
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              <PlayerSeeker
                audioRef={audioRef}
                nowPlaying={nowPlaying}
                seek={seek}
                disabled={loading || error}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
