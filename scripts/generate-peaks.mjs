#!/usr/bin/env node
// Generates a peaks JSON file from an MP3 using ffmpeg.
// Usage: node scripts/generate-peaks.mjs path/to/set.mp3 [path/to/other.mp3 ...]
// Output: a .json file alongside each MP3, ready to upload to R2.
//
// Requires ffmpeg on PATH: https://ffmpeg.org/download.html
//
// PEAKS = 1000 was tested, not assumed: a set whose waveform looked
// suspiciously flat was re-measured at 1-second resolution (~3-5x finer than
// this produces) directly from the raw audio, and the flatness held at that
// resolution too. So 1000 is not the bottleneck — don't raise it to chase a
// flat waveform; the cause was capture-time clipping, not bucket count. See
// TECH_DEBT.md item 23a.

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const PEAKS = 1000;

function generatePeaks(mp3Path) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    const proc = spawn("ffmpeg", [
      "-i",
      mp3Path,
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "f32le",
      "-loglevel",
      "error",
      "pipe:1",
    ]);

    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.stderr.on("data", (d) => process.stderr.write(d));

    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));

      const raw = Buffer.concat(chunks);
      const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      const blockSize = Math.ceil(samples.length / PEAKS);

      const peaks = Array.from({ length: PEAKS }, (_, i) => {
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
          const abs = Math.abs(samples[i * blockSize + j] ?? 0);
          if (abs > max) max = abs;
        }
        return Math.round(max * 1000) / 1000;
      });

      const outPath = join(dirname(mp3Path), `${basename(mp3Path, extname(mp3Path))}.json`);
      writeFileSync(outPath, JSON.stringify({ peaks }));
      console.log(`✓ ${outPath}`);
      resolve();
    });

    proc.on("error", reject);
  });
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Usage: node scripts/generate-peaks.mjs file.mp3 [file2.mp3 ...]");
  process.exit(1);
}

for (const p of paths) await generatePeaks(p);
