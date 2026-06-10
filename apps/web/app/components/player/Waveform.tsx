import { useDrag } from "@use-gesture/react";
import { useEffect, useRef, useState } from "react";
import { useScrubControl } from "~/hooks/useScrubControl";
import { colors } from "~/styles/tokens";
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

  // Progress: one DOM style write — no canvas work at all
  useEffect(() => {
    if (!clipRef.current) return;
    clipRef.current.style.width = duration > 0 ? `${(currentTime / duration) * 100}%` : "0%";
  }, [currentTime, duration]);

  // Tap-or-drag handler. Single code path: tap is a zero-distance drag,
  // movement-based drag updates onSeek on every frame for live follow-finger
  // scrub. The 4px threshold separates "tap to seek" from "drag to scrub" so
  // we never pause for a tap.
  const bind = useDrag(({ active, first, xy: [x], movement: [mx], event, last }) => {
    event.stopPropagation();
    const el = containerRef.current;
    if (!el) return;

    if (first) scrub.acceptIfReady();
    if (!scrub.isAccepted()) return;

    if (active) scrub.maybePauseOnMove(mx);

    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const targetTime = pct * duration;
    onSeek(targetTime);

    if (last) {
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
          drop-shadow on the clipped layer puts a soft gold glow only on the
          played portion, so the played/remaining split reads at a glance and
          the waveform feels like the focal element instead of decoration. */}
      <div
        ref={clipRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          overflow: "hidden",
          width: "0%",
          filter: "drop-shadow(0 0 4px rgba(197, 133, 56, 0.35))",
        }}
      >
        <canvas ref={fgRef} style={{ position: "absolute", top: 0, left: 0 }} />
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
