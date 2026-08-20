#!/usr/bin/env tsx
// Local mastering pipeline for a freshly-recorded set, run BEFORE it ever
// reaches the admin upload form. Audacity export (WAV) -> declip -> loudness
// match to the catalogue -> true-peak-safe MP3 -> peaks.json. The upload path
// itself (apps/admin/app/routes/api/sets-presign.ts + sets.ts) stores exactly
// what it's given and checks none of this — nothing downstream catches a set
// louder than the rest of the catalogue, or one that's clipping. This is the
// check.
//
// ============================================================================
// READ THIS BEFORE RUNNING IT — what this does NOT do
// ============================================================================
// This matches loudness to the catalogue and fixes rare, genuine hard-clip
// instants (typically a fraction of a percent of samples). That is all it
// does. It does NOT repair sustained clipping, does NOT improve a poor
// recording, and does NOT undo anything already lost at the point of
// capture — audio above 0dBFS at the moment it was recorded is gone, and no
// amount of processing brings it back. If a recording came out of the
// original capture already clipping, this script makes it safe and
// consistent to publish; it does not make it sound like it never clipped.
// A recorder with no input gain trim can't compensate for a signal hotter
// than its converter can take, which is the general, impersonal version of
// why this exists — see TECH_DEBT.md item 23a for the fuller technical
// account. Root cause is hardware, upstream of this script entirely: fix
// gain staging before the next recording, don't rely on this to launder it
// after the fact.
//
// It also does NOT fix a flat-looking waveform, and a flat waveform on a set
// this script has already processed is more likely a symptom of the same
// capture-time clipping than a rendering or peaks-generation bug — sustained
// clipping pins broadband amplitude near the ceiling regardless of what's
// actually playing, so quiet passages stop showing up as quiet even though
// they're audible. Diagnostic before assuming it's a code problem: isolate
// the kick band (ffmpeg `lowpass=f=150`) and compare it against the
// broadband signal at the same timestamps — if the low band dips but
// broadband doesn't, and the raw source WAV measures above 0dBFS during that
// window, that's this, not a bug. See TECH_DEBT.md item 23a for how this was
// confirmed on a real set.
// ============================================================================
//
// It also never touches a file it didn't create: `process` always writes to
// a `.mastered.mp3` / `.mastered.json` suffix, never the source WAV's own
// basename, specifically so it can never silently overwrite an
// already-published file that happens to share that basename. See "Output
// naming" below.
//
// WHY EACH NUMBER IS WHAT IT IS — this is what real material finding a real
// problem worked out, and none of it can be re-derived from the commands
// alone:
//
// - TARGET_I (-17.5 LUFS) is the EXISTING catalogue's own measured level,
//   not a streaming-platform figure. Form:at 002's three published tracks
//   measure -17.2, -17.9, -17.6 LUFS integrated (ffmpeg `ebur128`,
//   2026-08-19) — -17.5 is their average. Spotify/YouTube target -14 LUFS;
//   normalizing to that would make every set already published sound quiet
//   by comparison, for no reason connected to this collective's own sound.
//   Override with --target if the catalogue's character ever shifts enough
//   to warrant recomputing this — don't let it silently go stale instead.
//
// - TARGET_TP (-1.5 dBTP) is more headroom than the conventional -1.0,
//   because real material has been MEASURED overshooting past that: a plain
//   -1dB sample-peak normalize in Audacity, then a 320kbps MP3 export, has
//   been observed decoding back out at up to +1.9dBFS true peak. MP3's
//   lossy reconstruction can overshoot a source's own peak, more so for
//   material that was already riding near the ceiling — the extra 0.5dB is
//   insurance against a measured failure mode, not superstition.
//
// - No separate limiter after loudnorm. `loudnorm`'s TP parameter isn't a
//   target to hit approximately — it invokes a real look-ahead true-peak
//   limiter (192kHz-oversampled, 100ms lookahead) internally. Stacking
//   another limiter after it would be limiting twice for no benefit.
//
// - `linear=true` is deliberately NOT passed to the apply-pass loudnorm
//   call, even though that's what produces a pure gain shift rather than
//   dynamic compression. It doesn't need to be: `linear` already defaults to
//   `true`. Passing it explicitly BREAKS in ffmpeg 8.0.1 — the option
//   parser mangles the adjacent `offset` value ("Invalid chars 'inear=true'
//   at the end of expression '-0.32inear=true'"), because something in this
//   version's numeric-option parsing consumes the colon and the "l" before
//   erroring on what's left. Confirmed reproducible; omitting the flag
//   sidesteps it entirely since the default already does what we want.
//
// - Format normalization to 24-bit/48kHz runs unconditionally before
//   anything else, regardless of what the input WAV actually is. Not
//   optional polish: Audacity exports have been observed coming out at
//   96kHz even when the source is 48kHz (a project-rate setting, easy to
//   leave wrong) — and MP3 cannot encode 96kHz audio at all, so an
//   unnormalized 96kHz file fails the export step outright. Nobody should
//   have to remember an Audacity project-rate setting for this to work; the
//   script makes it not matter.
//
// - `adeclip` runs at its default threshold only. Tested against the
//   maximum-sensitivity setting (threshold=1) on real clipped material: it
//   raised the flat-factor artifact metric from 1.86 to 11.4 — the
//   AR-interpolation model fabricating structure where there wasn't enough
//   clean signal on either side to reconstruct from confidently, not
//   repairing anything. Default settings measurably help (verified via a
//   phase-inverted before/after diff — a real, if small, fix); aggressive
//   settings measurably hurt. Never raise this.
//
// Usage (from apps/web/):
//   pnpm master-set analyse <folder-or-file...>          # report only, writes nothing
//   pnpm master-set process <folder-or-file...>          # writes <name>.mastered.mp3 + .mastered.json next to each source
//   pnpm master-set process --force <folder-or-file...>  # reprocess even if already within tolerance
//   pnpm master-set process --target -17.0 <...>         # override the catalogue target
//
// Output naming: `process` on `foo.wav` writes `foo.mastered.mp3` and
// `foo.mastered.json` — never `foo.mp3`. A folder of freshly-exported WAVs
// often sits right next to that same set's already-published MP3s (same
// basename, from before a re-record); an earlier version of this script
// wrote directly to `<name>.mp3` and would have silently overwritten one
// with no warning at all, confirmed by actually running it against a copy.
// The `.mastered` suffix makes that collision structurally impossible
// rather than something a flag has to prevent. Rename the result yourself
// when you're ready to replace a published file — a deliberate action, not
// something this script does to a file it didn't create.
//
// A folder argument processes every .wav directly inside it (not
// recursive; non-.wav files in the same folder, including a prior
// .mastered.mp3, are ignored). process runs generate-peaks.mjs
// (../../../scripts/generate-peaks.mjs) on each finished MP3 automatically
// — a set uploaded with a peaks.json that doesn't match its actual audio is
// a real bug this repo has already made once (a mismatched waveform), not a
// hypothetical.
//
// Two subcommands rather than one command with a mode flag: they share
// nearly everything (format probe, loudness measurement, the "does this
// need processing" decision), but one produces a report and mutates
// nothing, the other writes files — that's a large enough difference in
// what a mistake costs to want a different verb, not a flag on the same one.
//
// Requires ffmpeg AND ffprobe on PATH: https://ffmpeg.org/download.html

