import { describe, expect, it } from "vitest";
import {
  SMOOTHING_TAU_SECONDS,
  SPECTRUM_TUNING,
  type SampleSource,
  bandEdges,
  bandLevels,
  fftMagnitudes,
  makeSpectrumSmoother,
  rawSpectrumDb,
  smoothedSpectrum,
  spectrumBands,
} from "~/utils/storyVideo/spectrum";

const { bands, fMin, fMax, fftSize, minDecibels, maxDecibels } = SPECTRUM_TUNING;

function source(channels: Float32Array[], sampleRate = 48000): SampleSource {
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    sampleRate,
    getChannelData: (c) => channels[c] ?? new Float32Array(),
  };
}

/** A sine at exactly FFT bin `bin`, amplitude 1. */
const sine = (bin: number, length: number, sign = 1) =>
  Float32Array.from({ length }, (_, i) => sign * Math.sin((2 * Math.PI * bin * i) / fftSize));

describe("bands", () => {
  it("spaces the approved 72 bands logarithmically from 50Hz to 16kHz", () => {
    const edges = bandEdges(bands, fMin, fMax);
    expect(edges).toHaveLength(73);
    expect(edges[0]).toBeCloseTo(50, 9);
    expect(edges[72]).toBeCloseTo(16000, 6);
    const ratio = (edges[1] ?? 0) / (edges[0] ?? 1);
    edges.slice(1).forEach((e, i) => expect(e / (edges[i] ?? 1)).toBeCloseTo(ratio, 9));
  });

  // Known and accepted: at fftSize 8192 one adjacent pair in the lowest three
  // bands shares a bin (see SPECTRUM_TUNING.fftSize). Anything more means the
  // bands or the FFT size changed without a look at the low end.
  it.each([44100, 48000])(
    "has at most one duplicated pair, in the lowest bands, at %iHz",
    (rate) => {
      const { ranges } = spectrumBands(rate);
      expect(ranges).toHaveLength(72);
      const duplicates = ranges
        .slice(1)
        .map(([a, b], i) => (a === ranges[i]?.[0] && b === ranges[i]?.[1] ? i + 1 : -1))
        .filter((i) => i >= 0);
      expect(duplicates.length).toBeLessThanOrEqual(1);
      for (const i of duplicates) expect(i).toBeLessThanOrEqual(2);
      for (const [a, b] of ranges) expect(a).toBeLessThanOrEqual(b);
    },
  );

  it("tilts more the higher the band, 4dB per octave", () => {
    const { tiltDb } = spectrumBands(48000);
    tiltDb
      .slice(1)
      .forEach((t, i) => expect(t).toBeGreaterThan(tiltDb[i] ?? Number.POSITIVE_INFINITY));
    const edges = bandEdges(bands, fMin, fMax);
    const lastCentre = Math.sqrt((edges[71] ?? 0) * (edges[72] ?? 0));
    expect(tiltDb[71]).toBeCloseTo(4 * Math.log2(lastCentre / fMin), 9);
  });
});

describe("makeSpectrumSmoother", () => {
  const ranges = [[0, 0]] as const;
  const silence = [Number.NEGATIVE_INFINITY];
  const unit = [0]; // 0dB = magnitude 1

  it("equals the analyser's 0.8-per-read at exactly 60 reads/s", () => {
    expect(Math.exp(-(1 / 60) / SMOOTHING_TAU_SECONDS)).toBeCloseTo(0.8, 12);
  });

  it("takes the first read as is", () => {
    expect(makeSpectrumSmoother(1, ranges)(unit, 1 / 60)[0]).toBe(1);
  });

  // A step from silence to a constant tone: after t seconds the level must be
  // 1 − exp(−t/τ) however often it was read. The old per-read smoothing
  // failed exactly this.
  it.each([30, 60, 120])("reaches the same level after 0.5s at %i reads/s", (hz) => {
    const smooth = makeSpectrumSmoother(1, ranges);
    smooth(silence, 0);
    let level = 0;
    for (let i = 0; i < hz / 2; i++) level = smooth(unit, 1 / hz)[0] ?? 0;
    expect(level).toBeCloseTo(1 - Math.exp(-0.5 / SMOOTHING_TAU_SECONDS), 6);
  });

  it("treats a zero or negative dt as no time passing", () => {
    const smooth = makeSpectrumSmoother(1, ranges);
    smooth(unit, 0);
    expect(smooth(silence, -1)[0]).toBe(1);
  });
});

