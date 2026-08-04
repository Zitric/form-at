#!/usr/bin/env tsx
// Reads originals from images-source/, generates responsive AVIF + WebP variants
// in public/images/. Skips outputs that are already up-to-date (mtime newer than source).
// Run with: pnpm optimize-images   (or: --force to regenerate everything)
//
// Admin set-upload feature, PR5: also generates variants for uploaded-set
// artwork, fetched from each set's `artworkOriginalUrl` (R2) rather than a
// local file. Converted from a plain .mjs to .ts run via tsx (matching
// generate-og.ts/generate-sitemap.ts's own convention) specifically because
// this now needs to import the committed snapshot from ../app/data/sets —
// plain `node` can't import a .ts file without a build step; every other
// script here that needs a real TS import already goes through tsx.

import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, parse, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { sets } from "../app/data/sets";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "images-source");
const OUT = join(ROOT, "public/images");

// Uploaded-set variants live in their OWN directory, never `public/images/sets/`
// — that directory holds the 4 legacy sets' COMMITTED variants, and a
// path-based .gitignore can't tell an uploaded set's `{id}-640.avif` apart
// from a legacy one's `002-640.avif`; they're the same shape of file in the
// same folder. A separate directory sidesteps the ambiguity entirely
// (mirrors the existing `public/og/` precedent: a whole regenerated
// directory gitignored wholesale, see the root .gitignore). `Image.tsx`
// needs no change for this — it only ever resolves whatever base path
// `MusicSet.artwork` gives it (`/images/${artwork}-${w}.${ext}`), so an
// uploaded set's `artwork` field simply points here
// (`apps/admin/app/routes/api/sets.ts` sets it to `uploads/{id}`, not
// `sets/{id}`). Safe to change now, before this PR: zero uploaded sets
// exist yet, so there's no existing row using the old convention to migrate.
const UPLOADED_OUT = join(OUT, "uploads");

// Output one variant per (width × format). Sized for typical web layouts:
// 640px = mobile, 1080px = tablet / desktop. Keep in sync with the WIDTHS
// constant in apps/web/app/components/Image.tsx.
const WIDTHS = [640, 1080];
const FORMATS = [
  { ext: "avif" as const, options: { quality: 60, effort: 6 } },
  { ext: "webp" as const, options: { quality: 82 } },
];

const force = process.argv.includes("--force");

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && /\.(jpe?g|png|tiff?|webp|avif)$/i.test(e.name)) out.push(full);
  }
  return out;
}

async function tryStat(path: string) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

type Variant = { width: number; ext: "avif" | "webp"; bytes: number };

// Shared by `processOne` (git-tracked images) and `processUploadedSet` (R2
// artwork) — same WIDTHS/FORMATS sharp pipeline either way. What differs is
// the input source (a file path vs. fetched bytes) and the skip decision
// (`shouldSkip`): a local source has a real mtime to compare an existing
// output against; R2-fetched bytes don't have a meaningful local "source
// changed" signal, so uploaded-set variants skip on existence alone (see
// `processUploadedSet`) — once generated, an upload's artwork doesn't change
// without a re-upload, which this feature doesn't support yet (PR6 territory).
async function generateVariants(
  input: string | Buffer,
  outPathBase: string,
  shouldSkip: (outPath: string) => Promise<boolean>,
): Promise<{ srcWidth: number; maxWidth: number; variants: Variant[]; wroteAny: boolean }> {
  const meta = await sharp(input).metadata();
  const maxWidth = Math.max(...WIDTHS);
  const srcWidth = meta.width ?? maxWidth;

  // Don't upscale: cap target widths to the source width, dedupe.
  const targets = [...new Set(WIDTHS.map((w) => Math.min(w, srcWidth)))];

  const variants: Variant[] = [];
  let wroteAny = false;

  for (const w of targets) {
    for (const fmt of FORMATS) {
      const outPath = `${outPathBase}-${w}.${fmt.ext}`;
      if (!force && (await shouldSkip(outPath))) {
        const outStat = await tryStat(outPath);
        variants.push({ width: w, ext: fmt.ext, bytes: outStat?.size ?? 0 });
        continue;
      }

      const buffer = await sharp(input)
        .resize({ width: w, withoutEnlargement: true })
        [fmt.ext](fmt.options)
        .toBuffer();

      await sharp(buffer).toFile(outPath);
      variants.push({ width: w, ext: fmt.ext, bytes: buffer.length });
      wroteAny = true;
    }
  }

  return { srcWidth, maxWidth, variants, wroteAny };
}

type ProcessedResult = {
  rel: string;
  originalBytes: number;
  variants: Variant[];
  wroteAny: boolean;
};

