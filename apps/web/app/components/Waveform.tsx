import { useEffect, useRef } from "react";

interface WaveformProps {
  peaks: number[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

const BAR_W = 2;
const BAR_GAP = 1;

function draw(canvas: HTMLCanvasElement, peaks: number[], currentTime: number, duration: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (!w || !h) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const progressX = duration > 0 ? (currentTime / duration) * w : 0;
  const step = BAR_W + BAR_GAP;
  const count = Math.floor(w / step);

  for (let i = 0; i < count; i++) {
    const peak = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
    const barH = Math.max(2, peak * h * 0.9);
    const x = i * step;
    ctx.fillStyle = x < progressX ? "#c8921a" : "rgba(255,255,255,0.2)";
    ctx.fillRect(x, (h - barH) / 2, BAR_W, barH);
  }
}

export function Waveform({ peaks, currentTime, duration, onSeek, disabled }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => draw(canvas, peaks, currentTime, duration);
    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks, currentTime, duration]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{ width: "100%", height: "40px" }}
      className={disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"}
      aria-label="Seek"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      tabIndex={0}
    />
  );
}
