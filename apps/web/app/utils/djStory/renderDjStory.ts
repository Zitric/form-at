// The DJ Story image: a 1080×1920 JPEG drawn in the browser from the DJ's
// photo, to share to an Instagram story and promote their next night. Same
// frame, colours and type as the set Story video (storyVideo/layout.ts); a
// still, so no audio and no recording.
//
// Its own lazy chunk: only DjStorySheet imports it, and DjStorySheet is
// lazy (DjStoryButton). Never import it from always-loaded code (CLAUDE.md
// §1's lazy rule). It shares storyVideo/layout.ts and storyVideo/canvas.ts
// with the set Story's renderer, and nothing else.

import type { DJ } from "@form-at/data/djs";
import type { Event } from "@form-at/data/events";
import { colors } from "@form-at/ui/tokens";
import { nextLabelLong } from "~/utils/nextEventLabel";
import {
  context2d,
  createCanvas,
  fillTrackedCentred,
  fitFont,
  font,
  loadImage,
  loadSpaceMono,
  roundRectPath,
} from "~/utils/storyVideo/canvas";
import {
  ARTWORK,
  BRAND,
  CARD,
  COLORS,
  FRAME,
  MARGIN_X,
  SAFE_ZONE,
  TEXT_SM,
  TITLE,
  coverCrop,
} from "~/utils/storyVideo/layout";

// ── Treatments ────────────────────────────────────────────────────────────

/** How the card's photo is drawn. */
export type CardTone = "raw" | "duotone-gold" | "duotone-purple" | "scan";

/**
 * A photo treatment: the card's tone, and how the background (the same photo,
 * always heavily blurred) is coloured. The text is never treated.
 *
 *   format — the brand look and the default: a gold duotone card over a
 *            purple-tinted background
 *   raw    — the photo as it is, over a dark neutral background
 *   gold   — gold duotone, card and background
 *   purple — purple duotone, card and background
 *   scan   — the photo with grain and scanlines, over a dark neutral background
 */
export const TREATMENTS = {
  format: { label: "form:at", card: "duotone-gold", tint: colors.purple },
  raw: { label: "raw", card: "raw", tint: null },
  gold: { label: "gold", card: "duotone-gold", tint: null },
  purple: { label: "purple", card: "duotone-purple", tint: null },
  scan: { label: "scan", card: "scan", tint: null },
} as const satisfies Record<string, { label: string; card: CardTone; tint: string | null }>;

export type PhotoTreatment = keyof typeof TREATMENTS;
export const DEFAULT_TREATMENT: PhotoTreatment = "format";
/** In the sheet's order. */
export const TREATMENT_IDS = Object.keys(TREATMENTS) as PhotoTreatment[];

// The background is the photo shrunk to BACKGROUND_BLUR.scale of the frame
// and scaled back up, smoothed, in two steps: a blur strong enough that no
// lettering in the photo (a T-shirt print, a headshell logo) stays legible
// behind the text. Not ctx.filter: Safari only got canvas filters in 18, and a
// missing blur would leave exactly that lettering readable. Then darkened, so
// the text always sits on near-black.
const BACKGROUND_BLUR = { scale: 1 / 48, darken: 0.68 } as const;

const DUOTONE_HIGHLIGHT: Record<"duotone-gold" | "duotone-purple", string> = {
  "duotone-gold": colors.gold,
  "duotone-purple": COLORS.unplayed,
};

// ── Layout ────────────────────────────────────────────────────────────────

// Top to bottom, inside SAFE_ZONE (250–1580). Baselines are for text.
export const DJ_STORY = {
  wordmark: { y: SAFE_ZONE.top, width: 560 },
  card: { y: SAFE_ZONE.top + 150, size: 720 },
  name: { baselineY: 1215 },
  line: { baselineY: 1290, size: TEXT_SM },
  // 1330–1500 stays empty: room for Instagram's link sticker.
  site: { baselineY: SAFE_ZONE.bottom - 20 },
} as const;

// The wordmark's ink inside /wordmark.png (1500×1500): the same crop the
// header shows (Header.tsx's -17.32% / -45.6% translate in a 280×40 box at
// 430px wide).
const WORDMARK_SRC = { x: 260, y: 684, width: 977, height: 140 } as const;

/**
 * The bracketed line under the name: the DJ's next night
 * ("form:at 004 · sat 05.12 · stereo"), or, with none announced, their role
 * ("resident" / "guest").
 */
export function storyLine(type: DJ["type"], nextEvent: Event | null): string {
  return nextEvent ? nextLabelLong(nextEvent) : type;
}

/** The shared file's name: formatglasgow-<dj id>.jpg. */
export function storyFileName(djId: string): string {
  return `formatglasgow-${djId}.jpg`;
}

// ── Assets ────────────────────────────────────────────────────────────────

