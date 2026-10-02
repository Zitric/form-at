// Generates a set's two peaks files from its MP3 with ffmpeg, in one pass:
//   {name}.json            1000 values for the whole set, for the player's
//                          waveform (`{ "peaks": number[] }`)
//   {name}.peaks-fine.bin  one value per 0.1s, for the Story picker's zoomed
//                          strip (@form-at/data/finePeaks)
// Both go to the admin upload with the MP3.
//
// Usage: pnpm -C apps/web peaks path/to/set.mp3 [path/to/other.mp3 ...]
// Requires ffmpeg on PATH: https://ffmpeg.org/download.html
//
// ffmpeg decodes the MP3 once and splits it into two stereo 32-bit float
// streams, reduced as they arrive, so a 2h20 set never sits in memory
// (decoded whole it would be ~1.5GB):
//   - Fine, from 48000 Hz: the loudest |sample| across both channels per
//     0.1s, the same measure the picker computes from a decoded slice
//     (slicePeaks in app/utils/storyVideo/excerptWindow.ts). 48000 Hz is the
//     sets' own rate, so nothing is resampled, and decodeAudioData resamples
//     to the AudioContext's rate, usually 48000 on phones (the Story is
//     phone-only), so there the strip matches that decode. Keep them in step:
//     any other rate resamples, and bars
//     drift from the decoded strip (at 22050 Hz by up to a quarter of their
//     height). Generation time and file size don't depend on it.
//   - Coarse, from 8000 Hz: the loudest |mono mix| per bucket, 1000 buckets
//     over the set — the 8kHz mono script this replaced, so peaks.json comes
//     out as before. Keep it at 8kHz: at higher rates the extra transients
//     raise individual buckets by up to a third of the waveform's height. Bucket
//     edges are only known once the stream ends, so mono maxima are kept per
//     0.01s and the buckets built from those (checked against two live sets'
//     peaks.json: 1999 of 2000 values identical).
//
// PEAKS = 1000 was tested, not assumed: a set whose waveform looked
// suspiciously flat was re-measured at 1-second resolution (~3-5x finer than
// this produces) directly from the raw audio, and the flatness held at that
// resolution too. So 1000 is not the bottleneck — don't raise it to chase a
// flat waveform; the cause was capture-time clipping, not bucket count. See
// TECH_DEBT.md item 23a.

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FINE_PEAKS_PER_SECOND, encodeFinePeaks } from "@form-at/data/finePeaks";

export const FINE_SAMPLE_RATE = 48000;
const COARSE_SAMPLE_RATE = 8000;
const COARSE_PEAKS = 1000;
const MONO_STEPS_PER_SECOND = 100;
const CHANNELS = 2;
// ffmpeg's own stereo-to-mono downmix (`-ac 1`, what the old script used)
// weights each channel by √½, not ½: keep it, or every coarse value drops by
// √2 against the peaks.json files already published.
const MONO_MIX = Math.SQRT1_2;
const BYTES_PER_FRAME = CHANNELS * 4;

export type Peaks = { fine: Float32Array; coarse: number[] };

/**
 * Reduces interleaved stereo f32le PCM, fed in chunks of any size (frames may
 * split across chunks), to both peaks arrays. Exported for the unit tests.
 */
