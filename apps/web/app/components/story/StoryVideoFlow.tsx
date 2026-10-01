import { getDJ } from "@form-at/data/djs";
import type { MusicSet } from "@form-at/data/sets";
import { Button, Modal, TerminalRow } from "@form-at/ui";
import { colors } from "@form-at/ui/tokens";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FailedScreen,
  FallbackScreen,
  RecordingScreen,
  ShareScreen,
} from "~/components/story/StoryCreateScreens";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";
import { cachedPeaksFor, getAudioCurrentTime, knownDurationFor } from "~/store/playerSlice";
import { withAppContext } from "~/utils/audioUrl";
import { isDevModeActive } from "~/utils/devMode";
import { fmtTimestamp, parseDuration } from "~/utils/fmt";
import {
  type CreateAction,
  type CreateState,
  storyFileName,
  transition,
} from "~/utils/storyVideo/createFlow";
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
import { type StoryAssets, loadStoryAssets } from "~/utils/storyVideo/renderer";

// The Instagram Story flow. First the excerpt picker: a fixed-length window sits
// in the middle of a zoomed strip and the waveform slides under it; a
// full-set strip above jumps anywhere; ±5s nudges fine-tune. Preview plays
// the decoded audio through Web Audio, never the player's <audio>, which is
// paused meanwhile and resumed after. Then [ create_story ] records the
// window from the same decoded slice (no second download) and hands the file
// to the share sheet. The phases and their analytics live in createFlow.ts.
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
    // The bar(s) the window overlaps go gold: the excerpt is a fraction of
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

// The artwork the story frame draws: the optimised 1080 webp Image.tsx serves
// (`/images/${src}-${w}.webp`), then the uploaded original.
function artworkUrls(set: MusicSet): string[] {
  return [
    set.artwork ? `/images/${set.artwork}-1080.webp` : null,
    set.artworkOriginalUrl ?? null,
  ].filter((u): u is string => u !== null);
}

