#!/usr/bin/env node
// Reads originals from images-source/, generates responsive AVIF + WebP variants
// in public/images/. Skips outputs that are already up-to-date (mtime newer than source).
// Run with: pnpm optimize-images   (or: --force to regenerate everything)

import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, parse, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "images-source");
const OUT = join(ROOT, "public/images");

// Output one variant per (width × format). Sized for typical web layouts:
// 640px = mobile, 1080px = tablet / desktop @1x, 1920px = desktop @2x or hero.
const WIDTHS = [640, 1080, 1920];
const FORMATS = [
  { ext: "avif", options: { quality: 60, effort: 6 } },
  { ext: "webp", options: { quality: 82 } },
];

const force = process.argv.includes("--force");

const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && /\.(jpe?g|png|tiff?|webp|avif)$/i.test(e.name)) out.push(full);
  }
  return out;
}

async function tryStat(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function processOne(srcPath) {
  const rel = relative(SRC, srcPath);
  const { dir, name } = parse(rel);
  const baseDir = join(OUT, dir);
  await mkdir(baseDir, { recursive: true });

  const srcStat = await stat(srcPath);
  const originalBytes = srcStat.size;
  const meta = await sharp(srcPath).metadata();
  const srcWidth = meta.width ?? Math.max(...WIDTHS);

  // Don't upscale: cap target widths to the source width, dedupe.
  const targets = [...new Set(WIDTHS.map((w) => Math.min(w, srcWidth)))];

  // [{ width, ext, bytes }] for every variant produced this run (or already on disk).
  const variants = [];
  let wroteAny = false;

  for (const w of targets) {
    for (const fmt of FORMATS) {
      const outPath = join(baseDir, `${name}-${w}.${fmt.ext}`);
      const outStat = await tryStat(outPath);
      if (!force && outStat && outStat.mtimeMs >= srcStat.mtimeMs) {
        variants.push({ width: w, ext: fmt.ext, bytes: outStat.size });
        continue;
      }

      const buffer = await sharp(srcPath)
        .resize({ width: w, withoutEnlargement: true })
        [fmt.ext](fmt.options)
        .toBuffer();

      await sharp(buffer).toFile(outPath);
      variants.push({ width: w, ext: fmt.ext, bytes: buffer.length });
      wroteAny = true;
    }
  }

  return { rel, originalBytes, variants, wroteAny };
}

async function main() {
  const srcStat = await tryStat(SRC);
  if (!srcStat) {
    console.log(`No images-source/ directory at ${SRC} — nothing to do.`);
    return;
  }

  const sources = await walk(SRC);
  if (sources.length === 0) {
    console.log("images-source/ is empty. Drop some images in and re-run.");
    return;
  }

  console.log(`Found ${sources.length} source image${sources.length === 1 ? "" : "s"}`);
  if (force) console.log("--force: regenerating all variants");
  console.log("");

  let processed = 0;
  let skipped = 0;
  let mobileTotal = 0; // sum of smallest AVIF (what a phone visitor downloads)
  let desktopTotal = 0; // sum of largest AVIF (what a hi-DPI desktop visitor downloads)
  let originalTotal = 0;

  for (const src of sources) {
    const result = await processOne(src);
    originalTotal += result.originalBytes;
    if (result.wroteAny) processed++;
    else skipped++;

    if (/[\s]/.test(result.rel)) {
      console.log(`  ⚠ ${result.rel}  (filename has spaces — consider renaming to kebab-case)`);
    } else {
      console.log(`  ${result.rel}  (original: ${fmtBytes(result.originalBytes)})`);
    }

    for (const v of result.variants) {
      const pct = (((result.originalBytes - v.bytes) / result.originalBytes) * 100).toFixed(0);
      const smaller = v.bytes < result.originalBytes;
      console.log(
        `    ${String(v.width).padStart(4)}.${v.ext.padEnd(4)}  ${fmtBytes(v.bytes).padStart(8)}  ${smaller ? `${pct}% smaller` : `${(-pct).toString()}% larger`}`,
      );
    }

    const avifs = result.variants.filter((v) => v.ext === "avif");
    if (avifs.length > 0) {
      const smallest = avifs.reduce((a, b) => (a.width < b.width ? a : b));
      const largest = avifs.reduce((a, b) => (a.width > b.width ? a : b));
      mobileTotal += smallest.bytes;
      desktopTotal += largest.bytes;
    }
    console.log("");
  }

  console.log(`Processed ${processed}, skipped ${skipped} (up-to-date)`);
  if (sources.length > 0 && (mobileTotal > 0 || desktopTotal > 0)) {
    console.log("");
    console.log("Per-visitor data (one variant served, picked by browser):");
    console.log(`  Mobile  (smallest AVIF):  ${fmtBytes(mobileTotal)}`);
    console.log(`  Desktop (largest AVIF):   ${fmtBytes(desktopTotal)}`);
    if (originalTotal > 0) {
      const mobileRatio = ((1 - mobileTotal / originalTotal) * 100).toFixed(0);
      console.log(
        `  vs originals (${fmtBytes(originalTotal)}):  ${mobileRatio}% smaller for mobile`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
