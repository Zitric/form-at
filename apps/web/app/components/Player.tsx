import { useEffect, useRef, useState } from "react";
import { usePlayer } from "~/contexts/player-context";
import type { Set as MusicSet } from "~/data/sets";

export function Player() {
  const { nowPlaying } = usePlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playStartRef = useRef<number | null>(null);
  const nowPlayingRef = useRef<MusicSet | null>(nowPlaying);
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);

  function sendPlay(track: MusicSet | null) {
    if (!track || !playStartRef.current) return;
    const seconds = Math.floor((Date.now() - playStartRef.current) / 1000);
    playStartRef.current = null;
    if (seconds < 3) return;
    navigator.sendBeacon(
      "/api/track",
      new Blob(
        [JSON.stringify({ setId: track.id, setTitle: track.title, setArtist: track.artist, listenedSeconds: seconds })],
        { type: "application/json" },
      ),
    );
  }

  // Flush on tab close
  useEffect(() => {
    function handleUnload() {
      sendPlay(nowPlayingRef.current);
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;

    let cancelled = false;

    setLoading(true);
    setError(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    audio.src = nowPlaying.src;
    audio.load();

    const playWhenReady = () => {
      if (cancelled) return;
      audio
        .play()
        .then(() => {
          setPlaying(true);
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
      sendPlay(nowPlaying); // flush when switching tracks
    };
  }, [nowPlaying]);

  // Media Session API — keeps playback alive on a locked phone
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
    if (!audio || loading) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
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
      {/* biome-ignore lint/a11y/useMediaCaption: music-only content, no spoken dialogue */}
      <audio
        ref={audioRef}
        onPlay={() => {
          playStartRef.current ??= Date.now();
          setPlaying(true);
          setLoading(false);
        }}
        onPause={() => {
          sendPlay(nowPlaying);
          setPlaying(false);
        }}
        onLoadStart={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
          setPlaying(false);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          setDuration(e.currentTarget.duration || 0);
        }}
        onEnded={() => {
          sendPlay(nowPlaying);
          setPlaying(false);
          setCurrentTime(0);
        }}
      />

      <div className="fixed bottom-0 inset-x-0 bg-navy border-t border-white/10 px-4 py-3 font-mono">
        <div className="flex items-center gap-4 max-w-2xl mx-auto w-full">

          {/* Play / pause */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={loading || error}
            aria-label={playing ? "Pause" : "Play"}
            className="shrink-0 w-5 text-gold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-sm"
          >
            {loading ? <span className="animate-pulse opacity-60">…</span> : playing ? "⏸" : "▶"}
          </button>

          {/* Track info */}
          <div className="shrink-0 hidden sm:block w-52 min-w-0">
            <div className="text-[10px] text-white/25 mb-0.5">
              › signal:{" "}
              {error ? (
                <span className="text-red-400">[ error ]</span>
              ) : playing ? (
                <span className="text-gold">[ live ]</span>
              ) : (
                <span>[ standby ]</span>
              )}
            </div>
            <div className="text-xs font-bold truncate leading-tight">{nowPlaying.title}</div>
            <div className="text-[10px] text-white/40 truncate">{nowPlaying.artist}</div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-[10px] text-white/30 tabular-nums shrink-0 w-8 text-right">
              {fmt(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={seek}
              disabled={loading || error}
              className="flex-1 accent-gold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Seek"
            />
            <span className="text-[10px] text-white/30 tabular-nums shrink-0 w-8">
              {fmt(duration)}
            </span>
          </div>

        </div>
      </div>
    </>
  );
}
