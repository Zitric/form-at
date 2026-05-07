import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject, SyntheticEvent } from "react";
import { type MusicSet, sets } from "~/data/sets";
import { useStore } from "~/store";

export type AudioProps = {
  onPlay: () => void;
  onPause: () => void;
  onLoadStart: () => void;
  onCanPlay: () => void;
  onError: () => void;
  onTimeUpdate: (e: SyntheticEvent<HTMLAudioElement>) => void;
  onEnded: () => void;
};

export type AudioPlayerResult = {
  loading: boolean;
  error: boolean;
  currentTime: number;
  duration: number;
  peaks: number[];
  togglePlay: () => void;
  seek: (time: number) => void;
  audioProps: AudioProps;
};

export function useAudioPlayer(audioRef: RefObject<HTMLAudioElement | null>): AudioPlayerResult {
  const nowPlaying = useStore((s) => s.nowPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const setLastPosition = useStore((s) => s.setLastPosition);
  const loadTrack = useStore((s) => s.loadTrack);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);

  const playStartRef = useRef<number | null>(null);
  const nowPlayingRef = useRef<MusicSet | null>(nowPlaying);
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
  }, [nowPlaying]);

  // Sync saved position after client hydration — useState(0) avoids SSR mismatch
  useEffect(() => {
    const { nowPlaying: np, positions } = useStore.getState();
    if (np) {
      const saved = positions[np.id] ?? 0;
      if (saved > 0) setCurrentTime(saved);
    }
  }, []);

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
  }, [nowPlaying, sendPlay, setIsPlaying, audioRef]);

  // Bridge: lets external components drive playback via the store's isPlaying flag
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isPlaying && !audio.paused) audio.pause();
    else if (isPlaying && audio.paused) audio.play().catch(() => {});
  }, [isPlaying, audioRef]);

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
      const i = sets.findIndex((s) => s.id === useStore.getState().nowPlaying?.id);
      if (i > 0) useStore.getState().loadTrack(sets[i - 1]);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const i = sets.findIndex((s) => s.id === useStore.getState().nowPlaying?.id);
      if (i < sets.length - 1) useStore.getState().loadTrack(sets[i + 1]);
    });
  }, [nowPlaying, setIsPlaying, audioRef]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || loading) return;
    if (useStore.getState().isPlaying) audio.pause();
    else audio.play().catch(() => {});
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const audioProps: AudioProps = {
    onPlay: () => {
      playStartRef.current ??= Date.now();
      setIsPlaying(true);
      setLoading(false);
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
      setError(true);
      setIsPlaying(false);
    },
    onTimeUpdate: (e: SyntheticEvent<HTMLAudioElement>) => {
      setCurrentTime(e.currentTarget.currentTime);
      setDuration(e.currentTarget.duration || 0);
    },
    onEnded: () => {
      sendPlay(nowPlaying);
      setIsPlaying(false);
      setCurrentTime(0);
      if (nowPlaying) setLastPosition(nowPlaying.id, 0);
      const i = sets.findIndex((s) => s.id === nowPlaying?.id);
      const nextSet = i < sets.length - 1 ? sets[i + 1] : null;
      if (nextSet) loadTrack(nextSet);
    },
  };

  return { loading, error, currentTime, duration, peaks, togglePlay, seek, audioProps };
}
