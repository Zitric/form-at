// Records the Story video: plays the decoded excerpt through Web Audio while
// drawing frames to a canvas, and captures both with MediaRecorder. It takes
// as long as the excerpt, in real time.
//
// The player's <audio> element is never involved. The excerpt is its own
// decoded buffer, which is what makes this work on Safari, which has no
// HTMLMediaElement.captureStream().
//
// Browser-only. Does not share: navigator.share needs a fresh user tap, and
// the one that started the recording has expired 20 seconds later.

import { pickStoryMimeType } from "./capability";
import { FRAME } from "./layout";
import { isFragmented, summarizeBoxes, topLevelBoxes } from "./mp4Boxes";
import { type StoryFrame, drawStoryFrame } from "./renderer";
import { SPECTRUM_TUNING, bandLevels, makeSpectrumSmoother, spectrumBands } from "./spectrum";

const VIDEO_BITS_PER_SECOND = 6_000_000;
const AUDIO_BITS_PER_SECOND = 192_000;
const CAPTURE_FPS = 30;
// Sound starts this far after scheduling, so the recorder and the first
// frames are already running when it does.
const AUDIO_LEAD_SECONDS = 0.1;
// After the last frame, before stopping, so the recorder takes it.
const TAIL_MS = 150;
// MediaRecorder's stop event has been reported never firing on iOS. Give up
// rather than hang.
const STOP_TIMEOUT_MS = 5000;

/**
 * - `unsupported`: no H.264 + AAC MP4 recording in this browser.
 * - `hidden`: the page was hidden mid-recording (app switch, screen lock).
 *   requestAnimationFrame stops and, on iOS, the AudioContext is expected to
 *   suspend, so the file would have frozen frames. No file is produced.
 * - `cancelled`: the caller's AbortSignal fired.
 * - `recorder-error`, `stop-timeout`, `empty`: MediaRecorder failed.
 */
type StoryRecordingFailure =
  | "unsupported"
  | "hidden"
  | "cancelled"
  | "recorder-error"
  | "stop-timeout"
  | "empty";

export class StoryRecordingError extends Error {
  constructor(
    readonly failure: StoryRecordingFailure,
    message: string,
  ) {
    super(message);
    this.name = "StoryRecordingError";
  }
}

