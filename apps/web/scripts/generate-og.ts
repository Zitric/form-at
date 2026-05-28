#!/usr/bin/env tsx
/**
 * Generates social share banners:
 *  - `public/og-image.png` — global default (home, listings, fallback)
 *  - `public/og/djs/<id>.png` — one per DJ (photo + name composition)
 *  - `public/og/sets/<id>.png` — one per set (artwork + artist + title)
 *  - `public/og/events/<id>.png` — one per event (flyer + title + date)
 *
 * Format: 1200×630 (Twitter summary_large_image + Facebook OG standard).
 * Runs as part of `pnpm build` so the prod bundle always has fresh images.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { type DJ, djs } from "../app/data/djs";
import { events, type Event } from "../app/data/events";
import { type MusicSet, sets } from "../app/data/sets";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");

const WIDTH = 1200;
const HEIGHT = 630;
const BG = { r: 22, g: 22, b: 21 }; // brand "#161615"
const TAGLINE = "Techno · Electro · Dub · Glasgow";
const SITE = "formatglasgow.com";
// Center of the right panel (the 630..1200 strip beside the photo). Wordmark
// + every text line align to this so the column reads as a single stack.
const PANEL_CENTER_X = (630 + WIDTH) / 2;

// ── Wordmark prep (shared by every banner) ─────────────────────────────────
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

// ── Utility: Safe SVG Escaping ─────────────────────────────────────────────
// Safely handles undefined/null values without crashing the build
function escapeSvg(s: string | undefined | null) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  const wmTop = Math.round((HEIGHT - wm.height) / 4);
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

// ── Shared composition: 630×630 image left + content right ─────────────────
const TEXT_STYLES = `
    .title { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
             font-size: 52px; font-weight: 700; fill: #ffffff; letter-spacing: 2px; }
    .meta  { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
             font-size: 22px; letter-spacing: 8px; fill: #cbcbcb; }
    .sub   { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
             font-size: 22px; fill: #cbcbcb; }
    .site  { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
             font-size: 20px; letter-spacing: 4px; fill: #c58538; }
`;

async function composeMediaBanner(args: {
  imagePath: string;
  textInnerSvg: string;
  outDir: string;
  outName: string;
}) {
  const photoBuf = await sharp(args.imagePath)
    .resize(630, 630, { fit: "cover", position: "center" })
    .toBuffer();

  const wm = await makeWordmark(260);

  // Wordmark centered horizontally in the right panel (x: 630..1200),
  // sitting in the upper quarter so titles/meta have room below it.
  const wmLeft = Math.round(PANEL_CENTER_X - wm.width / 2);
  const wmTop = Math.round(HEIGHT / 4 - wm.height / 2);

  const textSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <style>${TEXT_STYLES}</style>
  ${args.textInnerSvg}
</svg>`;

  const out = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { ...BG, alpha: 1 } },
  })
    .composite([
      { input: photoBuf, top: 0, left: 0 },
      { input: wm.buf, top: wmTop, left: wmLeft, blend: "screen" },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  mkdirSync(args.outDir, { recursive: true });
  const outPath = join(args.outDir, args.outName);
  writeFileSync(outPath, out);
  log(outPath, out.length);
}

// ── 2) Per-DJ banner ───────────────────────────────────────────────────────
async function generateDJBanner(dj: DJ) {
  if (!dj.photo) return;

  const photoSrc = join(PUBLIC, "images", `${dj.photo}-1080.webp`);
  if (!existsSync(photoSrc)) {
    console.warn(`⚠ ${dj.id}: photo at ${photoSrc} doesn't exist — skipping OG.`);
    return;
  }

  const role = dj.type === "resident" ? "RESIDENT" : "GUEST";
  await composeMediaBanner({
    imagePath: photoSrc,
    textInnerSvg: `
      <text x="${PANEL_CENTER_X}" y="345" text-anchor="middle" class="title">${escapeSvg(dj.name)}</text>
      <text x="${PANEL_CENTER_X}" y="395" text-anchor="middle" class="meta">${role} · GLASGOW</text>
      <text x="${PANEL_CENTER_X}" y="565" text-anchor="middle" class="site">${SITE}</text>
    `,
    outDir: join(PUBLIC, "og", "djs"),
    outName: `${dj.id}.png`,
  });
}

// ── 3) Per-set banner ──────────────────────────────────────────────────────
async function generateSetBanner(set: MusicSet) {
  if (!set.artwork) return;

  const artworkSrc = join(PUBLIC, "images", `${set.artwork}-1080.webp`);
  if (!existsSync(artworkSrc)) {
    console.warn(`⚠ ${set.id}: artwork at ${artworkSrc} doesn't exist — skipping OG.`);
    return;
  }

  await composeMediaBanner({
    imagePath: artworkSrc,
    textInnerSvg: `
      <text x="${PANEL_CENTER_X}" y="315" text-anchor="middle" class="title">${escapeSvg(set.artist)}</text>
      <text x="${PANEL_CENTER_X}" y="365" text-anchor="middle" class="sub">${escapeSvg(set.title)}</text>
      <text x="${PANEL_CENTER_X}" y="405" text-anchor="middle" class="sub" fill="#888">${escapeSvg(set.date)}</text>
      <text x="${PANEL_CENTER_X}" y="565" text-anchor="middle" class="site">${SITE}</text>
    `,
    outDir: join(PUBLIC, "og", "sets"),
    outName: `${set.id}.png`,
  });
}

// ── 4) Per-event banner ────────────────────────────────────────────────────
async function generateEventBanner(event: Event) {
  if (!event.flyer) return;

  const flyerSrc = join(PUBLIC, "images", `${event.flyer}-1080.webp`);
  if (!existsSync(flyerSrc)) {
    console.warn(`⚠ ${event.id}: flyer at ${flyerSrc} doesn't exist — skipping OG.`);
    return;
  }

  await composeMediaBanner({
    imagePath: flyerSrc,
    textInnerSvg: `
      <text x="${PANEL_CENTER_X}" y="315" text-anchor="middle" class="title">${escapeSvg(event.title)}</text>
      <text x="${PANEL_CENTER_X}" y="365" text-anchor="middle" class="sub">${escapeSvg(event.date)}</text>
      <text x="${PANEL_CENTER_X}" y="405" text-anchor="middle" class="sub" fill="#888">${escapeSvg(event.venue)}</text>
      <text x="${PANEL_CENTER_X}" y="565" text-anchor="middle" class="site">${SITE}</text>
    `,
    outDir: join(PUBLIC, "og", "events"),
    outName: `${event.id}.png`,
  });
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
for (const set of sets) {
  await generateSetBanner(set);
}
for (const event of events) {
  await generateEventBanner(event);
}