import { spawn } from "node:child_process";
import { readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// apps/web/scripts -> repo root -> scripts/generate-peaks.mjs. Reused rather
// than reimplemented: it's the exact tool the admin upload flow's own
// documentation points to, and duplicating its peak-extraction logic here
// would just be a second copy to keep in sync.
const GENERATE_PEAKS = resolve(SCRIPT_DIR, "../../../scripts/generate-peaks.mjs");

// ---- catalogue-derived targets (see the header comment for why) ----------
const DEFAULT_TARGET_I = -17.5;
const DEFAULT_TARGET_LRA = 7;
const DEFAULT_TARGET_TP = -1.5;

// A file within this many LU of the target, with a true peak already under
// SAFE_TRUE_PEAK_DBFS, isn't worth reprocessing just because it can be — the
// three 002 tracks themselves span -17.2 to -17.9 (0.7 LU), and that's
// normal healthy variation between three different DJs, not a problem.
const LOUDNESS_TOLERANCE_LU = 1.5;
// -0.3, not the conventional -1.0dBTP ceiling: the 002 reference tracks
// themselves measure -0.9 to -1.0 dBFS true peak — a normal, safe mastering
// margin, not a problem. A -1.0 threshold flags the very files this
// script's own target was derived from as needing reprocessing, which is
// wrong. This catches genuine overs (real material measured up to
// +2.1dBFS) without flagging already-healthy content at a conventional margin.
const SAFE_TRUE_PEAK_DBFS = -0.3;

type FileFormat = { sampleRate: number; bitDepth: string };
type Loudness = { integrated: number; truePeak: number; lra: number };

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d;
    });
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(`${cmd} not found on PATH — install ffmpeg: https://ffmpeg.org/download.html`),
        );
      } else {
        reject(err);
      }
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited ${code}\n${stderr.slice(-2000)}`));
      } else {
        resolvePromise({ stdout, stderr });
      }
    });
  });
}

// PCM's codec name encodes bit depth directly (pcm_s16le, pcm_s24le,
// pcm_f32le) — `bits_per_raw_sample` reports "N/A" for plain PCM streams on
// this ffprobe build, so the codec name is the only reliable source.
async function probeFormat(path: string): Promise<FileFormat> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=sample_rate,codec_name",
    "-of",
    "json",
    path,
  ]);
  const stream = JSON.parse(stdout).streams?.[0] ?? {};
  const codec = String(stream.codec_name ?? "unknown");
  const bitMatch = codec.match(/^pcm_([fsu])(\d+)(?:le|be)$/);
  const bitDepth = bitMatch ? `${bitMatch[2]}-bit${bitMatch[1] === "f" ? " float" : ""}` : codec;
  return { sampleRate: Number(stream.sample_rate ?? 0), bitDepth };
}

// `ebur128` prints a periodic reading roughly every 100ms while it processes
// (a live "t: ... I: ... LUFS ..." line) BEFORE the final "Summary:" block —
// every one of those periodic lines also matches a naive `I:` / `Peak:`
// regex. Parsing the first match instead of slicing to after the last
// "Summary:" silently returns whatever the loudness was in the first
// fraction of a second (confirmed: -70 LUFS on a real file) instead of the
// actual result. This is exactly the kind of bug that looks like it worked.
async function measureLoudness(path: string): Promise<Loudness> {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-af",
    "ebur128=peak=true",
    "-f",
    "null",
    "-",
  ]);
  const summaryIdx = stderr.lastIndexOf("Summary:");
  if (summaryIdx === -1) throw new Error(`no ebur128 summary in ffmpeg output for ${path}`);
  const summary = stderr.slice(summaryIdx);
  const integrated = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const truePeak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  const lra = Number(summary.match(/LRA:\s+(-?[\d.]+) LU\b/)?.[1]);
  if (Number.isNaN(integrated) || Number.isNaN(truePeak)) {
    throw new Error(`could not parse ebur128 summary for ${path}`);
  }
  return { integrated, truePeak, lra };
}

function needsProcessing(loudness: Loudness, targetI: number): boolean {
  const offBy = Math.abs(loudness.integrated - targetI);
  return offBy > LOUDNESS_TOLERANCE_LU || loudness.truePeak > SAFE_TRUE_PEAK_DBFS;
}

// Extracts the loudnorm two-pass measure fields from a `print_format=json`
// run. Unlike ebur128, loudnorm prints exactly one JSON block per
// invocation (no periodic spam — it's a two-pass gain filter, not a live
// meter), so taking the last `{...}` in the output is safe.
function parseLoudnormJson(stderr: string): Record<string, string> {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no loudnorm JSON in ffmpeg output");
  }
  return JSON.parse(stderr.slice(start, end + 1));
}

async function findWavFiles(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    const s = await stat(p);
    if (s.isDirectory()) {
      const entries = await readdir(p, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && extname(e.name).toLowerCase() === ".wav") out.push(join(p, e.name));
      }
    } else {
      out.push(p);
    }
  }
  return out.sort();
}

function fmtLU(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}

// ---------------------------------------------------------------- analyse --

async function analyse(paths: string[], targetI: number) {
  const files = await findWavFiles(paths);
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  for (const file of files) {
    console.log(file);
    try {
      const [format, loudness] = await Promise.all([probeFormat(file), measureLoudness(file)]);
      const offBy = loudness.integrated - targetI;
      const peakFlag = loudness.truePeak > SAFE_TRUE_PEAK_DBFS ? "  (over safe ceiling)" : "";
      console.log(`  format:    ${format.bitDepth} / ${format.sampleRate} Hz`);
      console.log(
        `  loudness:  ${loudness.integrated.toFixed(1)} LUFS  (target ${targetI}, ${fmtLU(offBy)} LU off)`,
      );
      console.log(`  true peak: ${fmtLU(loudness.truePeak)} dBFS${peakFlag}`);
      console.log(
        needsProcessing(loudness, targetI)
          ? "  -> needs processing"
          : "  -> fine as-is, no reprocessing needed",
      );
    } catch (err) {
      console.log(`  ! could not analyse: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log("");
  }
}

