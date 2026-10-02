// Generates `peaks-fine.bin` for every catalogued set that has no fine peaks
// yet, and PRINTS the commands that would publish them: one R2 upload and one
// D1 UPDATE per set, then the snapshot regeneration. It runs none of them —
// R2 and D1 writes are the repo owner's to run (CLAUDE.md §2), so the output
// is something to read, check, then paste.
//
// Usage: pnpm -C apps/web backfill-fine-peaks [--out dir] [--only id,id]
//   --out   where the .bin files go (default: apps/web/fine-peaks-backfill/,
//           gitignored, so they outlive the run until the printed commands
//           upload them; the commands use absolute paths either way). A
//           re-run overwrites the files and picks new version folders, which
//           makes any earlier output's commands void.
//   --only  restrict to these set ids
// Requires ffmpeg on PATH. Reads each set's MP3 straight from the CDN, so a
// 2h20 set is ~340MB of download but never more than ~150MB of memory.
//
// The set list is the committed snapshot (packages/data/src/sets.generated.ts),
// so regenerate it first if D1 has changed since. Sets whose snapshot entry
// already has `finePeaks` are skipped.
//
// Each file goes into a NEW version folder, `sets/{id}/{version}/peaks-fine.bin`,
// never into an existing one: versioned folders are immutable (r2Keys.ts),
// and the legacy flat-keyed sets have no folder to reuse. The UPDATE only
// fills an empty `fine_peaks`, so pasting the output twice can't repoint a set.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { FINE_PEAKS_PER_SECOND, encodeFinePeaks } from "@form-at/data/finePeaks";
import { FINE_PEAKS_FILE, generateUploadVersion, versionedSetKey } from "@form-at/data/r2Keys";
import { AUDIO_ORIGIN, sets } from "@form-at/data/sets";
import { generatePeaks } from "./generate-peaks";

const R2_BUCKET = "form-at-sets";
const D1_DATABASE = "form-at-analytics";

const { values: args } = parseArgs({
  options: { out: { type: "string" }, only: { type: "string" } },
});

const only = args.only?.split(",").map((id) => id.trim());
const todo = sets.filter((s) => !s.finePeaks && (!only || only.includes(s.id)));
if (only) {
  const unknown = only.filter((id) => !sets.some((s) => s.id === id));
  if (unknown.length) {
    console.error(`not in the snapshot: ${unknown.join(", ")}`);
    process.exit(1);
  }
}
if (!todo.length) {
  console.log("every set in the snapshot already has fine peaks — nothing to do");
  process.exit(0);
}

const outDir = args.out
  ? resolve(args.out)
  : fileURLToPath(new URL("../fine-peaks-backfill/", import.meta.url));
await mkdir(outDir, { recursive: true });

function fmtLength(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const keys: string[] = [];
const puts: string[] = [];
const updates: string[] = [];
for (const set of todo) {
  const started = Date.now();
  const { fine } = await generatePeaks(set.src);
  const bytes = encodeFinePeaks(fine);
  const key = versionedSetKey(set.id, generateUploadVersion(), FINE_PEAKS_FILE);
  const file = join(outDir, `${set.id}.${FINE_PEAKS_FILE}`);
  await writeFile(file, bytes);
  const seconds = fine.length / FINE_PEAKS_PER_SECOND;
  keys.push(key);
  console.log(
    `✓ ${set.id}: ${fmtLength(seconds)} (catalogue says ${set.duration ?? "?"}), ${fine.length} values, ${(bytes.length / 1024).toFixed(1)} KiB, ${((Date.now() - started) / 1000).toFixed(1)}s → ${file}`,
  );
  puts.push(
    `pnpm exec wrangler r2 object put ${R2_BUCKET}/${key} --remote --file "${file}" --content-type application/octet-stream`,
  );
  updates.push(
    `pnpm exec wrangler d1 execute ${D1_DATABASE} --remote --command "UPDATE sets SET fine_peaks = '${AUDIO_ORIGIN}/${key}' WHERE id = '${set.id}' AND fine_peaks IS NULL"`,
  );
}

console.log(`
Nothing below has been run. From the repo root, in this order:

# 1. Upload the files to R2
${puts.join("\n")}

# 2. Check one is served, before pointing D1 at it (expect 200, application/octet-stream)
curl -sI ${AUDIO_ORIGIN}/${keys[0]} | grep -iE "^(HTTP|content-type|content-length)"

# 3. Point each set at its file (only fills an empty fine_peaks)
${updates.join("\n")}

# 4. Verify
pnpm exec wrangler d1 execute ${D1_DATABASE} --remote --command "SELECT id, fine_peaks FROM sets ORDER BY created_at DESC"

# 5. Refresh the committed snapshot
pnpm -C apps/web generate-sets-snapshot`);
