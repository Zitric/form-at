// The DJ Story image: a 1080×1920 JPEG drawn in the browser from the DJ's
// photo, to share to an Instagram story and promote their next night. Same
// frame, colours and type as the set Story video (storyVideo/layout.ts); a
// still, so no audio and no recording.
//
// Its own lazy chunk: only DjStorySheet imports it, and DjStorySheet is
// lazy (DjStoryHost). Never import it from always-loaded code (CLAUDE.md
// §1's lazy rule). It shares storyVideo/layout.ts and storyVideo/canvas.ts
// with the set Story's renderer, and nothing else.

import type { DJ } from "@form-at/data/djs";
import type { Event } from "@form-at/data/events";
import { colors } from "@form-at/ui/tokens";
import { nextLabelShort } from "~/utils/nextEventLabel";
import {
  WORDMARK_URL,
  context2d,
  createCanvas,
  drawWordmark,
  fillTrackedCentred,
  fitFont,
  font,
  loadImage,
  loadSpaceMono,
  roundRectPath,
} from "~/utils/storyVideo/canvas";
import {
  ARTWORK,
  CARD,
  COLORS,
  FRAME,
  MARGIN_X,
  META_SIZE,
  SITE,
  TITLE,
  WORDMARK,
  WORDMARK_HEIGHT,
  coverCrop,
} from "~/utils/storyVideo/layout";

// ── Treatments ────────────────────────────────────────────────────────────

/** How the card's photo is drawn. */
export type CardTone = "raw" | "duotone-gold";

/**
 * The background, always the card's photo heavily blurred and darkened:
 *   purple  — tinted brand purple (form:at's)
 *   neutral — untinted
 */
export type BackgroundTone = "purple" | "neutral";

/**
 * A photo treatment: the card's tone and the background's. The text, the
 * name, the event line and the wordmark are never treated.
 *
 *   format — the brand look and the default: a gold duotone card over the
 *            purple background
 *   raw    — the photo as it is, over the neutral background
 *
 * Don't add treatments that distort the photo (a glitch, scanlines): they
 * compete with the DJ for attention (IMPROVEMENTS.md #14).
 */
export const TREATMENTS = {
  format: { label: "form:at", card: "duotone-gold", background: "purple" },
  raw: { label: "raw", card: "raw", background: "neutral" },
} as const satisfies Record<string, { label: string; card: CardTone; background: BackgroundTone }>;

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

// ── Layout ────────────────────────────────────────────────────────────────

// Top to bottom, inside SAFE_ZONE (250–1580), under the shared WORDMARK
// (storyVideo/layout.ts). The card spans the content width; the name, the
// line and the site sit under it as one block. Nothing goes below
// SAFE_ZONE.bottom: Instagram's link sticker is placed there by hand.
// Baselines are for text; y is a top edge.
const CONTENT_WIDTH = FRAME.width - 2 * MARGIN_X;
export const DJ_STORY = {
  card: { y: WORDMARK.y + WORDMARK_HEIGHT + 50, size: CONTENT_WIDTH },
  name: { baselineY: 1372 },
  line: { baselineY: 1450, size: META_SIZE },
  site: { baselineY: 1530 },
} as const;

/**
 * The bracketed line under the name: the DJ's next night, the page's short
 * label with the venue ("004 · sat 05.12 · stereo": the wordmark above says
 * Form:at, and the shorter line keeps its full 46px), or, with none
 * announced, their role ("resident" / "guest").
 */
export function storyLine(type: DJ["type"], nextEvent: Event | null): string {
  return nextEvent ? nextLabelShort(nextEvent, { venue: true }) : type;
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
    loadImage(WORDMARK_URL).catch(() => null),
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
  const [r0, g0, b0] = hexToRgb(colors.black);
  const [r1, g1, b1] = hexToRgb(colors.gold);
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
  g.putImageData(image, 0, 0);
  return canvas;
}

/** The background: `toned` covering the frame, blurred, tinted when purple, darkened. */
function drawBackground(
  g: CanvasRenderingContext2D,
  toned: HTMLCanvasElement,
  background: BackgroundTone,
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
  if (background === "purple") {
    // The purple's hue and saturation over the blur's own light and dark.
    g.globalCompositeOperation = "color";
    g.fillStyle = colors.purple;
    g.fillRect(0, 0, FRAME.width, FRAME.height);
    g.globalCompositeOperation = "source-over";
  }
  g.globalAlpha = BACKGROUND_BLUR.darken;
  g.fillStyle = COLORS.background;
  g.fillRect(0, 0, FRAME.width, FRAME.height);
  g.restore();
}

// "[ 004 · sat 05.12 · stereo ]": gold brackets, grey text, as
// BracketLabel draws them on the page.
function drawBracketLine(g: CanvasRenderingContext2D, text: string, y: number) {
  fitFont(g, `[ ${text} ]`, 400, DJ_STORY.line.size, CONTENT_WIDTH);
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
  const { card, background } = TREATMENTS[input.treatment];
  const toned = input.assets.photo ? tonePhoto(input.assets.photo, card) : null;

  g.fillStyle = COLORS.background;
  g.fillRect(0, 0, FRAME.width, FRAME.height);
  if (toned) drawBackground(g, toned, background);

  if (input.assets.wordmark) drawWordmark(g, input.assets.wordmark);

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
  fitFont(g, input.name, TITLE.weight, TITLE.size, CONTENT_WIDTH);
  g.fillText(input.name, FRAME.width / 2, DJ_STORY.name.baselineY);
  drawBracketLine(g, input.line, DJ_STORY.line.baselineY);

  g.fillStyle = COLORS.text;
  g.font = font(SITE.weight, SITE.size);
  fillTrackedCentred(g, SITE.text, FRAME.width / 2, DJ_STORY.site.baselineY, SITE.size);
}

/** JPEG at 0.9: as PNG the same frame runs to 1–2MB, ~4MB with a noisy photo. */
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
