import { colors } from "@form-at/ui/tokens";
import { useDrag } from "@use-gesture/react";
import { useEffect, useRef, useState } from "react";
import { useScrubControl } from "~/hooks/useScrubControl";
import { fmtTimestamp } from "~/utils/fmt";

interface WaveformProps {
  peaks: number[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

const BAR_W = 3;
const BAR_GAP = 1;

function drawBars(canvas: HTMLCanvasElement, w: number, h: number, peaks: number[], color: string) {
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const step = BAR_W + BAR_GAP;
  const count = Math.floor(w / step);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const peak = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
    const barH = Math.max(2, peak * h * 0.9);
    ctx.fillRect(i * step, (h - barH) / 2, BAR_W, barH);
  }
}

export function Waveform({ peaks, currentTime, duration, onSeek, disabled }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);

  // Pause-during-scrub + accepted-on-first-event live in the shared
  // useScrubControl hook so MobileProgressBar and this waveform stay in
  // semantic lockstep (4px threshold, disabled snapshot, etc.).
  const scrub = useScrubControl(disabled ?? false, duration);
  // Floating timestamp tooltip that follows the finger during scrub. Null when
  // hidden — pointer-events stay off so the tooltip never intercepts the drag
  // beneath it.
  const [tooltip, setTooltip] = useState<{ x: number; time: number } | null>(null);
  // Local scrub-target time, owns the indicator position during and just after
  // a drag. Bypasses the slow audio-element round-trip (audio.currentTime → seeked
  // event → PlayerSeeker re-render → currentTime prop) that was making the gold
  // fill visibly lag the tooltip on rapid drags. `null` means "indicator follows
  // `currentTime` from props" (normal playback).
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  // After release we keep `scrubTime` set until the audio element catches up to
  // the requested position, so the indicator doesn't snap backwards to the old
  // playhead while the new buffer range is fetching. `true` between release and
  // catch-up; reset on new gesture start.
  const [waitingForCatchup, setWaitingForCatchup] = useState(false);
  const effectiveTime = scrubTime ?? currentTime;

  // Redraw bars only when peaks change or the container resizes
  useEffect(() => {
    const bg = bgRef.current;
    const fg = fgRef.current;
    const container = containerRef.current;
    if (!bg || !fg || !container) return;

    const redraw = () => {
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      drawBars(bg, w, h, peaks, colors.purple);
      drawBars(fg, w, h, peaks, colors.gold);
    };

    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [peaks]);

  // Progress: one DOM style write — no canvas work at all. Reads `effectiveTime`
  // so during a scrub the indicator tracks the finger via local state, and
  // during playback (scrubTime null) it follows the audio's currentTime.
  useEffect(() => {
    if (!clipRef.current) return;
    clipRef.current.style.width = duration > 0 ? `${(effectiveTime / duration) * 100}%` : "0%";
  }, [effectiveTime, duration]);

  // Once audio catches up to the requested seek target (within 1s — enough
  // tolerance for buffered-boundary settling without making the user wait for
  // exact equality), hand the indicator back to the playback feed. Skipped
  // while a new gesture is mid-flight so a follow-up drag doesn't race the
  // catch-up clear.
  useEffect(() => {
    if (!waitingForCatchup || scrubTime === null) return;
    if (Math.abs(currentTime - scrubTime) < 1) {
      setScrubTime(null);
      setWaitingForCatchup(false);
    }
  }, [currentTime, scrubTime, waitingForCatchup]);

  // Tap-or-drag handler. We deliberately do *not* call onSeek on every move:
  // streaming audio queues a buffer fetch per `audio.currentTime` write, and
  // those queue up behind the user on rapid drags — the indicator visibly
  // lags. Instead `scrubTime` (local state) owns the indicator during the
  // gesture and we commit a single onSeek on release. The audio was paused
  // by useScrubControl above the 4px threshold, so the user wasn't hearing
  // the interim positions anyway. Tap (sub-threshold) still seeks on
  // release — that's the same `last` branch.
  const bind = useDrag(({ active, first, xy: [x], movement: [mx], event, last }) => {
    event.stopPropagation();
    const el = containerRef.current;
    if (!el) return;

    if (first) {
      scrub.acceptIfReady();
      setWaitingForCatchup(false); // new gesture, abandon any pending catch-up
    }
    if (!scrub.isAccepted()) return;

    if (active) scrub.maybePauseOnMove(mx);

    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const targetTime = pct * duration;
    setScrubTime(targetTime);

    if (last) {
      onSeek(targetTime);
      setWaitingForCatchup(true);
      scrub.endScrub();
      setTooltip(null);
    } else if (active && Math.abs(mx) > 4) {
      setTooltip({ x: x - rect.left, time: targetTime });
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || !duration) return;
    if (e.key === "ArrowRight") onSeek(Math.min(currentTime + 5, duration));
    if (e.key === "ArrowLeft") onSeek(Math.max(currentTime - 5, 0));
  };

  return (
    <div
      ref={containerRef}
      {...bind()}
      onKeyDown={handleKeyDown}
      style={{ position: "relative", flex: 1, height: "56px", touchAction: "none" }}
      className={disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"}
      aria-label="Seek"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      tabIndex={0}
    >
      {/* Purple bars — drawn once on peaks/resize */}
      <canvas ref={bgRef} style={{ position: "absolute", inset: 0 }} />

      {/* Gold bars — same canvas content, clipped to played width via CSS.
          The drop-shadow lives on this OUTER wrapper (static `inset: 0`
          dimensions), NOT on the inner clip div whose width animates.
          Putting `filter` on a width-animated element triggers a browser
          compositing bug: the filter creates a paint layer keyed to the
          filtered element's geometry, and on some loads the browser
          doesn't re-rasterize the layer when its width changes — so the
          visible gold stays frozen at whatever it was at the first paint
          (typically 0%, since clip starts at "0%" in JSX before the
          effect runs). Toggling the filter in DevTools forces a one-shot
          repaint that masks the bug after first load. With the filter on
          a static-dimensions wrapper, the layer geometry never changes;
          only its descendant content does, which the compositor handles
          via standard child-paint invalidation. `pointerEvents: none` so
          the wrapper doesn't intercept the drag gestures bound to the
          outer container. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          filter: "drop-shadow(0 0 4px rgba(197, 133, 56, 0.35))",
        }}
      >
        <div
          ref={clipRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            overflow: "hidden",
            width: "0%",
          }}
        >
          <canvas ref={fgRef} style={{ position: "absolute", top: 0, left: 0 }} />
        </div>
      </div>

      {/* Scrub timestamp tooltip — floats 8px above the finger position. Only
          visible during an active drag (not on tap). `pointerEvents: none` so
          the tooltip never intercepts the drag underneath. */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            bottom: "calc(100% + 8px)",
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
          className="px-2 py-1 text-xs font-mono text-gold tabular-nums bg-black border border-grey/30 rounded-card whitespace-nowrap"
        >
          {fmtTimestamp(tooltip.time)}
        </div>
      )}
    </div>
  );
}