export function createPeaksReducer(sampleRate: number) {
  const fine: number[] = [];
  const mono: number[] = [];
  let frame = 0;
  let carry = new Uint8Array(0);

  function push(chunk: Uint8Array) {
    const bytes = carry.length ? concat(carry, chunk) : chunk;
    const whole = bytes.length - (bytes.length % BYTES_PER_FRAME);
    const view = new DataView(bytes.buffer, bytes.byteOffset, whole);
    for (let at = 0; at < whole; at += BYTES_PER_FRAME, frame++) {
      const l = view.getFloat32(at, true);
      const r = view.getFloat32(at + 4, true);
      const f = Math.floor((frame * FINE_PEAKS_PER_SECOND) / sampleRate);
      const m = Math.floor((frame * MONO_STEPS_PER_SECOND) / sampleRate);
      fine[f] = Math.max(fine[f] ?? 0, Math.abs(l), Math.abs(r));
      mono[m] = Math.max(mono[m] ?? 0, Math.abs((l + r) * MONO_MIX));
    }
    carry = bytes.slice(whole);
  }

  function finish(): Peaks {
    const seconds = frame / sampleRate;
    // The old script's bucket size, in seconds: ceil(samples at 8kHz / 1000).
    const bucketSeconds =
      Math.ceil(Math.round(seconds * COARSE_SAMPLE_RATE) / COARSE_PEAKS) / COARSE_SAMPLE_RATE;
    const coarse = Array.from({ length: COARSE_PEAKS }, (_, i) => {
      const from = Math.floor(i * bucketSeconds * MONO_STEPS_PER_SECOND);
      const to = Math.ceil((i + 1) * bucketSeconds * MONO_STEPS_PER_SECOND);
      let max = 0;
      for (let s = from; s < Math.min(to, mono.length); s++) max = Math.max(max, mono[s] ?? 0);
      return Math.round(max * 1000) / 1000;
    });
    return { fine: Float32Array.from(fine, (v) => v ?? 0), coarse };
  }

  return { push, finish };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Both peaks arrays for an MP3, from a local path or a URL ffmpeg can read. */
export function generatePeaks(input: string): Promise<Peaks> {
  return new Promise((resolve, reject) => {
    const fineReducer = createPeaksReducer(FINE_SAMPLE_RATE);
    const coarseReducer = createPeaksReducer(COARSE_SAMPLE_RATE);
    // One decode, split into the two rates: 48000 Hz on stdout (fd 1),
    // 8000 Hz on fd 3.
    const output = (label: string, rate: number, pipe: string) => [
      "-map",
      `[${label}]`,
      "-ac",
      String(CHANNELS),
      "-ar",
      String(rate),
      "-f",
      "f32le",
      pipe,
    ];
    const proc = spawn(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-i",
        input,
        "-filter_complex",
        "[0:a]asplit=2[fine][coarse]",
        ...output("fine", FINE_SAMPLE_RATE, "pipe:1"),
        ...output("coarse", COARSE_SAMPLE_RATE, "pipe:3"),
      ],
      { stdio: ["ignore", "pipe", "pipe", "pipe"] },
    );
    const coarseOut = proc.stdio[3];
    if (!coarseOut) return reject(new Error("ffmpeg's fd 3 isn't readable"));
    proc.stdout?.on("data", (chunk: Buffer) => fineReducer.push(chunk));
    coarseOut.on("data", (chunk: Buffer) => coarseReducer.push(chunk));
    proc.stderr?.on("data", (d) => process.stderr.write(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));
      resolve({ fine: fineReducer.finish().fine, coarse: coarseReducer.finish().coarse });
    });
  });
}

/** Writes `{name}.json` and `{name}.peaks-fine.bin` next to the MP3. */
export async function writePeaksFiles(mp3Path: string): Promise<{ json: string; fine: string }> {
  const { fine, coarse } = await generatePeaks(mp3Path);
  const base = join(dirname(mp3Path), basename(mp3Path, extname(mp3Path)));
  const json = `${base}.json`;
  const finePath = `${base}.peaks-fine.bin`;
  await writeFile(json, JSON.stringify({ peaks: coarse }));
  await writeFile(finePath, encodeFinePeaks(fine));
  return { json, fine: finePath };
}

async function main() {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error("Usage: pnpm -C apps/web peaks file.mp3 [file2.mp3 ...]");
    process.exit(1);
  }
  for (const p of paths) {
    const out = await writePeaksFiles(p);
    console.log(`✓ ${out.json}\n✓ ${out.fine}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