// ---------------------------------------------------------------- process --

async function processOne(
  input: string,
  targetI: number,
  targetLra: number,
  targetTp: number,
  force: boolean,
) {
  console.log(`\n${input}`);

  const format = await probeFormat(input);
  const before = await measureLoudness(input);
  console.log(
    `  before: ${format.bitDepth}/${format.sampleRate}Hz, ${before.integrated.toFixed(1)} LUFS, ${fmtLU(before.truePeak)} dBFS true peak`,
  );

  if (!force && !needsProcessing(before, targetI)) {
    console.log("  already within tolerance — skipping (use --force to reprocess anyway)");
    return;
  }

  // .mastered.mp3, never <name>.mp3 — a folder of fresh WAV exports often
  // sits next to that same set's already-published MP3s (same basename).
  // Writing directly to <name>.mp3 would silently overwrite one; this
  // suffix makes that collision impossible rather than something a flag
  // has to prevent. See the header comment's "Output naming" section.
  const outMp3 = join(dirname(input), `${basename(input, extname(input))}.mastered.mp3`);
  const prepWav = `${outMp3}.prep.wav`;
  const declipWav = `${outMp3}.declip.wav`;

  try {
    console.log("  1/4 normalizing format to 24-bit/48kHz");
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-nostats",
      "-i",
      input,
      "-ar",
      "48000",
      "-c:a",
      "pcm_s24le",
      prepWav,
    ]);

    console.log("  2/4 declip (default threshold — never raise this, see header)");
    const { stderr: declipLog } = await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-nostats",
      "-i",
      prepWav,
      "-af",
      "adeclip",
      "-c:a",
      "pcm_s24le",
      declipWav,
    ]);
    const detected = declipLog.match(/Detected clips in (\d+) of (\d+) samples \(([^)]+)\)/);
    if (detected)
      console.log(
        `       detected clips in ${detected[1]} of ${detected[2]} samples (${detected[3]})`,
      );

    console.log("  3/4 two-pass loudness match");
    const filterBase = `loudnorm=I=${targetI}:LRA=${targetLra}:TP=${targetTp}`;
    const { stderr: measureLog } = await run("ffmpeg", [
      "-hide_banner",
      "-nostats",
      "-i",
      declipWav,
      "-af",
      `${filterBase}:print_format=json`,
      "-f",
      "null",
      "-",
    ]);
    const measured = parseLoudnormJson(measureLog);
    // linear=true deliberately omitted — it's the default, and passing it
    // explicitly breaks the option parser in ffmpeg 8.0.1 (see header).
    const applyFilter =
      `${filterBase}:measured_I=${measured.input_i}:measured_LRA=${measured.input_lra}` +
      `:measured_TP=${measured.input_tp}:measured_thresh=${measured.input_thresh}` +
      `:offset=${measured.target_offset}:print_format=json`;
    const { stderr: applyLog } = await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-nostats",
      "-i",
      declipWav,
      "-af",
      applyFilter,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "320k",
      outMp3,
    ]);
    const applyResult = parseLoudnormJson(applyLog);
    if (applyResult.normalization_type !== "linear") {
      console.log(
        "       note: loudnorm fell back to dynamic gain rather than a pure linear shift for this file",
      );
    }

    console.log("  4/4 verifying independently (not trusting loudnorm's own report)");
    const after = await measureLoudness(outMp3);
    console.log(
      `       result: ${after.integrated.toFixed(1)} LUFS, ${fmtLU(after.truePeak)} dBFS true peak`,
    );
    if (Math.abs(after.integrated - targetI) > 0.5) {
      console.log(
        `       ! WARNING: ${Math.abs(after.integrated - targetI).toFixed(1)} LU off target — check manually`,
      );
    }

    console.log("  running generate-peaks.mjs");
    await run("node", [GENERATE_PEAKS, outMp3]);

    console.log(`  done: ${outMp3}`);
  } finally {
    await Promise.all([rm(prepWav, { force: true }), rm(declipWav, { force: true })]);
  }
}

