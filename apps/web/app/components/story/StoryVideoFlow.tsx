import type { MusicSet } from "@form-at/data/sets";
import { Button, Modal, TerminalRow } from "@form-at/ui";
import { colors } from "@form-at/ui/tokens";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useStore } from "~/store";
import { getAudioCurrentTime } from "~/store/playerSlice";
import { withAppContext } from "~/utils/audioUrl";
import { fmtTimestamp, parseDuration } from "~/utils/fmt";
import {
  NUDGE_SECONDS,
  type Span,
  ZOOM_PEAKS_PER_SECOND,
  ZOOM_VISIBLE_SECONDS,
  initialStart,
  nudge,
  sliceCovers,
  sliceFor,
  slicePeaks,
  startFromDrag,
  startFromStripTap,
  visibleSpan,
} from "~/utils/storyVideo/excerptWindow";
import { EXCERPT_SECONDS } from "~/utils/storyVideo/layout";
import { Mp3ExcerptError, fetchExcerpt } from "~/utils/storyVideo/mp3Excerpt";

// The Instagram Story excerpt picker. A fixed 20s window sits in the middle
// of a zoomed strip and the waveform slides under it; a full-set strip above
// jumps anywhere; ±5s nudges fine-tune. Preview plays the decoded audio
// through Web Audio, never the player's <audio>, which is paused meanwhile
// and resumed after.
//
// Lazy-loaded by StoryFlowHost; the default export is what lazy() needs.

type Slice = {
  span: Span;
  audio: AudioBuffer;
  offsetSeconds: number;
  peaks: Float32Array;
  max: number;
};

// Waits this long after the last drag frame before fetching a new slice, so a
// fast drag fetches once, where it stops, not at every step.
const SLICE_DEBOUNCE_MS = 250;
const FULL_STRIP_HEIGHT = 32;
const ZOOM_STRIP_HEIGHT = 72;
const sectionLabelClass = "text-xs text-grey/60 tracking-widest mb-2";

function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const g = canvas.getContext("2d");
  g?.scale(dpr, dpr);
  return g;
}

function drawFullStrip(
  canvas: HTMLCanvasElement,
  width: number,
  peaks: readonly number[],
  start: number,
  setSeconds: number,
) {
  const g = prepareCanvas(canvas, width, FULL_STRIP_HEIGHT);
  if (!g || !peaks.length || setSeconds <= 0) return;
  const step = 3;
  const count = Math.floor(width / step);
  const scale = 1 / Math.max(...peaks, 0.001);
  for (let i = 0; i < count; i++) {
    const from = (i / count) * setSeconds;
    const to = ((i + 1) / count) * setSeconds;
    // The bar(s) the window overlaps go gold: 20s of a 2h set is a fraction of
    // one bar, so this is the whole marker.
    const inWindow = to > start && from < start + EXCERPT_SECONDS;
    const peak = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
    const h = Math.max(2, Math.min(peak * scale, 1) * FULL_STRIP_HEIGHT * 0.9);
    g.fillStyle = inWindow ? colors.gold : colors.purple;
    g.fillRect(i * step, (FULL_STRIP_HEIGHT - h) / 2, inWindow ? 3 : 2, h);
  }
}

function drawZoomStrip(
  canvas: HTMLCanvasElement,
  width: number,
  slice: Slice | null,
  start: number,
  setSeconds: number,
) {
  const g = prepareCanvas(canvas, width, ZOOM_STRIP_HEIGHT);
  if (!g) return;
  const view = visibleSpan(start);
  const step = 4;
  const count = Math.floor(width / step);
  for (let i = 0; i < count; i++) {
    const t = view.start + ((i + 0.5) / count) * ZOOM_VISIBLE_SECONDS;
    if (t < 0 || t > setSeconds) continue; // beyond the set's ends: empty
    const decoded = slice && t >= slice.span.start && t < slice.span.end;
    let h = 2;
    if (decoded) {
      const peak = slice.peaks[Math.floor((t - slice.span.start) * ZOOM_PEAKS_PER_SECOND)] ?? 0;
      h = Math.max(2, Math.min(peak / slice.max, 1) * ZOOM_STRIP_HEIGHT * 0.9);
    }
    const inWindow = t >= start && t < start + EXCERPT_SECONDS;
    g.fillStyle = !decoded ? "rgba(203, 203, 203, 0.2)" : inWindow ? colors.gold : colors.purple;
    g.fillRect(i * step, (ZOOM_STRIP_HEIGHT - h) / 2, 3, h);
  }
}

type Props = { set: MusicSet; onClose: () => void };

