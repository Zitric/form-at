import { useEffect, useRef } from "react";
import { colors } from "~/styles/tokens";

interface WaveformProps {
  peaks: number[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

const BAR_W = 2;
const BAR_GAP = 1;

function drawBars(canvas: HTMLCanvasElement, peaks: number[], color: string) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (!w || !h) return;

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

  // Redraw bars only when peaks change or the container resizes
  useEffect(() => {
    const bg = bgRef.current;
    const fg = fgRef.current;
    const container = containerRef.current;
    if (!bg || !fg || !container) return;

    const redraw = () => {
      drawBars(bg, peaks, colors.purple);
      drawBars(fg, peaks, colors.gold);
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

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * duration);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || !duration) return;
    if (e.key === "ArrowRight") onSeek(Math.min(currentTime + 5, duration));
    if (e.key === "ArrowLeft") onSeek(Math.max(currentTime - 5, 0));
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ position: "relative", flex: 1, height: "40px" }}
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

      {/* Gold bars — same canvas content, clipped to played width via CSS */}
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
  );
}
