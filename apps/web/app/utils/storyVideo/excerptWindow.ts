// The excerpt picker's arithmetic, kept pure so it's testable without a
// browser: where the fixed 20s window may sit, where it opens, how taps,
// drags and nudges move it, and which slice of audio the zoomed strip needs
// decoded. All times are seconds into the set.

import { EXCERPT_SECONDS } from "./layout";
import type { SampleSource } from "./spectrum";

export const NUDGE_SECONDS = 5;
// The zoomed strip shows the window with 20s either side, so the window is a
// third of the strip, wide enough to drag with a thumb.
export const ZOOM_VISIBLE_SECONDS = 60;
// Decoded around the window: the visible span plus 15s either side, so a
// short drag never shows undecoded audio. ~3.6MB at 320kbps.
const ZOOM_SLICE_SECONDS = 90;

export interface Span {
  start: number;
  end: number;
}

/** Keeps the window inside the set. A set shorter than the window starts at 0. */
export function clampStart(start: number, setSeconds: number): number {
  return Math.min(Math.max(0, start), Math.max(0, setSeconds - EXCERPT_SECONDS));
}

/**
 * Where the picker opens: at the playback position when this set is the one
 * playing, otherwise a third of the way in. Whole seconds, so the times the
 * picker shows are exactly where the clip starts.
 */
export function initialStart(setSeconds: number, playingAt: number | null): number {
  return Math.floor(clampStart(playingAt ?? setSeconds / 3, setSeconds));
}

export function nudge(start: number, deltaSeconds: number, setSeconds: number): number {
  return clampStart(start + deltaSeconds, setSeconds);
}

// On a phone-width strip one pixel is ~25s of a 2h set, too coarse to land on
// the set's first or last 20s by aim. Taps in the outer 2% at each end go all
// the way there.
const STRIP_EDGE = 0.02;

/**
 * A tap on the full-set strip, `fraction` of the way across. Between the edge
 * zones, the strip maps linearly onto every valid window start.
 */
export function startFromStripTap(fraction: number, setSeconds: number): number {
  const t = Math.min(1, Math.max(0, (fraction - STRIP_EDGE) / (1 - 2 * STRIP_EDGE)));
  return Math.round(t * Math.max(0, setSeconds - EXCERPT_SECONDS));
}

/**
 * Dragging the zoomed strip moves the waveform under the fixed window, so a
 * drag to the right goes back in time. `stripWidth` spans ZOOM_VISIBLE_SECONDS.
 */
export function startFromDrag(
  startAtGrab: number,
  dx: number,
  stripWidth: number,
  setSeconds: number,
): number {
  if (stripWidth <= 0) return startAtGrab;
  return Math.round(clampStart(startAtGrab - (dx * ZOOM_VISIBLE_SECONDS) / stripWidth, setSeconds));
}

/** What the zoomed strip shows: the window with equal context either side. */
export function visibleSpan(start: number): Span {
  const side = (ZOOM_VISIBLE_SECONDS - EXCERPT_SECONDS) / 2;
  return { start: start - side, end: start + EXCERPT_SECONDS + side };
}

/** The slice to decode for a window at `start`: centred on it, inside the set. */
export function sliceFor(start: number, setSeconds: number): Span {
  const sliceStart = Math.min(
    Math.max(0, start + EXCERPT_SECONDS / 2 - ZOOM_SLICE_SECONDS / 2),
    Math.max(0, setSeconds - ZOOM_SLICE_SECONDS),
  );
  return { start: sliceStart, end: Math.min(setSeconds, sliceStart + ZOOM_SLICE_SECONDS) };
}

/**
 * Whether `slice` still covers everything the strip shows for a window at
 * `start`. Where the set itself ends before the strip does, there's nothing
 * to cover, so only the in-set part counts.
 */
export function sliceCovers(slice: Span, start: number, setSeconds: number): boolean {
  const view = visibleSpan(start);
  return slice.start <= Math.max(0, view.start) && slice.end >= Math.min(setSeconds, view.end);
}

// Resolution of the zoomed strip's peaks. A 60s view is ~80 bars on a phone,
// so 10 per second is finer than anything drawn.
export const ZOOM_PEAKS_PER_SECOND = 10;

/**
 * The decoded slice as ZOOM_PEAKS_PER_SECOND peaks per second (largest
 * |sample| across channels), from `offsetSeconds` into the audio, where the
 * slice's own start sits after the MP3 preroll. Computed once per slice, so
 * dragging only indexes into it.
 */
export function slicePeaks(
  audio: SampleSource,
  offsetSeconds: number,
  seconds: number,
): Float32Array {
  const count = Math.max(0, Math.floor(seconds * ZOOM_PEAKS_PER_SECOND));
  const block = audio.sampleRate / ZOOM_PEAKS_PER_SECOND;
  const first = Math.floor(offsetSeconds * audio.sampleRate);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) =>
    audio.getChannelData(c),
  );
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const from = first + Math.floor(i * block);
    const to = Math.min(first + Math.floor((i + 1) * block), audio.length);
    let max = 0;
    for (const data of channels)
      for (let j = from; j < to; j++) max = Math.max(max, Math.abs(data[j] ?? 0));
    peaks[i] = max;
  }
  return peaks;
}
