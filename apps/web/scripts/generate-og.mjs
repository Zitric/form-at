#!/usr/bin/env node
/**
 * Generates the social share banner at `public/og-image.png`.
 * Run with `pnpm og` whenever the wordmark, tagline or brand colours change.
 *
 * Format: 1200×630 (Twitter `summary_large_image` + Facebook open graph standard).
 * Composition: brand black background + centered wordmark + tagline below.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const WIDTH = 1200;
const HEIGHT = 630;
const BG = { r: 22, g: 22, b: 21 }; // brand "#161615" (--color-black)
const TAGLINE = "Analog soul in a digital world";
const SITE = "formatglasgow.com";

// Pull the wordmark and inspect its metadata so we can scale proportionally.
const wordmarkPath = join(ROOT, "public", "wordmark.png");
const wordmark = sharp(wordmarkPath);
const wmMeta = await wordmark.metadata();

// Wordmark is a square sprite with the "FORM:AT" mark in the top-left portion.
// We cropped the same region in the live <Header> via translate, so mirror that
// here using sharp's `extract` to pull out just the letterform.
const wmSrcW = wmMeta.width ?? 0;
const wmSrcH = wmMeta.height ?? 0;
// These ratios mirror the Header's `-translate-x-[17.32%] -translate-y-[45.6%]`
// with the 310×44 visible viewport. The sprite has the FORM:AT mark sitting in
// roughly the same top-left region.
const cropX = Math.round(wmSrcW * 0.1732);
const cropY = Math.round(wmSrcH * 0.456);
const cropW = Math.round(wmSrcW * 0.65);
const cropH = Math.round(wmSrcH * 0.092);

const targetWordmarkWidth = 780; // ~65% of canvas width — bold but with breathing room
const targetWordmarkHeight = Math.round((cropH / cropW) * targetWordmarkWidth);

const wordmarkCropped = await sharp(wordmarkPath)
  .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
  .resize(targetWordmarkWidth, targetWordmarkHeight, { fit: "fill" })
  .png()
  .toBuffer();

// Text via SVG — sharp doesn't have a native text API, but it composites SVGs
// reliably. We use Helvetica/system sans because brand fonts aren't installed
// system-wide; the wordmark itself carries the brand identity.
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

const wordmarkTop = Math.round((HEIGHT - targetWordmarkHeight) / 2) - 40;
const wordmarkLeft = Math.round((WIDTH - targetWordmarkWidth) / 2);

const out = await sharp({
  create: {
    width: WIDTH,
    height: HEIGHT,
    channels: 4,
    background: { ...BG, alpha: 1 },
  },
})
  .composite([
    { input: wordmarkCropped, top: wordmarkTop, left: wordmarkLeft },
    { input: Buffer.from(textSvg), top: 0, left: 0 },
  ])
  .png({ compressionLevel: 9 })
  .toBuffer();

const outPath = join(ROOT, "public", "og-image.png");
writeFileSync(outPath, out);

const kb = (out.length / 1024).toFixed(1);
console.log(`✓ Wrote ${outPath} (${WIDTH}×${HEIGHT}, ${kb} KB)`);