// Named processFiles, not process — Node's global `process` (argv, exit)
// is used throughout main() below, and a same-named local function would
// shadow it silently rather than error, which is a much worse failure mode
// to debug than an odd-looking name.
async function processFiles(
  paths: string[],
  targetI: number,
  targetLra: number,
  targetTp: number,
  force: boolean,
) {
  const files = await findWavFiles(paths);
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }
  for (const file of files) {
    await processOne(file, targetI, targetLra, targetTp, force);
  }
}

// --------------------------------------------------------------------- CLI --

// A plain loop rather than index-arithmetic filtering: an earlier version
// computed the "skip this index" positions from `rest.indexOf("--target")`,
// which is -1 when the flag is absent — and -1 + 1 collides with real index
// 0, silently dropping the first path argument on every invocation without
// --target. Consuming flags as they're walked has no such sentinel to
// collide with.
function parseArgs(rest: string[]): { targetI: number; force: boolean; paths: string[] } {
  const paths: string[] = [];
  let targetI = DEFAULT_TARGET_I;
  let force = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--force") {
      force = true;
    } else if (a === "--target") {
      i++;
      targetI = Number(rest[i]);
    } else {
      paths.push(a);
    }
  }
  return { targetI, force, paths };
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const { targetI, force, paths } = parseArgs(args.slice(1));

  if (paths.length === 0 || (cmd !== "analyse" && cmd !== "process")) {
    console.error(
      "Usage:\n" +
        "  pnpm master-set analyse <folder-or-file...>\n" +
        "  pnpm master-set process <folder-or-file...> [--force] [--target -17.5]",
    );
    process.exit(1);
  }

  if (cmd === "analyse") {
    await analyse(paths, targetI);
  } else {
    await processFiles(paths, targetI, DEFAULT_TARGET_LRA, DEFAULT_TARGET_TP, force);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
