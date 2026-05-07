import { useCallback, useEffect, useRef, useState } from "react";
import { BrandTitle } from "~/components/BrandTitle";
import { Waveform } from "~/components/Waveform";
import { type MusicSet, sets } from "~/data/sets";
import { useStore } from "~/store";

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function Player() {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const setLastPosition = useStore((s) => s.setLastPosition);
  const loadTrack = useStore((s) => s.loadTrack);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);

  // Sync saved position after client hydration — useState(0) avoids SSR mismatch
  useEffect(() => {
    const { nowPlaying: np, positions } = useStore.getState();
    if (np) {
      const saved = positions[np.id] ?? 0;
      if (saved > 0) setCurrentTime(saved);
    }
  }, []);

  const currentIdx = sets.findIndex((s) => s.id === nowPlaying?.id);
  const prevSet = currentIdx > 0 ? sets[currentIdx - 1] : null;
  const nextSet = currentIdx < sets.length - 1 ? sets[currentIdx + 1] : null;

  const playStartRef = useRef<number | null>(null);
  const nowPlayingRef = useRef<MusicSet | null>(nowPlaying);
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);

  // useCallback required — React Compiler cannot memoize functions that mutate refs
  const sendPlay = useCallback((track: MusicSet | null) => {
    if (!track || !playStartRef.current) return;
    const seconds = Math.floor((Date.now() - playStartRef.current) / 1000);
    playStartRef.current = null;
    if (seconds < 3) return;
    navigator.sendBeacon(
      "/api/track",
      new Blob(
        [
          JSON.stringify({
            setId: track.id,
            setTitle: track.title,
            setArtist: track.artist,
            listenedSeconds: seconds,
          }),
        ],
        { type: "application/json" },
      ),
    );
  }, []);

  useEffect(() => {
    if (!nowPlaying?.peaks) {
      setPeaks([]);
      return;
    }
    fetch(nowPlaying.peaks)
      .then((r) => r.json())
      .then((d) => setPeaks((d as { peaks: number[] }).peaks))
      .catch(() => setPeaks([]));
  }, [nowPlaying?.peaks]);

  useEffect(() => {
    if (!nowPlaying) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;
      if ((e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      const audio = audioRef.current;
      if (!audio) return;
      if (useStore.getState().isPlaying) audio.pause();
      else audio.play().catch(() => {});
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nowPlaying]);

  useEffect(() => {
    const handleUnload = () => {
      sendPlay(nowPlayingRef.current);
      const audio = audioRef.current;
      const track = nowPlayingRef.current;
      if (audio && track && !audio.paused && audio.currentTime > 0) {
        useStore.getState().setLastPosition(track.id, Math.floor(audio.currentTime));
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [sendPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;

    let cancelled = false;

    const savedPos = useStore.getState().positions[nowPlaying.id] ?? 0;

    setLoading(true);
    setError(false);
    setIsPlaying(false);
    setCurrentTime(savedPos > 0 ? savedPos : 0);
    setDuration(0);

    audio.src = nowPlaying.src;
    audio.load();

    const playWhenReady = () => {
      if (cancelled) return;
      if (savedPos > 0) {
        audio.currentTime = savedPos;
        setCurrentTime(savedPos);
        setLoading(false);
        return;
      }
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      playWhenReady();
    } else {
      audio.addEventListener("canplay", playWhenReady, { once: true });
    }

    return () => {
      cancelled = true;
      audio.removeEventListener("canplay", playWhenReady);
      sendPlay(nowPlaying);
    };
  }, [nowPlaying, sendPlay, setIsPlaying]);

  // Bridge: lets external components drive playback via the store's isPlaying flag
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isPlaying && !audio.paused) audio.pause();
    else if (isPlaying && audio.paused) audio.play().catch(() => {});
  }, [isPlaying]);

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
      setIsPlaying(true);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      const idx = sets.findIndex((s) => s.id === useStore.getState().nowPlaying?.id);
      if (idx > 0) useStore.getState().loadTrack(sets[idx - 1]);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const idx = sets.findIndex((s) => s.id === useStore.getState().nowPlaying?.id);
      if (idx < sets.length - 1) useStore.getState().loadTrack(sets[idx + 1]);
    });
  }, [nowPlaying, setIsPlaying]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || loading) return;
    if (useStore.getState().isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const skipBtnClass =
    "shrink-0 w-5 text-grey hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer text-sm transition-colors";

  const prevBtn = (
    <button
      type="button"
      onClick={() => prevSet && loadTrack(prevSet)}
      disabled={!prevSet || loading}
      aria-label="Previous track"
      className={skipBtnClass}
    >
      ⏮
    </button>
  );

  const playBtn = (
    <button
      type="button"
      onClick={togglePlay}
      disabled={loading || error}
      aria-label={isPlaying ? "Pause" : "Play"}
      className="shrink-0 w-5 text-gold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-sm"
    >
      {loading ? <span className="animate-pulse opacity-60">…</span> : isPlaying ? "⏸" : "▶"}
    </button>
  );

  const nextBtn = (
    <button
      type="button"
      onClick={() => nextSet && loadTrack(nextSet)}
      disabled={!nextSet || loading}
      aria-label="Next track"
      className={skipBtnClass}
    >
      ⏭
    </button>
  );

  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: music-only content, no spoken dialogue */}
      <audio
        ref={audioRef}
        onPlay={() => {
          playStartRef.current ??= Date.now();
          setIsPlaying(true);
          setLoading(false);
        }}
        onPause={() => {
          sendPlay(nowPlaying);
          setIsPlaying(false);
          if (nowPlaying)
            setLastPosition(nowPlaying.id, Math.floor(audioRef.current?.currentTime ?? 0));
        }}
        onLoadStart={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
          setIsPlaying(false);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          setDuration(e.currentTarget.duration || 0);
        }}
        onEnded={() => {
          sendPlay(nowPlaying);
          setIsPlaying(false);
          setCurrentTime(0);
          if (nowPlaying) setLastPosition(nowPlaying.id, 0);
          if (nextSet) loadTrack(nextSet);
        }}
      />

      {/* Mobile player — always in DOM, animates from height 0 when a track loads */}
      <div
        className={`sm:hidden fixed bottom-0 inset-x-0 z-30 bg-black grid ${nowPlaying ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        style={{ transition: "grid-template-rows 300ms ease-in-out" }}
      >
        <div className="overflow-hidden">
          <div className="h-12 border-t border-white/10 px-4 flex items-center gap-2 font-mono">
            {prevBtn}
            {playBtn}
            {nextBtn}
            <span className="text-xs text-grey tabular-nums shrink-0 w-8 text-right">
              {fmt(currentTime)}
            </span>
            {peaks.length > 0 ? (
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
            )}
            <span className="text-xs text-grey tabular-nums shrink-0 w-8">{fmt(duration)}</span>
          </div>
        </div>
      </div>

      {/* Desktop player */}
      {nowPlaying && (
        <div className="hidden sm:block fixed bottom-0 inset-x-0 z-30 bg-black border-t border-white/10 px-4 py-3 font-mono">
          <div className="flex items-center gap-4 max-w-2xl mx-auto w-full">
            {prevBtn}
            {playBtn}
            {nextBtn}

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

              {peaks.length > 0 ? (
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
              )}

              <span className="text-xs text-grey tabular-nums shrink-0 w-8">{fmt(duration)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
