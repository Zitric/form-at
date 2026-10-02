import { describe, expect, it } from "vitest";
import {
  FinePeaksFormatError,
  decodeFinePeaks,
  encodeFinePeaks,
  finePeaksSeconds,
} from "~/finePeaks";

describe("encodeFinePeaks / decodeFinePeaks", () => {
  it("writes the documented header", () => {
    const bytes = encodeFinePeaks([0.25, 1.137, 0]);
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("FPKS");
    expect(view.getUint8(4)).toBe(1); // format version
    expect(view.getUint8(5)).toBe(1); // sqrt-companded u8
    expect(view.getUint16(6, true)).toBe(10);
    expect(view.getUint32(8, true)).toBe(3);
    expect(view.getFloat32(12, true)).toBeCloseTo(1.137, 6);
    expect(bytes.length).toBe(16 + 3);
    // sqrt(0.25 / 1.137) * 255, the loudest value, silence
    expect([...bytes.slice(16)]).toEqual([120, 255, 0]);
  });

  it("round-trips within one byte step", () => {
    const values = [0, 0.001, 0.05, 0.3, 0.8, 1.137];
    const decoded = decodeFinePeaks(encodeFinePeaks(values));
    expect(decoded.valuesPerSecond).toBe(10);
    expect(decoded.scale).toBeCloseTo(1.137, 6);
    decoded.values.forEach((v, i) => {
      // One step in the sqrt domain, at this value.
      const step = (2 * Math.sqrt((values[i] ?? 0) / 1.137) + 1 / 255) / 255;
      expect(Math.abs(v - (values[i] ?? 0))).toBeLessThanOrEqual(step * 1.137);
    });
    expect(decoded.values[5]).toBeCloseTo(1.137, 6);
  });

  it("decodes from a Uint8Array view with an offset, as well as an ArrayBuffer", () => {
    const bytes = encodeFinePeaks([0.5, 1]);
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    expect(decodeFinePeaks(padded.subarray(3)).values).toEqual(
      decodeFinePeaks(bytes.buffer).values,
    );
  });

  it("encodes an all-silent set as zeros, not NaN", () => {
    const decoded = decodeFinePeaks(encodeFinePeaks([0, 0, 0]));
    expect(decoded.scale).toBe(0);
    expect([...decoded.values]).toEqual([0, 0, 0]);
  });

  it("reports the length by its own count", () => {
    expect(finePeaksSeconds(decodeFinePeaks(encodeFinePeaks(new Array(27190).fill(0.5))))).toBe(
      2719,
    );
  });

  it("rejects anything that isn't a whole FPKS v1 file", () => {
    const good = encodeFinePeaks([0.1, 0.2, 0.3]);
    const withByte = (at: number, value: number) => {
      const copy = good.slice();
      copy[at] = value;
      return copy;
    };
    const bad: Array<[Uint8Array, string]> = [
      [good.slice(0, 10), "shorter than the header"],
      [new TextEncoder().encode('{"peaks":[0.1,0.2,0.3,0.4,0.5,0.6]}'), "not FPKS"],
      [withByte(4, 2), "format version 2"],
      [withByte(5, 0), "encoding 0"],
      [good.slice(0, -1), "3 values declared, 2 present"],
      [new Uint8Array([...good, 9]), "3 values declared, 4 present"],
    ];
    for (const [bytes, message] of bad) {
      expect(() => decodeFinePeaks(bytes)).toThrow(FinePeaksFormatError);
      expect(() => decodeFinePeaks(bytes)).toThrow(message);
    }
    const zeroRate = good.slice();
    new DataView(zeroRate.buffer).setUint16(6, 0, true);
    expect(() => decodeFinePeaks(zeroRate)).toThrow("0 values per second");
    const nanScale = good.slice();
    new DataView(nanScale.buffer).setFloat32(12, Number.NaN, true);
    expect(() => decodeFinePeaks(nanScale)).toThrow("scale NaN");
  });
});

// Why the bytes are square-root companded rather than linear. The zoomed
// strip scales its bars to the loudest value in view, so in a quiet passage
// a value's error is measured against that passage, not against the set.
describe("quantisation in quiet passages: sqrt vs linear", () => {
  const SCALE = 1.137;
  const linearRoundTrip = (v: number) => (Math.round((v / SCALE) * 255) / 255) * SCALE;
  // A quiet intro: every value between 1% and 10% of the set's loudest,
  // plus one full-scale value elsewhere in the set setting the scale.
  const quiet = Array.from({ length: 2000 }, (_, i) => SCALE * (0.01 + (0.09 * i) / 1999));
  const sqrtValues = decodeFinePeaks(encodeFinePeaks([...quiet, SCALE])).values.subarray(0, -1);
  const linearValues = quiet.map(linearRoundTrip);

  const worst = (errors: number[]) => Math.max(...errors);
  const relativeErrors = (q: ArrayLike<number>) =>
    quiet.map((v, i) => Math.abs((q[i] ?? 0) - v) / v);
  // As drawn: each bar as a fraction of the view's loudest, which here is 10%.
  const drawnErrors = (q: ArrayLike<number>) => {
    let max = 0;
    for (let i = 0; i < q.length; i++) max = Math.max(max, q[i] ?? 0);
    return quiet.map((v, i) => Math.abs((q[i] ?? 0) / max - v / (SCALE * 0.1)));
  };

  it("keeps every quiet value within 4% (linear: up to ~20%)", () => {
    expect(worst(relativeErrors(sqrtValues))).toBeLessThan(0.04);
    expect(worst(relativeErrors(linearValues))).toBeGreaterThan(0.15);
  });

  // Of the strip's 64.8px bar: ~1.4px at worst, ~0.4px on average (linear:
  // ~2.5px and ~0.9px). The view's own loudest bar is quantised too, so
  // every bar's scale moves with it — which is why this is wider than the
  // per-value error would suggest.
  it("draws a quiet view's bars within ~2% of their height (linear: ~4%)", () => {
    const mean = (errors: number[]) => errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(worst(drawnErrors(sqrtValues))).toBeLessThan(0.025);
    expect(worst(drawnErrors(linearValues))).toBeGreaterThan(0.035);
    expect(mean(drawnErrors(sqrtValues))).toBeLessThan(0.007);
    expect(mean(drawnErrors(linearValues))).toBeGreaterThan(0.012);
  });

  it("spends roughly twice the levels on that range", () => {
    const levels = (q: ArrayLike<number>) => new Set(Array.from(q, (v) => v.toFixed(6))).size;
    expect(levels(sqrtValues)).toBeGreaterThan(2 * levels(linearValues) - 5);
  });
});
