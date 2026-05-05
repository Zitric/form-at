import { useEffect, useRef, useState } from "react";
import { usePlayer } from "~/contexts/player-context";

export function Player() {
  const { nowPlaying } = usePlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Load and auto-play when a new track is selected
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;

    let cancelled = false;
    const playWhenReady = () => {
      if (cancelled) return;
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => {});
    };

    audio.src = nowPlaying.src;
    audio.load();

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      playWhenReady();
    } else {
      audio.addEventListener("canplay", playWhenReady, { once: true });
    }

    return () => {
      cancelled = true;
      audio.removeEventListener("canplay", playWhenReady);
    };
  }, [nowPlaying]);

  // Register Media Session API handlers so the player keeps working on a locked phone
  useEffect(() => {
    if (!nowPlaying || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      artwork: nowPlaying.artwork
        ? [{ src: nowPlaying.artwork, sizes: "512x512", type: "image/png" }]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      audioRef.current?.play();
      setPlaying(true);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      setPlaying(false);
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });
  }, [nowPlaying]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => {});
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }

  function fmt(s: number) {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (!nowPlaying) return null;

  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: This player is for music-only content with no spoken dialogue. */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          setDuration(e.currentTarget.duration || 0);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
      <div className="fixed bottom-0 inset-x-0 bg-[#111111] border-t border-white/10 px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="shrink-0 border border-white/80 text-white px-3 py-1.5 text-sm cursor-pointer bg-transparent hover:bg-white hover:text-[#111] transition-colors"
        >
          {playing ? "⏸" : "▶"}
        </button>

        <div className="shrink-0 min-w-0 hidden sm:block">
          <div className="text-sm font-semibold truncate">{nowPlaying.title}</div>
          <div className="text-xs text-white/60 truncate">{nowPlaying.artist}</div>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs shrink-0 tabular-nums text-white/60">{fmt(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={seek}
            className="flex-1 accent-white cursor-pointer"
            aria-label="Seek"
          />
          <span className="text-xs shrink-0 tabular-nums text-white/60">{fmt(duration)}</span>
        </div>
      </div>
    </>
  );
}