describe("bandLevels", () => {
  const bandSet = spectrumBands(48000);
  const span = maxDecibels - minDecibels;

  it("maps silence to 0", () => {
    expect(
      Array.from(bandLevels(new Float32Array(fftSize / 2), bandSet)).every((v) => v === 0),
    ).toBe(true);
  });

  it("takes the band's loudest bin, tilted, over the dB range", () => {
    const [a, b] = bandSet.ranges[40] ?? [0, 0];
    const mag = new Float32Array(fftSize / 2);
    // −60dB plus band 40's ~+18dB tilt lands mid-range, away from both clamps.
    const peakDb = -60;
    mag[a] = 10 ** ((peakDb - 12) / 20);
    mag[b] = 10 ** (peakDb / 20);
    const expected = (peakDb + (bandSet.tiltDb[40] ?? 0) - minDecibels) / span;
    expect(expected).toBeGreaterThan(0.1);
    expect(expected).toBeLessThan(0.9);
    expect(bandLevels(mag, bandSet)[40]).toBeCloseTo(expected, 5);
  });

  it("clamps to 0..1", () => {
    const loud = new Float32Array(fftSize / 2).fill(1); // 0dB, far above maxDecibels
    expect(Array.from(bandLevels(loud, bandSet)).every((v) => v === 1)).toBe(true);
  });
});

describe("fftMagnitudes", () => {
  it("normalises by N, like the analyser", () => {
    const n = 1024;
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 64 * i) / n));
    const mags = fftMagnitudes(re, new Float64Array(n));
    expect(mags[64]).toBeCloseTo(0.5, 9);
    expect(mags[63]).toBeCloseTo(0, 9);
    expect(mags).toHaveLength(n / 2);
  });

  it("refuses sizes that aren't a power of 2", () => {
    expect(() => fftMagnitudes(new Float64Array(1000), new Float64Array(1000))).toThrow(RangeError);
  });
});

describe("rawSpectrumDb", () => {
  // A unit sine on bin k through the Blackman window gives |X[k]|/N = a0/2 =
  // 0.21, i.e. 20·log10(0.21) ≈ −13.56dB. The same spec algorithm matched
  // Chromium's AnalyserNode to 0.000dB in the spike.
  it("reads a unit sine on its bin at 20·log10(0.21)", () => {
    const db = rawSpectrumDb(source([sine(100, fftSize)]), fftSize, fftSize);
    expect(db[100]).toBeCloseTo(20 * Math.log10(0.21), 6);
  });

  it("down-mixes channels by averaging", () => {
    const mono = rawSpectrumDb(source([sine(100, fftSize)]), fftSize, fftSize);
    const stereo = rawSpectrumDb(
      source([sine(100, fftSize), sine(100, fftSize)]),
      fftSize,
      fftSize,
    );
    expect(stereo[100]).toBeCloseTo(mono[100] ?? 0, 9);
    const cancelled = rawSpectrumDb(
      source([sine(100, fftSize), sine(100, fftSize, -1)]),
      fftSize,
      fftSize,
    );
    expect(cancelled[100]).toBe(Number.NEGATIVE_INFINITY);
  });

  it("reads samples outside the source as silence", () => {
    const db = rawSpectrumDb(source([sine(100, fftSize)]), 0, fftSize);
    expect(db.every((v) => v === Number.NEGATIVE_INFINITY)).toBe(true);
  });
});

describe("smoothedSpectrum", () => {
  it("settles to the raw level on a steady tone", () => {
    const tone = source([sine(100, fftSize * 8)]);
    const end = fftSize * 8;
    const mag = smoothedSpectrum(tone, end, spectrumBands(48000));
    const raw = rawSpectrumDb(tone, end, fftSize)[100] ?? 0;
    expect(20 * Math.log10(mag[100] ?? 0)).toBeCloseTo(raw, 3);
  });
});
