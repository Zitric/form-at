import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { type MusicSet, sets } from "~/data/sets";
import { useStore } from "~/store";

type AudioProps = {
  onPlay: () => void;
  onPause: () => void;
  onLoadStart: () => void;
  onCanPlay: () => void;
  onError: () => void;
  onEnded: () => void;
};

export type AudioPlayerResult = {
  loading: boolean;
  hasError: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
  audioProps: AudioProps;
};

export function useAudioPlayer(audioRef: RefObject<HTMLAudioElement | null>): AudioPlayerResult {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const setLastPosition = useStore((s) => s.setLastPosition);
  const playTrack = useStore((s) => s.playTrack);
  // hasError lives in the store so PlaybackErrorToast (which doesn't share this
  // hook) can read it. Every failure path here MUST set it, otherwise users see
  // a silent stall instead of the retry toast.
  const hasError = useStore((s) => s.hasError);
  const setHasError = useStore((s) => s.setHasError);

  const [loading, setLoading] = useState(false);

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
      "/api/signal",
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
  }, [nowPlaying, audioRef]);

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
  }, [sendPlay, audioRef]);

  // True until a track has been mounted via this effect once. The very first
  // mount is the persist-rehydration restore — silent, paused, with a saved
  // position. We skip the loading flash for that case so the player doesn't
  // flicker through a "..." state on every reload.
  const isInitialRestore = useRef(true);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !nowPlaying) return;

    // Two cases handle src/play:
    //   1) User clicked → playTrack action already set src + called play() synchronously
    //      (preserves mobile user-gesture token). Detect via src match and skip.
    //   2) Persisted nowPlaying restored on reload → no user gesture, can't auto-play.
    //      Just set src and seek to saved position; user has to click to start.
    const trackUrl = new URL(nowPlaying.src, window.location.href).href;
    if (audio.src === trackUrl || audio.currentSrc === trackUrl) {
      // Click path already handled it
      return;
    }

    let cancelled = false;
    const savedPos = useStore.getState().positions[nowPlaying.id] ?? 0;
    const isRestore = isInitialRestore.current;
    isInitialRestore.current = false;

    setHasError(false);

    audio.src = nowPlaying.src;
    audio.load();

    const seekWhenReady = () => {
      if (cancelled) return;
      if (savedPos > 0) audio.currentTime = savedPos;
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      seekWhenReady();
    } else {
      audio.addEventListener("canplay", seekWhenReady, { once: true });
    }

    // Non-restore path (e.g. programmatic loadTrack without user gesture): try to play
    // and accept that mobile may reject. Reset isPlaying on rejection.
    if (!isRestore) {
      audio.play().catch(() => {
        setIsPlaying(false);
        setHasError(true);
      });
    }

    return () => {
      cancelled = true;
      audio.removeEventListener("canplay", seekWhenReady);
      sendPlay(nowPlaying);
    };
  }, [nowPlaying, sendPlay, setIsPlaying, setHasError, audioRef]);

  // Bridge: lets external components drive playback via the store's isPlaying flag.
  // If audio.play() rejects, reset the flag and surface the error so the retry
  // toast appears — otherwise the UI shows "playing" while the audio is paused.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isPlaying && !audio.paused) audio.pause();
    else if (isPlaying && audio.paused)
      audio.play().catch(() => {
        setIsPlaying(false);
        setHasError(true);
      });
  }, [isPlaying, audioRef, setIsPlaying, setHasError]);

  useEffect(() => {
    if (!nowPlaying || !("mediaSession" in navigator)) return;

    // Build multiple artwork sizes so Android / iOS pick the best one for the
    // lock-screen player. `nowPlaying.artwork` is a base path like "sets/002";
    // the optimize-images script emits 640/1080/1920 variants in WebP and AVIF.
    // We use WebP because Media Session image decoders don't always support AVIF.
    // Fallback uses the square PWA icons — lock-screen players expect square
    // artwork and would distort the 1200×630 og-image otherwise.
    const origin = window.location.origin;
    const artworkBase = nowPlaying.artwork ? `${origin}/images/${nowPlaying.artwork}` : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      artwork: artworkBase
        ? [
            { src: `${artworkBase}-640.webp`, sizes: "640x640", type: "image/webp" },
            { src: `${artworkBase}-1080.webp`, sizes: "1080x1080", type: "image/webp" },
          ]
        : [
            { src: `${origin}/icon-192.png`, sizes: "192x192", type: "image/png" },
            { src: `${origin}/icon-512.png`, sizes: "512x512", type: "image/png" },
          ],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined && audioRef.current) {
        audioRef.current.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      const i = sets.findIndex((s) => s.id === useStore.getState().nowPlaying?.id);
      const prev = sets[i - 1];
      if (i > 0 && prev) useStore.getState().playTrack(prev);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const i = sets.findIndex((s) => s.id === useStore.getState().nowPlaying?.id);
      const next = sets[i + 1];
      if (i < sets.length - 1 && next) useStore.getState().playTrack(next);
    });
  }, [nowPlaying, setIsPlaying, audioRef]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || loading) return;
    if (useStore.getState().isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setHasError(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setHasError(true);
        });
    }
  }, [loading, audioRef, setIsPlaying, setHasError]);

  // seek sets audio position only; PlayerSeeker picks up the change via the 'seeked' event
  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = time;
    },
    [audioRef],
  );

  const audioProps: AudioProps = {
    onPlay: () => {
      playStartRef.current ??= Date.now();
      setIsPlaying(true);
      setLoading(false);
      setHasError(false);
    },
    onPause: () => {
      sendPlay(nowPlaying);
      setIsPlaying(false);
      if (nowPlaying)
        setLastPosition(nowPlaying.id, Math.floor(audioRef.current?.currentTime ?? 0));
    },
    onLoadStart: () => setLoading(true),
    onCanPlay: () => setLoading(false),
    onError: () => {
      setLoading(false);
      setHasError(true);
      setIsPlaying(false);
    },
    onEnded: () => {
      sendPlay(nowPlaying);
      setIsPlaying(false);
      if (nowPlaying) setLastPosition(nowPlaying.id, 0);
      const i = sets.findIndex((s) => s.id === nowPlaying?.id);
      const nextSet = i < sets.length - 1 ? sets[i + 1] : null;
      if (nextSet) playTrack(nextSet);
    },
  };

  return { loading, hasError, togglePlay, seek, audioProps };
}
