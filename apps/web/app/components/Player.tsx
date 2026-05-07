import { useRef } from "react";
import { BrandTitle } from "~/components/BrandTitle";
import { Waveform } from "~/components/Waveform";
import { sets } from "~/data/sets";
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

type ControlsProps = {
  loading: boolean;
  error: boolean;
  isPlaying: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
};

function PlayerControls({
  loading,
  error,
  isPlaying,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onToggle,
}: ControlsProps) {
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
}

export function Player() {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const loadTrack = useStore((s) => s.loadTrack);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { loading, error, currentTime, duration, peaks, togglePlay, seek, audioProps } =
    useAudioPlayer(audioRef);

  const currentIdx = sets.findIndex((s) => s.id === nowPlaying?.id);
  const prevSet = currentIdx > 0 ? sets[currentIdx - 1] : null;
  const nextSet = currentIdx < sets.length - 1 ? sets[currentIdx + 1] : null;

  const controls = (
    <PlayerControls
      loading={loading}
      error={error}
      isPlaying={isPlaying}
      hasPrev={!!prevSet}
      hasNext={!!nextSet}
      onPrev={() => prevSet && loadTrack(prevSet)}
      onNext={() => nextSet && loadTrack(nextSet)}
      onToggle={togglePlay}
    />
  );

  const seeker =
    peaks.length > 0 ? (
      <Waveform
        peaks={peaks}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        disabled={loading || error}
      />
    ) : (
      <input
        type="range"
        min={0}
        max={duration || 0}
        value={currentTime}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={loading || error}
        className="flex-1 accent-gold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Seek"
      />
    );

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
            {controls}
            <span className="text-xs text-grey tabular-nums shrink-0 w-8 text-right">
              {fmt(currentTime)}
            </span>
            {seeker}
            <span className="text-xs text-grey tabular-nums shrink-0 w-8">{fmt(duration)}</span>
          </div>
        </div>
      </div>

      {/* Desktop player */}
      {nowPlaying && (
        <div className="hidden sm:block fixed bottom-0 inset-x-0 z-30 bg-black border-t border-white/10 px-4 py-3 font-mono">
          <div className="flex items-center gap-4 max-w-2xl mx-auto w-full">
            {controls}

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
              <span className="text-xs text-grey tabular-nums shrink-0 w-8 text-right">
                {fmt(currentTime)}
              </span>
              {seeker}
              <span className="text-xs text-grey tabular-nums shrink-0 w-8">{fmt(duration)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
