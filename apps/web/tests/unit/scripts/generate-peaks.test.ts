import { describe, expect, it } from "vitest";
import { createPeaksReducer } from "../../../scripts/generate-peaks";

// The reducer is the whole of the generator's arithmetic; ffmpeg only feeds
// it. Checked against real sets when it was written: fed ffmpeg's 8kHz
// stream it reproduces the live peaks.json files (1999 of 2000 values
// identical across two sets).

/** Interleaved stereo f32le, as ffmpeg writes it. */
function pcm(frames: Array<[number, number]>): Uint8Array {
  const out = new Uint8Array(frames.length * 8);
  const view = new DataView(out.buffer);
  frames.forEach(([l, r], i) => {
    view.setFloat32(i * 8, l, true);
    view.setFloat32(i * 8 + 4, r, true);
  });
  return out;
}

// 1000 Hz keeps the arithmetic readable: 100 frames per fine value.
const RATE = 1000;
// 3s: silence, then the left channel at 0.5, then the right at -0.8.
const frames = Array.from({ length: 3 * RATE }, (_, i): [number, number] =>
  i < RATE ? [0, 0] : i < 2 * RATE ? [0.5, 0] : [0, -0.8],
);

describe("createPeaksReducer", () => {
  it("gives one fine value per 0.1s, the loudest |sample| across both channels", () => {
    const reducer = createPeaksReducer(RATE);
    reducer.push(pcm(frames));
    const { fine } = reducer.finish();
    expect(fine).toHaveLength(30);
    expect(fine[5]).toBe(0);
    expect(fine[15]).toBe(0.5);
    expect(fine[25]).toBeCloseTo(0.8, 6);
  });

  it("gives 1000 coarse values from the mono mix, weighted by √½ like ffmpeg's -ac 1", () => {
    const reducer = createPeaksReducer(RATE);
    reducer.push(pcm(frames));
    const { coarse } = reducer.finish();
    expect(coarse).toHaveLength(1000);
    expect(coarse[100]).toBe(0);
    expect(coarse[500]).toBe(Math.round(0.5 * Math.SQRT1_2 * 1000) / 1000);
    expect(coarse[900]).toBe(Math.round(0.8 * Math.SQRT1_2 * 1000) / 1000);
  });

  it("gives the same result however the stream is chunked, frames split mid-sample included", () => {
    const whole = createPeaksReducer(RATE);
    whole.push(pcm(frames));
    const expected = whole.finish();

    const bytes = pcm(frames);
    const chunked = createPeaksReducer(RATE);
    // Odd sizes, so frames (8 bytes) and samples (4 bytes) split across pushes.
    for (let at = 0, size = 3; at < bytes.length; at += size, size = (size * 7) % 61 || 5) {
      chunked.push(bytes.subarray(at, at + size));
    }
    const result = chunked.finish();
    expect(result.fine).toEqual(expected.fine);
    expect(result.coarse).toEqual(expected.coarse);
  });

  it("counts a partial last 0.1s as a value", () => {
    const reducer = createPeaksReducer(RATE);
    reducer.push(pcm(frames.slice(0, 1050)));
    expect(reducer.finish().fine).toHaveLength(11);
  });

  it("ignores a trailing partial frame", () => {
    const reducer = createPeaksReducer(RATE);
    reducer.push(pcm(frames.slice(0, 200)));
    reducer.push(new Uint8Array(5));
    expect(reducer.finish().fine).toHaveLength(2);
  });
});
