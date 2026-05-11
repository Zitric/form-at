#!/usr/bin/env tsx
/**
 * Generates social share banners:
 *  - `public/og-image.png` — global default (home, listings, fallback)
 *  - `public/og/djs/<id>.png` — one per DJ (photo + name composition)
 *
 * Format: 1200×630 (Twitter summary_large_image + Facebook OG standard).
 * Runs as part of `pnpm build` so the prod bundle always has fresh images.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { type DJ, djs } from "../app/data/djs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");

const WIDTH = 1200;
const HEIGHT = 630;
const BG = { r: 22, g: 22, b: 21 }; // brand "#161615"
const TAGLINE = "Techno · Electro · Dub · Glasgow";
const SITE = "formatglasgow.com";

// ── Wordmark prep (shared by every banner) ─────────────────────────────────
// Crop the FORM:AT mark out of the wordmark sprite the same way the live
// <Header> does (translate + clip). Then we have one buffer for the giant
// centered version (main banner) and one for the smaller corner version.
const wordmarkPath = join(PUBLIC, "wordmark.png");
const wmMeta = await sharp(wordmarkPath).metadata();
const wmSrcW = wmMeta.width ?? 0;
const wmSrcH = wmMeta.height ?? 0;
const cropX = Math.round(wmSrcW * 0.1732);
const cropY = Math.round(wmSrcH * 0.456);
const cropW = Math.round(wmSrcW * 0.65);
const cropH = Math.round(wmSrcH * 0.092);

async function makeWordmark(targetWidth: number) {
  const targetHeight = Math.round((cropH / cropW) * targetWidth);
  const buf = await sharp(wordmarkPath)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .png()
    .toBuffer();
  return { buf, width: targetWidth, height: targetHeight };
}

// ── 1) Main banner (home, listings, fallback) ──────────────────────────────
async function generateMainBanner() {
  const wm = await makeWordmark(780);
  const textSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <style>
    .tagline { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
               font-size: 28px; letter-spacing: 8px; fill: #cbcbcb; }
    .site    { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
               font-size: 22px; letter-spacing: 4px; fill: #c58538; }
  </style>
  <text x="50%" y="62%" text-anchor="middle" class="tagline">${TAGLINE.toUpperCase()}</text>
  <text x="50%" y="86%" text-anchor="middle" class="site">${SITE}</text>
</svg>`;
  const wmTop = Math.round((HEIGHT - wm.height) / 2) - 40;
  const wmLeft = Math.round((WIDTH - wm.width) / 2);

  const out = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { ...BG, alpha: 1 } },
  })
    .composite([
      { input: wm.buf, top: wmTop, left: wmLeft, blend: "screen" },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  const outPath = join(PUBLIC, "og-image.png");
  writeFileSync(outPath, out);
  log(outPath, out.length);
}

// ── 2) Per-DJ banner ───────────────────────────────────────────────────────
// Layout: photo cropped to 630×630 square on the left, FORM:AT wordmark top-right,
// DJ name large mid-right, role + city small below.
async function generateDJBanner(dj: DJ) {
  if (!dj.photo) return; // DJs without a photo fall back to the global banner

  const photoSrc = join(PUBLIC, "images", `${dj.photo}-1080.webp`);
  if (!existsSync(photoSrc)) {
    console.warn(`⚠ ${dj.id}: photo at ${photoSrc} doesn't exist — skipping OG.`);
    return;
  }

  // Photo: 630×630 square crop, left-aligned. cover crops centered.
  const photoBuf = await sharp(photoSrc)
    .resize(630, 630, { fit: "cover", position: "center" })
    .toBuffer();

  // Small wordmark for the top-right corner — keeps brand presence without
  // competing with the DJ name.
  const wm = await makeWordmark(260);

  // Text panel on the right (570px wide × 630 high).
  // Name uses an XML-safe escape for & and similar.
  const safeName = dj.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const role = dj.type === "resident" ? "RESIDENT" : "GUEST";
  const textSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <style>
    .name { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 52px; font-weight: 700; fill: #ffffff; letter-spacing: 2px; }
    .meta { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 22px; letter-spacing: 8px; fill: #cbcbcb; }
    .site { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 20px; letter-spacing: 4px; fill: #c58538; }
  </style>
  <text x="675" y="345" class="name">${safeName}</text>
  <text x="675" y="395" class="meta">${role} · GLASGOW</text>
  <text x="675" y="565" class="site">${SITE}</text>
</svg>`;

  const out = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { ...BG, alpha: 1 } },
  })
    .composite([
      { input: photoBuf, top: 0, left: 0 },
      // Wordmark top-right, 60px from top, 60px from right
      { input: wm.buf, top: 60, left: WIDTH - wm.width - 60, blend: "screen" },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  const outDir = join(PUBLIC, "og", "djs");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${dj.id}.png`);
  writeFileSync(outPath, out);
  log(outPath, out.length);
}

function log(path: string, bytes: number) {
  const kb = (bytes / 1024).toFixed(1);
  const rel = path.replace(`${ROOT}/`, "");
  console.log(`✓ ${rel} (${WIDTH}×${HEIGHT}, ${kb} KB)`);
}

// ── Run ────────────────────────────────────────────────────────────────────
await generateMainBanner();
for (const dj of djs) {
  await generateDJBanner(dj);
}
