// The Story video's live spectrum strip: log-spaced bands over an
// AnalyserNode's dB spectrum, smoothed by elapsed time rather than per read.
// Also a JS implementation of the analyser's own algorithm, for frames with
// no live audio (the static preview): an AnalyserNode with nothing playing
// reports silence.
//
// Tuned on 20s of set-003-unreal from 30:00, read at 60fps. The derivation of
// every number is in spikes/instagram-story/index.html's header, the approved
// design reference. Retune if the bands change: narrower bands take their max
// over fewer bins and read lower.

export const SPECTRUM_TUNING = {
  bands: 72,
  fMin: 50,
  fMax: 16000,
  // ~5.4Hz bins at 44.1kHz (5.9 at 48kHz). Exactly one pair of adjacent bands
  // still reads the same bin, down at 50–64Hz, so two bars at the far left
  // always match. 16384 would separate them, at the cost of a 0.37s window
  // that smears kicks, and a retune.
  fftSize: 8192,
  // 5th and 99.5th percentiles of the tilted band levels.
  minDecibels: -57,
  maxDecibels: -28,
  // Music's spectrum falls with frequency (measured −4.1dB/octave); without
  // this the top bands barely move.
  tiltDbPerOctave: 4,
} as const;

// The analyser's smoothingTimeConstant must be 0 wherever this is used: its
// own smoothing is applied per read, so identical audio moves ~40% less at
// 30fps and ~45% more at 120fps. This replaces it, per FFT bin on linear
// magnitude, with coefficient exp(−dt/τ). τ = −(1/60)/ln(0.8) ≈ 74.7ms
// reproduces the analyser's 0.8 exactly at 60 reads/s, the tuned look.
// Smoothing each band's max instead reads ~0.04 higher and ~13% calmer.
export const SMOOTHING_TAU_SECONDS = -(1 / 60) / Math.log(0.8);

/** Log-spaced band edges, fMin · (fMax/fMin)^(i/bands) for i = 0..bands. */
export function bandEdges(bands: number, fMin: number, fMax: number): number[] {
  return Array.from({ length: bands + 1 }, (_, i) => fMin * (fMax / fMin) ** (i / bands));
}

/** Inclusive FFT-bin index range one band reads. */
export type BinRange = readonly [number, number];

/**
 * The bins each band reads. A band narrower than one bin reads the single
 * bin nearest its geometric centre.
 */
function bandBins(edges: readonly number[], sampleRate: number, fftSize: number): BinRange[] {
  const binHz = sampleRate / fftSize;
  const ranges: BinRange[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i] ?? 0;
    const hi = edges[i + 1] ?? 0;
    const a = Math.ceil(lo / binHz);
    const b = Math.floor(hi / binHz);
    const centre = Math.round(Math.sqrt(lo * hi) / binHz);
    ranges.push(b >= a ? [a, b] : [centre, centre]);
  }
  return ranges;
}

/** dB added to each band: tiltDbPerOctave × octaves of its geometric centre above fMin. */
function bandTiltDb(edges: readonly number[], tiltDbPerOctave: number, fMin: number): number[] {
  const tilt: number[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    tilt.push(tiltDbPerOctave * Math.log2(Math.sqrt((edges[i] ?? 0) * (edges[i + 1] ?? 0)) / fMin));
  }
  return tilt;
}

export interface SpectrumBands {
  ranges: BinRange[];
  tiltDb: number[];
}

/** Bands for the approved tuning at `sampleRate` (the AudioContext's). */
export function spectrumBands(sampleRate: number): SpectrumBands {
  const { bands, fMin, fMax, fftSize, tiltDbPerOctave } = SPECTRUM_TUNING;
  const edges = bandEdges(bands, fMin, fMax);
  return {
    ranges: bandBins(edges, sampleRate, fftSize),
    tiltDb: bandTiltDb(edges, tiltDbPerOctave, fMin),
  };
}

/**
 * A frame-rate-independent smoother over raw dB spectra (an analyser at
 * smoothingTimeConstant 0). Each call blends the new read in with weight
 * 1 − exp(−dt/τ), so the result depends on elapsed time, not read count.
 * The first call takes its input as is. Only bins the bands read are
 * touched. Returns linear magnitudes, in an array it reuses.
 */
export function makeSpectrumSmoother(
  binCount: number,
  ranges: readonly BinRange[],
  tauSeconds: number = SMOOTHING_TAU_SECONDS,
): (rawDb: ArrayLike<number>, dtSeconds: number) => Float32Array {
  const lo = ranges[0]?.[0] ?? 0;
  const hi = ranges[ranges.length - 1]?.[1] ?? -1;
  const mag = new Float32Array(binCount);
  let primed = false;
  return (rawDb, dtSeconds) => {
    const keep = primed ? Math.exp(-Math.max(0, dtSeconds) / tauSeconds) : 0;
    for (let k = lo; k <= hi; k++)
      mag[k] =
        keep * (mag[k] ?? 0) + (1 - keep) * 10 ** ((rawDb[k] ?? Number.NEGATIVE_INFINITY) / 20);
    primed = true;
    return mag;
  };
}