interface RecordStoryOptions {
  /** Created or resumed inside the user's tap; the caller owns and closes it. */
  context: AudioContext;
  /** Resized to the frame; may be on screen, so the visitor watches it build. */
  canvas: HTMLCanvasElement;
  frame: StoryFrame;
  excerpt: { audio: AudioBuffer; offsetSeconds: number; durationSeconds: number };
  fileName: string;
  /** Also play the excerpt through the speakers. */
  monitor?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface StoryRecordingDiagnostics {
  mimeType: string;
  sizeBytes: number;
  /** Top-level MP4 boxes, e.g. "ftyp, moov, moof, mdat, moof, mdat". */
  boxes: string;
  fragmented: boolean;
  framesDrawn: number;
  wallSeconds: number;
  /** CPU time per drawn frame, analyser read included; not GPU time. */
  renderMsMean: number;
  renderMsMax: number;
}

interface StoryRecording {
  file: File;
  diagnostics: StoryRecordingDiagnostics;
}

export async function recordStory(options: RecordStoryOptions): Promise<StoryRecording> {
  const {
    context,
    canvas,
    frame,
    excerpt,
    fileName,
    monitor = false,
    signal,
    onProgress,
  } = options;
  const mimeType = pickStoryMimeType();
  if (!mimeType)
    throw new StoryRecordingError("unsupported", "no H.264 + AAC MP4 recording in this browser");
  if (signal?.aborted) throw new StoryRecordingError("cancelled", "cancelled before starting");

  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  const g = canvas.getContext("2d");
  if (!g) throw new StoryRecordingError("unsupported", "2D canvas unavailable");

  // source → analyser → recorder (and the speakers, when monitoring). The
  // analyser's own smoothing is off: it's applied per read, so it would make
  // the strip's motion depend on the frame rate. spectrum.ts smooths by time.
  const analyser = context.createAnalyser();
  analyser.fftSize = SPECTRUM_TUNING.fftSize;
  analyser.smoothingTimeConstant = 0;
  const destination = context.createMediaStreamDestination();
  const source = context.createBufferSource();
  source.buffer = excerpt.audio;
  source.connect(analyser);
  analyser.connect(destination);
  if (monitor) analyser.connect(context.destination);

  const bands = spectrumBands(context.sampleRate);
  const smooth = makeSpectrumSmoother(analyser.frequencyBinCount, bands.ranges);
  const rawDb = new Float32Array(analyser.frequencyBinCount);
  const levels = new Float32Array(bands.ranges.length);
  let lastReadAt: number | null = null;
  let framesDrawn = 0;
  let renderMsTotal = 0;
  let renderMsMax = 0;
  const render = (progress: number) => {
    const started = performance.now();
    analyser.getFloatFrequencyData(rawDb);
    // Real time since the last read, so the smoothing looks the same at 30,
    // 60 or 120fps.
    const dt = lastReadAt === null ? 0 : (started - lastReadAt) / 1000;
    lastReadAt = started;
    drawStoryFrame(g, frame, progress, bandLevels(smooth(rawDb, dt), bands, levels));
    const ms = performance.now() - started;
    framesDrawn++;
    renderMsTotal += ms;
    renderMsMax = Math.max(renderMsMax, ms);
  };
  render(0);

  const stream = new MediaStream([
    ...canvas.captureStream(CAPTURE_FPS).getVideoTracks(),
    ...destination.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () =>
      reject(new StoryRecordingError("recorder-error", "MediaRecorder reported an error"));
  });
  // Handled below via Promise.race; this only stops an early rejection from
  // surfacing as unhandled while the recording is still running.
  stopped.catch(() => {});

  const release = () => {
    for (const track of stream.getTracks()) track.stop();
    source.disconnect();
    analyser.disconnect();
  };

  if (context.state === "suspended") await context.resume();
  const wallStart = performance.now();
  const audioStart = context.currentTime + AUDIO_LEAD_SECONDS;
  // Progress follows the audio clock, so the bars track what's actually
  // being recorded rather than wall time.
  const progressNow = () =>
    Math.min(1, Math.max(0, (context.currentTime - audioStart) / excerpt.durationSeconds));

  // Set from event callbacks; the assertion stops TypeScript narrowing it to
  // null for the rest of the function.
  let failure = null as StoryRecordingFailure | null;
  let finish: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const abortWith = (reason: StoryRecordingFailure) => {
    failure ??= reason;
    finish();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") abortWith("hidden");
  };
  const onAbort = () => abortWith("cancelled");
  document.addEventListener("visibilitychange", onVisibility);
  signal?.addEventListener("abort", onAbort);
  source.onended = () => finish();
  // In case `ended` never comes, e.g. a context that stayed suspended.
  const fallback = setTimeout(() => finish(), (excerpt.durationSeconds + 3) * 1000);

  let raf = 0;
  const tick = () => {
    const progress = progressNow();
    render(progress);
    onProgress?.(progress);
    raf = requestAnimationFrame(tick);
  };

  recorder.start(1000);
  source.start(audioStart, excerpt.offsetSeconds, excerpt.durationSeconds);
  raf = requestAnimationFrame(tick);
  try {
    await ended;
  } finally {
    cancelAnimationFrame(raf);
    clearTimeout(fallback);
    document.removeEventListener("visibilitychange", onVisibility);
    signal?.removeEventListener("abort", onAbort);
    try {
      source.stop();
    } catch {
      // already stopped
    }
  }

  if (failure) {
    recorder.ondataavailable = null;
    if (recorder.state !== "inactive") recorder.stop();
    release();
    const message =
      failure === "hidden"
        ? "the page was hidden during recording; no file was produced"
        : "recording cancelled";
    throw new StoryRecordingError(failure, message);
  }

  render(1);
  onProgress?.(1);
  await new Promise((resolve) => setTimeout(resolve, TAIL_MS));
  recorder.stop();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stopped,
      new Promise<never>((_, reject) => {
        watchdog = setTimeout(
          () =>
            reject(
              new StoryRecordingError("stop-timeout", "MediaRecorder's stop event never fired"),
            ),
          STOP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(watchdog);
    release();
  }

  const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
  if (blob.size === 0) throw new StoryRecordingError("empty", "the recording is empty");
  const { boxes } = topLevelBoxes(new Uint8Array(await blob.arrayBuffer()));
  return {
    file: new File([blob], fileName, { type: "video/mp4" }),
    diagnostics: {
      mimeType: recorder.mimeType || mimeType,
      sizeBytes: blob.size,
      boxes: summarizeBoxes(boxes),
      fragmented: isFragmented(boxes),
      framesDrawn,
      wallSeconds: (performance.now() - wallStart) / 1000,
      renderMsMean: framesDrawn ? renderMsTotal / framesDrawn : 0,
      renderMsMax,
    },
  };
}
