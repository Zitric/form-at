import { useDrag } from "@use-gesture/react";
import { memo, useEffect, useRef, useState } from "react";
import type { MusicSet } from "~/data/sets";
import { useScrubControl } from "~/hooks/useScrubControl";
import { useStore } from "~/store";

// Gold played / purple remaining progress bar at the bottom of the mobile
// mini-player. The outer 16px row is the tap/drag target — necessary because
// the visible bar itself is only 4px (7px while actively dragging) and would
// otherwise be impossible to touch on a thumb. Tapping anywhere in the row
// seeks to that position; dragging horizontally scrubs continuously.
//
// `stopPropagation` everywhere because the mini-player row above has its own
// onClick that opens the full-screen overlay — without it, every seek would
// also open the overlay.
export const MobileProgressBar = memo(function MobileProgressBar({
  audioRef,
  nowPlaying,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  nowPlaying: MusicSet | null;
}) {
  const cachedDuration = useStore((s) => (nowPlaying ? s.durations[nowPlaying.id] : undefined));
  const savedPosition = useStore((s) => (nowPlaying ? s.positions[nowPlaying.id] : undefined));
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const tapRef = useRef<HTMLDivElement>(null);

  const duration = audioDuration > 0 ? audioDuration : (cachedDuration ?? 0);
  const currentTime = audioCurrentTime !== null ? audioCurrentTime : (savedPosition ?? 0);

  // Pause-during-scrub + accepted-on-first-event live in the shared
  // useScrubControl hook so this strip and <Waveform> stay in semantic
  // lockstep. The mini-bar has no `disabled` prop — we hard-code false here
  // because the bar only renders when a track is loaded.
  const scrub = useScrubControl(false, duration);

  // biome-ignore lint/correctness/useExhaustiveDependencies: nowPlaying?.id is the trigger; setters are stable
  useEffect(() => {
    setAudioDuration(0);
    setAudioCurrentTime(null);
  }, [nowPlaying?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setAudioCurrentTime(audio.currentTime);
    const onDuration = () => {
      setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("seeked", onTime);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("seeked", onTime);
    };
  }, [audioRef]);

  // Single handler covers tap + drag — useDrag treats a tap as a zero-distance
  // drag, so we don't need separate code paths. `event.stopPropagation` keeps
  // the gesture from bubbling into the mini-player row's open-full-player tap.
  // Pause-during-scrub + the disabled snapshot live in useScrubControl.
  const bind = useDrag(({ active, first, xy: [x], movement: [mx], event, last }) => {
    event.stopPropagation();
    const el = tapRef.current;
    const audio = audioRef.current;
    if (!el || !audio) return;

    if (first) scrub.acceptIfReady();
    if (!scrub.isAccepted()) return;

    if (active) scrub.maybePauseOnMove(mx);

    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    audio.currentTime = pct * duration;

    if (last) scrub.endScrub();

    setIsActive(active);
  });

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={tapRef}
      {...bind()}
      onClick={(e) => e.stopPropagation()}
      className="h-4 flex items-end touch-none cursor-pointer"
    >
      {/* Purple = remaining, gold = played. Width transitions follow the
          4×/sec timeupdate; height transitions on touch-start for the
          Instagram-style expand. Bar anchored to the bottom edge of the row
          so the expand grows upward toward the finger. */}
      <div
        className={`w-full bg-purple transition-[height] duration-150 ${
          isActive ? "h-[7px]" : "h-[4px]"
        }`}
      >
        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
});