/**
 * Linear magnitudes → 0..1 per band: the band's loudest bin, taken in the
 * linear domain (log10 is monotonic, so it equals the max in dB at one log
 * per band instead of one per bin), tilted, then mapped over the dB range.
 */
export function bandLevels(
  mag: ArrayLike<number>,
  bands: SpectrumBands,
  out: Float32Array = new Float32Array(bands.ranges.length),
): Float32Array {
  const { minDecibels, maxDecibels } = SPECTRUM_TUNING;
  const span = maxDecibels - minDecibels;
  bands.ranges.forEach(([a, b], i) => {
    let max = 0;
    for (let k = a; k <= b; k++) max = Math.max(max, mag[k] ?? 0);
    const v = (20 * Math.log10(max) + (bands.tiltDb[i] ?? 0) - minDecibels) / span;
    out[i] = Math.min(1, Math.max(0, v));
  });
  return out;
}

/**
 * In-place radix-2 FFT of (re, im); returns |X[k]| / N for k < N/2, the
 * normalisation the Web Audio spec's AnalyserNode uses. N must be a power of 2.
 */
export function fftMagnitudes(re: Float64Array, im: Float64Array): Float64Array {
  const n = re.length;
  if (n < 2 || (n & (n - 1)) !== 0 || im.length !== n)
    throw new RangeError("FFT size must be a power of 2");
  const at = (arr: Float64Array, i: number) => arr[i] ?? 0;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const r = at(re, i);
      re[i] = at(re, j);
      re[j] = r;
      const m = at(im, i);
      im[i] = at(im, j);
      im[j] = m;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len / 2;
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const u = i + k;
        const v = u + half;
        const tr = at(re, v) * cr - at(im, v) * ci;
        const ti = at(re, v) * ci + at(im, v) * cr;
        re[v] = at(re, u) - tr;
        im[v] = at(im, u) - ti;
        re[u] = at(re, u) + tr;
        im[u] = at(im, u) + ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  const mags = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mags[k] = Math.hypot(at(re, k), at(im, k)) / n;
  return mags;
}

/** The parts of an AudioBuffer the spectrum reads. */
export interface SampleSource {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

const blackmanWindows = new Map<number, Float64Array>();

// The AnalyserNode's window: Blackman with α = 0.16.
function blackman(size: number): Float64Array {
  let w = blackmanWindows.get(size);
  if (!w) {
    w = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      w[i] =
        0.42 - 0.5 * Math.cos((2 * Math.PI * i) / size) + 0.08 * Math.cos((4 * Math.PI * i) / size);
    }
    blackmanWindows.set(size, w);
  }
  return w;
}

/**
 * What an AnalyserNode at smoothingTimeConstant 0 would report for the
 * fftSize samples ending at `endSample`: down-mix to mono, Blackman window,
 * FFT, |X|/N, 20·log10. Samples outside the source read as silence.
 */
export function rawSpectrumDb(
  source: SampleSource,
  endSample: number,
  fftSize: number,
): Float64Array {
  const channels = Array.from({ length: source.numberOfChannels }, (_, c) =>
    source.getChannelData(c),
  );
  const window = blackman(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const s = endSample - fftSize + i;
    if (s < 0 || s >= source.length) continue;
    let sum = 0;
    for (const data of channels) sum += data[s] ?? 0;
    re[i] = (sum / channels.length) * (window[i] ?? 0);
  }
  return fftMagnitudes(re, im).map((m) => 20 * Math.log10(m));
}

/**
 * The smoothed linear spectrum a live strip would show at `endSample`:
 * `reads` raw reads, 1/readHz apart, ending there, through a fresh smoother.
 * The default 30 reads at 60Hz span 0.5s, ≈6.7τ, so the smoother has settled.
 */
export function smoothedSpectrum(
  source: SampleSource,
  endSample: number,
  bands: SpectrumBands,
  reads = 30,
  readHz = 60,
): Float32Array {
  const { fftSize } = SPECTRUM_TUNING;
  const smooth = makeSpectrumSmoother(fftSize / 2, bands.ranges);
  const step = source.sampleRate / readHz;
  let mag: Float32Array = new Float32Array(fftSize / 2);
  for (let r = reads; r >= 0; r--) {
    mag = smooth(rawSpectrumDb(source, Math.round(endSample - r * step), fftSize), 1 / readHz);
  }
  return mag;
}