export default function StoryVideoFlow({ set, onClose }: Props) {
  const isCurrent = useStore((s) => s.nowPlaying?.id === set.id);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const knownDuration = useStore((s) => s.durations[set.id]);
  const cachedPeaks = useStore((s) => s.peaksCache[set.id]);
  const setPeaks = useStore((s) => s.setPeaks);

  // The player's measured duration when it has one; otherwise the catalogue's.
  const setSeconds = knownDuration ?? parseDuration(set.duration ?? "") ?? 0;
  const [start, setStart] = useState(() =>
    initialStart(setSeconds, isCurrent ? getAudioCurrentTime() : null),
  );

  const [slice, setSlice] = useState<Slice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [retries, setRetries] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const needsSlice =
    setSeconds > 0 && !refused && (!slice || !sliceCovers(slice.span, start, setSeconds));

  // Decode the ~90s around the window; again, debounced, once a drag leaves it.
  // `retries` is a dependency so [ retry ] re-runs this.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retries only re-triggers the fetch
  useEffect(() => {
    if (!needsSlice) return;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        const span = sliceFor(start, setSeconds);
        try {
          contextRef.current ??= new AudioContext();
          const context = contextRef.current;
          // The bare URL: v1 is online-only, so this always streams. The
          // `withAppContext` marker would ask the SW for the saved copy, a
          // path not yet verified for Range requests from the page.
          const excerpt = await fetchExcerpt(set.src, span.start, span.end - span.start, (data) =>
            context.decodeAudioData(data),
          );
          if (cancelled) return;
          const peaks = slicePeaks(excerpt.audio, excerpt.offsetSeconds, span.end - span.start);
          setSlice({
            span,
            audio: excerpt.audio,
            offsetSeconds: excerpt.offsetSeconds,
            peaks,
            max: Math.max(0.001, ...peaks),
          });
          setLoadError(null);
        } catch (e) {
          if (cancelled) return;
          if (e instanceof Mp3ExcerptError && e.failure === "not-cbr") {
            setRefused(true);
            setLoadError(`can't clip this set — ${e.message}`);
          } else {
            setLoadError("couldn't load this part of the set — check your connection");
          }
        }
      },
      slice ? SLICE_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsSlice, start, setSeconds, set.src, slice, retries]);

  // The full-set strip reuses the player's peaks; fetch them if the player
  // never has, the same way PlayerSeeker does.
  useEffect(() => {
    if ((cachedPeaks && cachedPeaks.length > 0) || !set.peaks) return;
    fetch(withAppContext(set.peaks))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPeaks(set.id, (d as { peaks: number[] }).peaks))
      .catch(() => {
        // The strip stays empty; the zoomed strip and nudges still work.
      });
  }, [cachedPeaks, set.id, set.peaks, setPeaks]);

  // ── Preview: the decoded window, through Web Audio ──
  const preview = useRef<{
    source: AudioBufferSourceNode;
    startedAt: number;
    wasPlaying: boolean;
  } | null>(null);
  const [previewProgress, setPreviewProgress] = useState<number | null>(null);

  const stopPreview = useCallback(() => {
    const current = preview.current;
    if (!current) return;
    preview.current = null;
    current.source.onended = null;
    try {
      current.source.stop();
    } catch {
      // already ended
    }
    setPreviewProgress(null);
    // Resume the player only if the preview is what paused it.
    if (current.wasPlaying) setIsPlaying(true);
  }, [setIsPlaying]);

  const windowDecoded =
    slice !== null &&
    start >= slice.span.start &&
    Math.min(start + EXCERPT_SECONDS, setSeconds) <= slice.span.end;

  const startPreview = async () => {
    if (!slice || !windowDecoded) return;
    contextRef.current ??= new AudioContext();
    const context = contextRef.current;
    await context.resume();
    const source = context.createBufferSource();
    source.buffer = slice.audio;
    source.connect(context.destination);
    const wasPlaying = useStore.getState().isPlaying;
    if (wasPlaying) setIsPlaying(false);
    source.start(0, slice.offsetSeconds + (start - slice.span.start), EXCERPT_SECONDS);
    source.onended = stopPreview;
    preview.current = { source, startedAt: context.currentTime, wasPlaying };
    setPreviewProgress(0);
  };

  // Progress follows the audio clock while previewing.
  const previewing = previewProgress !== null;
  useEffect(() => {
    if (!previewing) return;
    let raf = 0;
    const tick = () => {
      const current = preview.current;
      const context = contextRef.current;
      if (current && context) {
        setPreviewProgress(
          Math.min(1, (context.currentTime - current.startedAt) / EXCERPT_SECONDS),
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewing]);

  // Leaving the picker stops the preview (resuming the player) and releases
  // the AudioContext.
  useEffect(
    () => () => {
      stopPreview();
      void contextRef.current?.close();
    },
    [stopPreview],
  );

  // ── Strips ──
  const stripsRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = stripsRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    if (fullRef.current)
      drawFullStrip(fullRef.current, width, cachedPeaks ?? [], start, setSeconds);
    if (zoomRef.current) drawZoomStrip(zoomRef.current, width, slice, start, setSeconds);
  }, [width, cachedPeaks, slice, start, setSeconds]);

  const moveTo = (next: number) => {
    stopPreview();
    setStart(next);
  };

  const grab = useRef<{ x: number; start: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    stopPreview();
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { x: e.clientX, start };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!grab.current) return;
    setStart(startFromDrag(grab.current.start, e.clientX - grab.current.x, width, setSeconds));
  };
  const onPointerEnd = () => {
    grab.current = null;
  };
  const onZoomKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    moveTo(nudge(start, delta, setSeconds));
  };

  const close = () => {
    stopPreview();
    onClose();
  };

  const windowLabel = `${fmtTimestamp(start)} → ${fmtTimestamp(start + EXCERPT_SECONDS)}`;
  const previewLabel = previewing ? "stop" : "preview";
  // needsSlice also covers a drag that has left the decoded slice: the strip
  // shows undecoded audio as a dotted line until the new slice arrives.
  const status = loadError
    ? loadError
    : needsSlice
      ? "loading this part of the set…"
      : "drag the waveform, tap the full set, or nudge";

  return (
    <Modal
      open
      onClose={close}
      ariaLabel="Pick 20 seconds for an Instagram story"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">instagram_story</span>
        </div>
      }
    >
      <TerminalRow label="set" value={`${set.artist} @ ${set.title}`} className="mb-5" />

      {setSeconds <= 0 ? (
        <p className="text-sm text-grey leading-relaxed">
          this set's length isn't known yet — play it for a moment, then try again.
        </p>
      ) : (
        <div ref={stripsRef} className="flex flex-col">
          <div className={sectionLabelClass}>full_set:</div>
          <button
            type="button"
            aria-label="Jump to a point in the set"
            className="block cursor-pointer"
            onClick={(e) => {
              // Keyboard activation has no pointer position; the nudges cover it.
              if (e.detail === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              moveTo(startFromStripTap((e.clientX - rect.left) / rect.width, setSeconds));
            }}
          >
            <canvas ref={fullRef} className="block" />
          </button>
          <div className="flex justify-between text-xs text-grey/60 tabular-nums mt-1">
            <span>0:00</span>
            <span>{fmtTimestamp(setSeconds)}</span>
          </div>

          <div className={`${sectionLabelClass} mt-5`}>excerpt:</div>
          <div
            role="slider"
            tabIndex={0}
            aria-label="20-second excerpt start"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, setSeconds - EXCERPT_SECONDS)}
            aria-valuenow={start}
            aria-valuetext={windowLabel}
            className="relative touch-none cursor-grab active:cursor-grabbing select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onZoomKey}
          >
            <canvas ref={zoomRef} className="block" />
            {/* The fixed window: the middle third of the strip. */}
            <div className="pointer-events-none absolute inset-y-0 left-1/3 w-1/3 border-x-2 border-gold/80" />
            {previewing && (
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white"
                style={{ left: `${(1 + (previewProgress ?? 0)) * (100 / 3)}%` }}
              />
            )}
          </div>
          <div className="text-center text-sm text-gold tabular-nums tracking-widest mt-2">
            {windowLabel}
          </div>

          <div className="flex items-center justify-between gap-2 mt-5">
            <Button
              variant="secondary"
              aria-label={`Back ${NUDGE_SECONDS} seconds`}
              onClick={() => moveTo(nudge(start, -NUDGE_SECONDS, setSeconds))}
            >
              −{NUDGE_SECONDS}s
            </Button>
            <Button
              variant="secondary"
              disabled={!windowDecoded}
              onClick={previewing ? stopPreview : startPreview}
            >
              {previewLabel}
            </Button>
            <Button
              variant="secondary"
              aria-label={`Forward ${NUDGE_SECONDS} seconds`}
              onClick={() => moveTo(nudge(start, NUDGE_SECONDS, setSeconds))}
            >
              +{NUDGE_SECONDS}s
            </Button>
          </div>

          <p className="text-xs text-grey/60 tracking-widest leading-relaxed mt-5">{status}</p>
          {loadError && !refused && (
            <Button
              variant="secondary"
              className="mt-2 self-start"
              onClick={() => setRetries((n) => n + 1)}
            >
              retry
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