export interface DjStoryAssets {
  /** null when there's no photo or it failed: the card shows a placeholder. */
  photo: HTMLImageElement | null;
  wordmark: HTMLImageElement | null;
  /** false means text will render in a fallback face. */
  fontsLoaded: boolean;
}

/** The DJ photo the page shows (Image.tsx's 1080 webp), the wordmark, and Space Mono. */
export async function loadDjStoryAssets(photo: string | undefined): Promise<DjStoryAssets> {
  const [photoImg, wordmark, fontsLoaded] = await Promise.all([
    photo ? loadImage(`/images/${photo}-1080.webp`).catch(() => null) : Promise.resolve(null),
    loadImage("/wordmark.png").catch(() => null),
    loadSpaceMono(DJ_STORY.line.size, TITLE.size),
  ]);
  return { photo: photoImg, wordmark, fontsLoaded };
}

// ── Drawing ───────────────────────────────────────────────────────────────

export interface DjStoryInput {
  name: string;
  /** storyLine's text, drawn in brackets. */
  line: string;
  assets: DjStoryAssets;
  treatment: PhotoTreatment;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// A small seeded PRNG (mulberry32), so the scan grain is the same every time
// the same photo is drawn: the preview is exactly what gets shared.
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The luminance range a duotone maps onto its two tones: the 2nd and 98th
 * percentiles of `lums` (0–1), so a few blown highlights or crushed shadows
 * don't set it. Never narrower than 0.1, so a flat photo isn't stretched into
 * noise.
 */
export function duotoneRange(lums: ArrayLike<number>): [number, number] {
  if (lums.length === 0) return [0, 1];
  const sorted = Float32Array.from(lums).sort();
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const lo = at(0.02);
  const hi = Math.max(at(0.98), lo + 0.1);
  return [lo, Math.min(1, hi)];
}

/** The photo in the given tone, at its own size (at most 1080 on the long side). */
function tonePhoto(photo: HTMLImageElement, tone: CardTone): HTMLCanvasElement {
  const scale = Math.min(1, 1080 / Math.max(photo.naturalWidth, photo.naturalHeight));
  const w = Math.round(photo.naturalWidth * scale);
  const h = Math.round(photo.naturalHeight * scale);
  const canvas = createCanvas(w, h);
  const g = context2d(canvas, { willReadFrequently: true });
  g.drawImage(photo, 0, 0, w, h);
  if (tone === "raw") return canvas;

  const image = g.getImageData(0, 0, w, h);
  const px = image.data;
  if (tone === "scan") {
    const random = seeded(w * 31 + h);
    for (let i = 0; i < px.length; i += 4) {
      const row = Math.floor(i / 4 / w);
      const grain = (random() - 0.5) * 46;
      // Every third row dimmed, as a CRT's gaps between lines.
      const line = row % 3 === 2 ? 0.62 : 1;
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.max(0, Math.min(255, ((px[i + c] ?? 0) + grain) * line));
      }
    }
  } else {
    const [r0, g0, b0] = hexToRgb(colors.black);
    const [r1, g1, b1] = hexToRgb(DUOTONE_HIGHLIGHT[tone]);
    const lums = new Float32Array(px.length / 4);
    for (let i = 0; i < px.length; i += 4) {
      lums[i / 4] =
        (0.2126 * (px[i] ?? 0) + 0.7152 * (px[i + 1] ?? 0) + 0.0722 * (px[i + 2] ?? 0)) / 255;
    }
    // Stretched to the photo's own range first, so a dark photo still spans
    // black to gold instead of sinking into the shadow tone.
    const [lo, hi] = duotoneRange(lums);
    for (let i = 0; i < px.length; i += 4) {
      const lum = Math.min(1, Math.max(0, ((lums[i / 4] ?? 0) - lo) / (hi - lo)));
      // A gentle S-curve, so the two tones separate instead of meeting in mud.
      const t = lum * lum * (3 - 2 * lum);
      px[i] = r0 + (r1 - r0) * t;
      px[i + 1] = g0 + (g1 - g0) * t;
      px[i + 2] = b0 + (b1 - b0) * t;
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}

/** The background: the toned photo covering the frame, blurred, tinted, darkened. */
function drawBackground(
  g: CanvasRenderingContext2D,
  toned: HTMLCanvasElement,
  tint: string | null,
) {
  // Cover the frame's 9:16 from the photo's centre.
  const aspect = FRAME.width / FRAME.height;
  const sh = Math.min(toned.width / aspect, toned.height);
  const sw = sh * aspect;
  const sx = (toned.width - sw) / 2;
  const sy = (toned.height - sh) / 2;

  // Down to a tiny canvas and back up through a middle size: the two smoothed
  // upscales are the blur.
  const tinyW = Math.max(1, Math.round(FRAME.width * BACKGROUND_BLUR.scale));
  const tinyH = Math.max(1, Math.round(FRAME.height * BACKGROUND_BLUR.scale));
  const tiny = createCanvas(tinyW, tinyH);
  const t = context2d(tiny);
  t.imageSmoothingQuality = "high";
  t.drawImage(toned, sx, sy, sw, sh, 0, 0, tinyW, tinyH);
  const mid = createCanvas(tinyW * 6, tinyH * 6);
  const m = context2d(mid);
  m.imageSmoothingQuality = "high";
  m.drawImage(tiny, 0, 0, mid.width, mid.height);

  g.save();
  g.imageSmoothingQuality = "high";
  g.drawImage(mid, 0, 0, FRAME.width, FRAME.height);
  if (tint) {
    // The tint's hue and saturation over the blur's own light and dark.
    g.globalCompositeOperation = "color";
    g.fillStyle = tint;
    g.fillRect(0, 0, FRAME.width, FRAME.height);
    g.globalCompositeOperation = "source-over";
  }
  g.globalAlpha = BACKGROUND_BLUR.darken;
  g.fillStyle = COLORS.background;
  g.fillRect(0, 0, FRAME.width, FRAME.height);
  g.restore();
}

// "[ form:at 004 · sat 05.12 · stereo ]": gold brackets, grey text, as
// BracketLabel draws them on the page.
function drawBracketLine(g: CanvasRenderingContext2D, text: string, y: number) {
  fitFont(g, `[ ${text} ]`, 400, DJ_STORY.line.size, FRAME.width - 2 * MARGIN_X);
  const parts = ["[ ", text, " ]"];
  const widths = parts.map((s) => g.measureText(s).width);
  let x = FRAME.width / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  g.textAlign = "left";
  for (const [i, part] of parts.entries()) {
    g.fillStyle = i === 1 ? COLORS.text : colors.gold;
    g.fillText(part, x, y);
    x += widths[i] ?? 0;
  }
}

/** Draws the whole image onto a FRAME-sized canvas. */
export function drawDjStory(canvas: HTMLCanvasElement, input: DjStoryInput) {
  const g = context2d(canvas);
  const { card, tint } = TREATMENTS[input.treatment];
  const toned = input.assets.photo ? tonePhoto(input.assets.photo, card) : null;

  g.fillStyle = COLORS.background;
  g.fillRect(0, 0, FRAME.width, FRAME.height);
  if (toned) drawBackground(g, toned, tint);

  // The pixel wordmark, as the header shows it: screen-blended, so its black
  // ground drops out.
  if (input.assets.wordmark) {
    const { width, y } = DJ_STORY.wordmark;
    const height = (width * WORDMARK_SRC.height) / WORDMARK_SRC.width;
    g.save();
    g.globalCompositeOperation = "screen";
    g.drawImage(
      input.assets.wordmark,
      WORDMARK_SRC.x,
      WORDMARK_SRC.y,
      WORDMARK_SRC.width,
      WORDMARK_SRC.height,
      (FRAME.width - width) / 2,
      y,
      width,
      height,
    );
    g.restore();
  }

  // The card: the photo cropped to the square at CARD.photoFocusY, rounded,
  // with the player's hairline border, like the set Story's card.
  const { size, y: cardY } = DJ_STORY.card;
  const cardX = (FRAME.width - size) / 2;
  g.save();
  roundRectPath(g, cardX, cardY, size, size, ARTWORK.radius);
  g.clip();
  if (toned) {
    const crop = coverCrop(toned.width, toned.height, CARD.photoFocusY);
    g.drawImage(toned, crop.x, crop.y, crop.width, crop.height, cardX, cardY, size, size);
  } else {
    g.fillStyle = "#222222";
    g.fillRect(cardX, cardY, size, size);
  }
  g.restore();
  g.strokeStyle = COLORS.hairline;
  g.lineWidth = ARTWORK.borderWidth;
  roundRectPath(g, cardX, cardY, size, size, ARTWORK.radius);
  g.stroke();

  // Name, then the next night or the DJ's role.
  g.textAlign = "center";
  g.fillStyle = COLORS.title;
  fitFont(g, input.name, TITLE.weight, TITLE.size, FRAME.width - 2 * MARGIN_X);
  g.fillText(input.name, FRAME.width / 2, DJ_STORY.name.baselineY);
  drawBracketLine(g, input.line, DJ_STORY.line.baselineY);

  g.fillStyle = COLORS.text;
  g.font = font(BRAND.weight, BRAND.size);
  fillTrackedCentred(g, BRAND.text, FRAME.width / 2, DJ_STORY.site.baselineY, BRAND.size);
}

/** JPEG at 0.9: a photo with grain runs to ~4MB as PNG. */
const JPEG_QUALITY = 0.9;

/** A drawn canvas as the JPEG that's shared. */
export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}