// For the devmode line under a failed slice. An HTTP failure's status is in
// its message ("HTTP 416", "expected 206 … got 200"); a CORS block is a bare
// "TypeError: Failed to fetch".
function describeError(e: unknown): string {
  if (e instanceof Mp3ExcerptError) return `${e.name}(${e.failure}): ${e.message}`;
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

// What the create tap takes hold of, released when the recording ends for any
// reason: the player's state, iOS's audio session type, and the wake lock.
type Session = {
  wasPlaying: boolean;
  audioSessionType: string | null;
  wakeLock: WakeLockSentinel | null;
};

type Props = { set: MusicSet; onClose: () => void };

export default function StoryVideoFlow({ set, onClose }: Props) {
  const isCurrent = useStore((s) => s.nowPlaying?.id === set.id);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const setToast = useStore((s) => s.setToast);
  const trackEvent = useTrackEvent();
  const knownDuration = useStore((s) => knownDurationFor(s.durations, set));
  const cachedPeaks = useStore((s) => cachedPeaksFor(s.peaksCache, set));
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
    // Aborted when the window moves on (or the picker closes) before this
    // slice arrives: the ~3.6MB request is cancelled, not just ignored.
    const abort = new AbortController();
    const cancelled = () => abort.signal.aborted;
    const timer = setTimeout(
      async () => {
        const span = sliceFor(start, setSeconds);
        try {
          contextRef.current ??= new AudioContext();
          const context = contextRef.current;
          // Marked like the player's own audio URL: in the installed app the
          // SW answers a saved set's Range requests from its IDB copy, so the
          // waveform doesn't depend on the network; an unsaved set streams.
          // In a browser tab the marker isn't added, and tabs never read the
          // offline library. Fetched with the bare URL instead, a saved set's
          // zoomed strip went blank whenever the connection dropped.
          const excerpt = await fetchExcerpt(
            withAppContext(set.src),
            span.start,
            span.end - span.start,
            (data) => context.decodeAudioData(data),
            undefined,
            abort.signal,
          );
          if (cancelled()) return;
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
          if (cancelled()) return;
          if (e instanceof Mp3ExcerptError && e.failure === "not-cbr") {
            setRefused(true);
            setLoadError(`can't clip this set — ${e.message}`);
          } else {
            const generic = "couldn't load this part of the set — check your connection";
            setLoadError(
              isDevModeActive()
                ? `${generic} [devmode: ${describeError(e)} · slice ${fmtTimestamp(span.start)}–${fmtTimestamp(span.end)} of ${fmtTimestamp(setSeconds)} (${knownDuration ? "player" : "catalogue"} length)]`
                : generic,
            );
          }
        }
      },
      slice ? SLICE_DEBOUNCE_MS : 0,
    );
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [needsSlice, start, setSeconds, set.src, slice, retries]);

  // The full-set strip reuses the player's peaks; fetch them if the player
  // never has, the same way PlayerSeeker does.
  useEffect(() => {
    const peaksUrl = set.peaks;
    if ((cachedPeaks && cachedPeaks.length > 0) || !peaksUrl) return;
    fetch(withAppContext(peaksUrl))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPeaks(set.id, peaksUrl, (d as { peaks: number[] }).peaks))
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

  // Synchronous on purpose. The context was created outside any tap (for
  // decoding, which works while suspended), so on mobile it starts suspended;
  // resume() only takes effect when called within the user's tap. Don't await
  // anything before it. A source started while the context is still resuming
  // plays as soon as it runs.
  const startPreview = () => {
    if (!slice || !windowDecoded) return;
    contextRef.current ??= new AudioContext();
    const context = contextRef.current;
    void context.resume();
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

  // ── Create: record the window, then share ──
  const [flow, setFlow] = useState<CreateState>({ phase: "picking" });
  // The machine's state is read synchronously by tap handlers and recorder
  // callbacks, so it lives in a ref as well as in React state; each
  // transition's events are tracked exactly once, here.
  const flowRef = useRef(flow);
  const dispatch = useCallback(
    (action: CreateAction) => {
      const next = transition(flowRef.current, action);
      flowRef.current = next.state;
      setFlow(next.state);
      for (const event of next.events) trackEvent(event, set.id);
    },
    [trackEvent, set.id],
  );

  // Fonts and artwork load while the visitor picks, so [ create_story ]
  // starts at once.
  const [assets, setAssets] = useState<StoryAssets | null>(null);
  useEffect(() => {
    let live = true;
    void loadStoryAssets(artworkUrls(set)).then((loaded) => {
      if (live) setAssets(loaded);
    });
    return () => {
      live = false;
    };
  }, [set]);

  const session = useRef<Session | null>(null);
  const endSession = useCallback(() => {
    const held = session.current;
    if (!held) return;
    session.current = null;
    void held.wakeLock?.release().catch(() => {});
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession && held.audioSessionType !== null) {
      nav.audioSession.type = held.audioSessionType;
    }
    if (held.wasPlaying) setIsPlaying(true);
  }, [setIsPlaying]);

  // Everything here runs synchronously in the tap: resume() and the audio
  // session only take effect within a user activation.
  const createStory = () => {
    if (!windowDecoded || !assets || flowRef.current.phase !== "picking") return;
    stopPreview();
    contextRef.current ??= new AudioContext();
    void contextRef.current.resume();
    const held: Session = {
      wasPlaying: useStore.getState().isPlaying,
      audioSessionType: null,
      wakeLock: null,
    };
    // iOS: "playback" plays through the silent switch, like the player does.
    // Only Safari has navigator.audioSession.
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) {
      held.audioSessionType = nav.audioSession.type;
      nav.audioSession.type = "playback";
    }
    if (held.wasPlaying) setIsPlaying(false);
    session.current = held;
    // Keep the screen on while recording: if it dims and locks, the page hides
    // and the recording aborts. Where unsupported or refused, recording just
    // goes ahead without it.
    if ("wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (session.current === held) held.wakeLock = lock;
          else void lock.release();
        })
        .catch(() => {});
    }
    // Copied now, while this tap's activation is fresh: a recording later, Safari may
    // refuse the write. If it's refused anyway, the screens after recording
    // offer [ copy_link ] for a fresh tap.
    setLinkCopied(false);
    void copyLink();
    dispatch({ type: "create" });
  };

  // Leaving the recording phase, however it happened, gives everything back.
  useEffect(() => {
    if (flow.phase !== "recording") endSession();
  }, [flow.phase, endSession]);

  const [linkCopied, setLinkCopied] = useState(false);
  // The link opens the set at the clip's start, like ShareModal's copy @.
  const storyLink = `${window.location.origin}/sets/${set.id}?t=${Math.floor(start)}`;
  const copyLink = () =>
    navigator.clipboard.writeText(storyLink).then(
      () => {
        setLinkCopied(true);
        setToast("link copied — add it as a link sticker");
      },
      () => setLinkCopied(false),
    );

  const onRecordingProgress = (progress: number) => {
    // A second's step is enough for the bar and the counter; per-frame
    // updates would re-render the dialog 60 times a second.
    const stepped = Math.floor(progress * EXCERPT_SECONDS) / EXCERPT_SECONDS;
    const current = flowRef.current;
    if (current.phase === "recording" && current.progress !== stepped) {
      dispatch({ type: "progress", progress: stepped });
    }
  };

  const onRecorded = (file: File, canShare: boolean) => {
    if (flowRef.current.phase !== "recording") return; // cancelled meanwhile
    dispatch({ type: "recorded", file, canShare });
  };

  const share = () => {
    const current = flowRef.current;
    if (current.phase !== "ready") return;
    dispatch({ type: "share" });
    // Called synchronously in the tap: share() needs this fresh activation.
    navigator.share({ files: [current.file] }).then(
      () => dispatch({ type: "share-resolved" }),
      (e: unknown) =>
        dispatch({
          type:
            (e as { name?: string } | null)?.name === "AbortError"
              ? "share-aborted"
              : "share-failed",
        }),
    );
  };

  useEffect(() => {
    if (flow.phase !== "done") return;
    setToast("shared — add the link sticker in instagram");
    onClose();
  }, [flow.phase, setToast, onClose]);

  // The recording reuses the decoded slice; no second download.
  const windowExcerpt =
    slice && windowDecoded
      ? {
          audio: slice.audio,
          offsetSeconds: slice.offsetSeconds + (start - slice.span.start),
          durationSeconds: EXCERPT_SECONDS,
        }
      : null;

  // Leaving the flow stops the preview and any recording (RecordingScreen
  // aborts on unmount), gives back the session, and releases the AudioContext.
  useEffect(
    () => () => {
      stopPreview();
      endSession();
      void contextRef.current?.close();
    },
    [stopPreview, endSession],
  );

  // ── Strips ──
  const stripsRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  // The strips unmount while a later screen shows; coming back remounts them,
  // so measuring and drawing re-run on `picking` too.
  const picking = flow.phase === "picking";

  useEffect(() => {
    const el = stripsRef.current;
    if (!picking || !el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [picking]);

  useEffect(() => {
    if (!picking || !width) return;
    if (fullRef.current)
      drawFullStrip(fullRef.current, width, cachedPeaks ?? [], start, setSeconds);
    if (zoomRef.current) drawZoomStrip(zoomRef.current, width, slice, start, setSeconds);
  }, [picking, width, cachedPeaks, slice, start, setSeconds]);

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
    endSession();
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

  const backToPicker = () => dispatch({ type: "back" });
  const fileScreenProps = {
    windowLabel,
    linkCopied,
    onCopyLink: () => void copyLink(),
    onBack: backToPicker,
  };
  let createScreen: ReactNode = null;
  if (flow.phase === "recording" && windowExcerpt && assets && contextRef.current) {
    createScreen = (
      <RecordingScreen
        context={contextRef.current}
        input={{
          djName: (set.djId && getDJ(set.djId)?.name) || set.artist,
          title: set.title,
          date: set.date,
          startSeconds: start,
          setSeconds,
          excerpt: windowExcerpt,
          setPeaks: cachedPeaks ?? [],
          artwork: assets.artwork,
        }}
        fileName={storyFileName(set.id, start)}
        progress={flow.progress}
        onProgress={onRecordingProgress}
        onRecorded={onRecorded}
        onFailed={(message) => dispatch({ type: "record-failed", message })}
        onCancel={() => dispatch({ type: "cancel" })}
      />
    );
  } else if (flow.phase === "ready" || flow.phase === "sharing") {
    createScreen = (
      <ShareScreen
        {...fileScreenProps}
        file={flow.file}
        onShare={share}
        sharing={flow.phase === "sharing"}
      />
    );
  } else if (flow.phase === "fallback") {
    createScreen = <FallbackScreen {...fileScreenProps} file={flow.file} />;
  } else if (flow.phase === "failed") {
    createScreen = <FailedScreen message={flow.message} onBack={backToPicker} />;
  }

  return (
    <Modal
      open
      onClose={close}
      ariaLabel={`Pick ${EXCERPT_SECONDS} seconds for an Instagram story`}
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">instagram_story</span>
        </div>
      }
    >
      <TerminalRow label="set" value={`${set.artist} @ ${set.title}`} className="mb-5" />

      {!picking ? (
        createScreen
      ) : setSeconds <= 0 ? (
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
            aria-label={`${EXCERPT_SECONDS}-second excerpt start`}
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

          <Button
            variant="primary"
            className="mt-5"
            disabled={!windowDecoded || !assets}
            onClick={createStory}
          >
            create_story
          </Button>

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