async function processOne(srcPath: string): Promise<ProcessedResult> {
  const rel = relative(SRC, srcPath);
  const { dir, name } = parse(rel);
  const baseDir = join(OUT, dir);
  await mkdir(baseDir, { recursive: true });

  const srcStat = await stat(srcPath);
  const originalBytes = srcStat.size;

  const { srcWidth, maxWidth, variants, wroteAny } = await generateVariants(
    srcPath,
    join(baseDir, name),
    async (outPath) => {
      const outStat = await tryStat(outPath);
      return !!(outStat && outStat.mtimeMs >= srcStat.mtimeMs);
    },
  );

  // The <Image> component's srcset requests every width in WIDTHS. If the
  // source is smaller than the largest target, the optimizer can't produce a
  // matching variant (it doesn't upscale) and the browser will 404 on it.
  // Firefox in particular doesn't fall back to the <img src> default reliably
  // in that case, leading to silently-invisible images. Loud warning here so
  // it's caught at build time, not in production.
  if (srcWidth < maxWidth) {
    console.warn(
      `⚠ ${rel}: source is ${srcWidth}px wide, smaller than the max requested width (${maxWidth}px). Some browsers may render this image blank. Upload a larger source for best results.`,
    );
  }

  return { rel, originalBytes, variants, wroteAny };
}

type UploadedSetResult =
  | { id: string; status: "ok"; originalBytes: number; variants: Variant[]; wroteAny: boolean }
  | { id: string; status: "failed"; reason: string };

// Failure policy (deliberately different from generate-sets-snapshot.ts's
// fail-loudly-on-any-error design): a bad snapshot ships a broken catalogue
// to every visitor, so that script exits non-zero. A missing/failed variant
// here degrades to `Image.tsx`'s fallback (PR4) — the plain, un-optimized
// original renders correctly, just without responsive variants — so one
// set's failure (R2 unreachable, a 404'd artworkOriginalUrl, a file sharp
// can't decode) must not fail the whole build and block every other set's
// deploy. Caught per-set, logged with the reason, and skipped — mirrors
// this file's own existing precedent one function up (`processOne`'s
// undersized-source case is also a warning, not a thrown error).
export async function processUploadedSet(musicSet: {
  id: string;
  artworkOriginalUrl?: string;
}): Promise<UploadedSetResult> {
  const url = musicSet.artworkOriginalUrl;
  if (!url) return { id: musicSet.id, status: "failed", reason: "no artworkOriginalUrl" };

  try {
    await mkdir(UPLOADED_OUT, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const outPathBase = join(UPLOADED_OUT, musicSet.id);
    const { variants, wroteAny } = await generateVariants(buffer, outPathBase, async (outPath) => {
      // Existence-only — see generateVariants' comment for why mtime
      // comparison doesn't apply to R2-fetched bytes.
      return !!(await tryStat(outPath));
    });

    return { id: musicSet.id, status: "ok", originalBytes: buffer.length, variants, wroteAny };
  } catch (err) {
    return {
      id: musicSet.id,
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const srcStat = await tryStat(SRC);
  if (!srcStat) {
    console.log(`No images-source/ directory at ${SRC} — nothing to do for git-tracked images.`);
  } else {
    const sources = await walk(SRC);
    if (sources.length === 0) {
      console.log("images-source/ is empty. Drop some images in and re-run.");
    } else {
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
      if (mobileTotal > 0 || desktopTotal > 0) {
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
  }

  const uploadedSets = sets.filter((s) => s.artworkOriginalUrl);
  if (uploadedSets.length === 0) {
    console.log("\nNo uploaded sets with artworkOriginalUrl in the snapshot — nothing to do.");
    return;
  }

  console.log(`\nFound ${uploadedSets.length} uploaded set${uploadedSets.length === 1 ? "" : "s"}`);
  let uploadedOk = 0;
  let uploadedFailed = 0;
  for (const musicSet of uploadedSets) {
    const result = await processUploadedSet(musicSet);
    if (result.status === "failed") {
      uploadedFailed++;
      console.warn(
        `  ⚠ ${result.id}: could not generate variants (${result.reason}) — Image.tsx's fallback will render the plain original instead.`,
      );
      continue;
    }
    uploadedOk++;
    console.log(`  ${result.id}  (original: ${fmtBytes(result.originalBytes)})`);
    for (const v of result.variants) {
      console.log(
        `    ${String(v.width).padStart(4)}.${v.ext.padEnd(4)}  ${fmtBytes(v.bytes).padStart(8)}`,
      );
    }
  }
  console.log(`\nUploaded sets: ${uploadedOk} ok, ${uploadedFailed} failed (see warnings above)`);
}

// Guarded so importing this module (e.g. `processUploadedSet` from a unit
// test) doesn't trigger a full run of `main()` as a side effect — it did,
// before this guard, every time the module loaded regardless of how.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
