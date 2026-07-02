import { memo, useEffect, useState } from "react";
import { Waveform } from "~/components/player/Waveform";
import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";
import { withAppContext } from "~/utils/audioUrl";
import { fmtTimestamp } from "~/utils/fmt";

// Owns currentTime / duration / peaks state and subscribes to <audio> events
// directly. Isolated here so the 4×/sec timeupdate re-renders never reach the
// rest of the player surfaces — only this seeker re-renders four times a
// second, the mini-player and desktop chrome stay still.
export const PlayerSeeker = memo(function PlayerSeeker({
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

  // Tracks the lifecycle of the peaks fetch so we can distinguish "haven't
  // got peaks yet" (pending — render a transparent 56px spacer) from "peaks
  // genuinely won't load" (failed — fall back to the native `<input>` so the
  // user can still seek). Without this, the fetch-in-flight window briefly
  // renders the fallback slider, producing the first-play widget swap +
  // height jump (TECH_DEBT 9). The `peaks.length > 0` render branch is the
  // authoritative "ready" signal — `"ready"` here is set for completeness
  // but never consulted, since cached peaks always win the render branch.
  const [peaksFetchState, setPeaksFetchState] = useState<"pending" | "ready" | "failed">("pending");

  // Reset audio-derived values on track change. Cached duration/peaks/position
  // fill the gap until the new track's metadata and peaks fetch resolve.
  // biome-ignore lint/correctness/useExhaustiveDependencies: nowPlaying?.id is the trigger; the body uses store setters
  useEffect(() => {
    setAudioDuration(0);
    setAudioCurrentTime(null);
    setPeaksFetchState("pending");
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
    // Wrap with the standalone-context marker so the SW serves peaks from
    // IDB in the app and pure-streams them in a tab. Same rule as audio.src.
    fetch(withAppContext(peaksUrl))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setCachedPeaks(trackId, (d as { peaks: number[] }).peaks);
        setPeaksFetchState("ready");
      })
      .catch((err) => {
        setPeaksFetchState("failed");
        if (process.env.NODE_ENV === "development") {
          console.warn(`[player] peaks fetch failed for ${trackId} (${peaksUrl}):`, err);
        }
      });
  }, [nowPlaying?.peaks, nowPlaying?.id, cachedPeaks, setCachedPeaks]);

  // Three-state render so we never swap widgets mid-play:
  //   - peaks cached / loaded → Waveform (the normal case after first play)
  //   - no peaks URL OR fetch failed → native <input> fallback so the user
  //     can still seek (intended use: peaks genuinely won't load)
  //   - otherwise (fetch in flight) → invisible 56px-tall spacer that
  //     reserves the same layout the Waveform will take
  // Fixes TECH_DEBT 9: the previous two-branch render flashed the native
  // slider during the fetch RTT (~50-300ms on first play), then jumped
  // ~30px in height when the canvas mounted. The spacer kills both.
  const showFallback = !nowPlaying?.peaks || peaksFetchState === "failed";
  const seeker =
    peaks.length > 0 ? (
      <Waveform
        peaks={peaks}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        disabled={disabled}
      />
    ) : showFallback ? (
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
    ) : (
      <div className="flex-1" style={{ height: "56px" }} aria-hidden="true" />
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
