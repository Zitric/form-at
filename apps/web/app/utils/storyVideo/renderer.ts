// Draws the Story video frame. Everything that doesn't change while
// recording — background, brand, card, names, times, full-set timeline — is
// drawn once into a static layer, and the excerpt bars are pre-rendered in
// both colours. A frame is then a few drawImage calls, a clip and the
// spectrum's 72 rects, cheap enough for a phone at 60fps.
//
// Browser-only (canvas, FontFaceSet, Image). Positions and colours come from
// layout.ts; nothing here decides layout.

import { fmtTimestamp } from "~/utils/fmt";
import {
  ARTWORK,
  BACKGROUND,
  BRAND,
  CARD,
  COLORS,
  EXCERPT,
  EXCERPT_BARS,
  FONT_FAMILY,
  FRAME,
  MARGIN_X,
  META,
  PILL,
  type Rect,
  SPECTRUM_STRIP,
  TEXT_XS,
  TIMELINE,
  TITLE,
  TRACKING_WIDEST,
  backgroundRect,
  barRow,
  coverCrop,
} from "./layout";
import { type SampleSource, bandLevels, smoothedSpectrum, spectrumBands } from "./spectrum";

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_FAMILY}`;

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext("2d");
  if (!g) throw new Error("2D canvas unavailable");
  return g;
}

export interface StoryAssets {
  /** null when every URL failed: the frame draws a placeholder instead. */
  artwork: HTMLImageElement | null;
  /** Which URL the artwork came from, for diagnostics. */
  artworkUrl: string | null;
  /** The DJ's photo for the card; null when there's none or it failed to load. */
  photo: HTMLImageElement | null;
  /** The photo URL that was tried, for diagnostics; null when there was none. */
  photoUrl: string | null;
  /** false means text will render in a fallback face. */
  fontsLoaded: boolean;
}

/**
 * A cross-origin URL gets its own cache entry for the CORS load. The CDN only
 * adds `Access-Control-Allow-Origin` (and `Vary: Origin`) when the request
 * carries an Origin, and caches the plain answer for 4 hours. So once the
 * page's own <img> (Image.tsx's fallback to the uploaded original) has
 * fetched the same URL without CORS, the browser reuses that cached copy for
 * this CORS request and blocks it. R2 serves by path and ignores the query.
 * Same-origin URLs need no CORS and are left alone.
 */
export function corsImageUrl(url: string, pageOrigin: string): string {
  const parsed = new URL(url, pageOrigin);
  if (parsed.origin === pageOrigin) return url;
  parsed.searchParams.set("cors", "1");
  return parsed.href;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Without CORS the canvas is tainted, and captureStream() then throws a
    // SecurityError. Every artwork origin answers with ACAO *; the DJ photos
    // are same-origin.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = corsImageUrl(url, window.location.origin);
  });
}

/**
 * Waits for Space Mono in both weights the frame uses, loads the first
 * artwork URL that works (the optimised webp, then the original), and the
 * DJ's photo when there is one. A photo that fails to load leaves the card
 * to the artwork.
 */
export async function loadStoryAssets(
  artworkUrls: readonly string[],
  photoUrl: string | null = null,
): Promise<StoryAssets> {
  const photo = photoUrl ? loadImage(photoUrl).catch(() => null) : Promise.resolve(null);
  await Promise.allSettled([
    document.fonts.load(font(META.weight, META.size)),
    document.fonts.load(font(TITLE.weight, TITLE.size)),
  ]);
  const faces = Array.from(document.fonts).filter(
    (f) => f.family.replace(/"/g, "") === "Space Mono" && f.style === "normal",
  );
  const loadedWeights = new Set(faces.filter((f) => f.status === "loaded").map((f) => f.weight));
  const fontsLoaded = loadedWeights.has("400") && loadedWeights.has("700");

  for (const url of artworkUrls) {
    try {
      return {
        artwork: await loadImage(url),
        artworkUrl: url,
        photo: await photo,
        photoUrl,
        fontsLoaded,
      };
    } catch {
      // try the next one
    }
  }
  return { artwork: null, artworkUrl: null, photo: await photo, photoUrl, fontsLoaded };
}

export interface StoryFrameInput {
  djName: string;
  /** The set's title, e.g. "Form:at 003", as the player's meta line shows it. */
  title: string;
  date?: string;
  /** Where the excerpt starts in the set, and the set's length, in seconds. */
  startSeconds: number;
  setSeconds: number;
  /** The decoded excerpt, and where its first played sample sits in it. */
  excerpt: { audio: SampleSource; offsetSeconds: number; durationSeconds: number };
  /** The player's peaks.json values for the whole set. */
  setPeaks: readonly number[];
  /** The background, and the card when there's no photo. */
  artwork: CanvasImageSource | null;
  /** The DJ's photo for the card; null or absent puts the artwork there. */
  photo?: CanvasImageSource | null;
}

export interface StoryFrame {
  layer: HTMLCanvasElement;
  unplayed: HTMLCanvasElement;
  played: HTMLCanvasElement;
  barsX: number;
  barsWidth: number;
  /** Room left around the pre-rendered bars for the glow to spread into. */
  pad: number;
  /** Tallest the spectrum may draw, after SPECTRUM_STRIP.clearance. */
  spectrumHeight: number;
  /** The excerpt as a share of the full-set timeline, before the 12px minimum. */
  markerTrueWidth: number;
}

function sourceSize(img: CanvasImageSource): { width: number; height: number } {
  if (img instanceof HTMLImageElement)
    return { width: img.naturalWidth, height: img.naturalHeight };
  const sized = img as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  return { width: Number(sized.width), height: Number(sized.height) };
}

/** Fills the square at (x, y) with `img`, cropped (coverCrop), never stretched. */
function drawCropped(
  g: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  size: number,
  focusY: number,
) {
  const { width, height } = sourceSize(img);
  const crop: Rect = coverCrop(width, height, focusY);
  g.drawImage(img, crop.x, crop.y, crop.width, crop.height, x, y, size, size);
}

function drawBackground(g: CanvasRenderingContext2D, artwork: CanvasImageSource) {
  const { width, height } = sourceSize(artwork);
  const at = backgroundRect(width / height);
  g.save();
  g.globalAlpha = BACKGROUND.alpha;
  if (BACKGROUND.flipped) {
    g.translate(0, 2 * at.y + at.height);
    g.scale(1, -1);
  }
  g.drawImage(artwork, at.x, at.y, at.width, at.height);
  g.restore();
}

// Bars centred on the row at 0.9 of its height, floored so silence still
// shows, and scaled to the row's own loudest peak — Waveform.tsx's rule, so a
// quieter master still fills the row. With `justify`, the bars are spread so
// the first starts at x and the last ends at x + width exactly (gaps vary by
// at most a pixel); otherwise they sit at a fixed step from x.
function drawBarRow(
  g: CanvasRenderingContext2D,
  peaks: readonly number[],
  x: number,
  y: number,
  width: number,
  height: number,
  barWidth: number,
  gap: number,
  minHeight: number,
  justify = false,
) {
  const { count } = barRow(width, barWidth, gap);
  const step = justify && count > 1 ? (width - barWidth) / (count - 1) : barWidth + gap;
  const scale = 1 / Math.max(...peaks, 0.001);
  for (let i = 0; i < count; i++) {
    const peak = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
    const barHeight = Math.max(minHeight, Math.min(peak * scale, 1) * height * EXCERPT_BARS.fill);
    g.fillRect(Math.round(x + i * step), y + (height - barHeight) / 2, barWidth, barHeight);
  }
}

/** One peak per bar: the largest |sample| across channels in that bar's slice of the excerpt. */
function excerptPeaks(excerpt: StoryFrameInput["excerpt"], bars: number): number[] {
  const { audio, offsetSeconds, durationSeconds } = excerpt;
  const start = Math.floor(offsetSeconds * audio.sampleRate);
  const block = Math.max(1, Math.floor((durationSeconds * audio.sampleRate) / bars));
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) =>
    audio.getChannelData(c),
  );
  return Array.from({ length: bars }, (_, i) => {
    let max = 0;
    const from = start + i * block;
    const to = Math.min(from + block, audio.length);
    for (const data of channels)
      for (let j = from; j < to; j++) max = Math.max(max, Math.abs(data[j] ?? 0));
    return max;
  });
}

// Letter-spacing drawn glyph by glyph rather than via ctx.letterSpacing,
// whose support varies. Centred on x.
function fillTrackedCentred(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
) {
  const spacing = TRACKING_WIDEST * size;
  const chars = Array.from(text);
  const width =
    chars.reduce((sum, ch) => sum + g.measureText(ch).width, 0) + spacing * (chars.length - 1);
  let cx = x - width / 2;
  g.textAlign = "left";
  for (const ch of chars) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + spacing;
  }
}

function fitFont(
  g: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  maxWidth: number,
) {
  let s = size;
  g.font = font(weight, s);
  while (s > 20 && g.measureText(text).width > maxWidth) {
    s -= 2;
    g.font = font(weight, s);
  }
}

function roundRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  // arcTo rather than ctx.roundRect, so the result doesn't depend on which
  // browsers ship roundRect.
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draws everything static once, and pre-renders the excerpt bars. */
export function prepareStoryFrame(input: StoryFrameInput): StoryFrame {
  const contentWidth = FRAME.width - 2 * MARGIN_X;
  const layer = createCanvas(FRAME.width, FRAME.height);
  const g = context2d(layer);
  g.fillStyle = COLORS.background;
  g.fillRect(0, 0, FRAME.width, FRAME.height);
  if (input.artwork) drawBackground(g, input.artwork);

  // Brand.
  g.fillStyle = COLORS.text;
  g.font = font(BRAND.weight, BRAND.size);
  fillTrackedCentred(g, BRAND.text, FRAME.width / 2, BRAND.baselineY, BRAND.size);

  // Card: the DJ's photo, else the artwork; square, rounded, with the
  // player's hairline border.
  const cardX = (FRAME.width - ARTWORK.size) / 2;
  g.save();
  roundRectPath(g, cardX, ARTWORK.y, ARTWORK.size, ARTWORK.size, ARTWORK.radius);
  g.clip();
  if (input.photo) {
    drawCropped(g, input.photo, cardX, ARTWORK.y, ARTWORK.size, CARD.photoFocusY);
  } else if (input.artwork) {
    drawCropped(g, input.artwork, cardX, ARTWORK.y, ARTWORK.size, 0.5);
  } else {
    g.fillStyle = "#222222";
    g.fillRect(cardX, ARTWORK.y, ARTWORK.size, ARTWORK.size);
  }
  g.restore();
  g.strokeStyle = COLORS.hairline;
  g.lineWidth = ARTWORK.borderWidth;
  roundRectPath(g, cardX, ARTWORK.y, ARTWORK.size, ARTWORK.size, ARTWORK.radius);
  g.stroke();

  // DJ name, and the player's "@ <title> · <date>" meta line.
  g.textAlign = "center";
  g.fillStyle = COLORS.title;
  fitFont(g, input.djName, TITLE.weight, TITLE.size, contentWidth);
  g.fillText(input.djName, FRAME.width / 2, TITLE.baselineY);
  const meta = `@ ${[input.title, input.date].filter(Boolean).join(" · ")}`;
  g.fillStyle = COLORS.text;
  fitFont(g, meta, META.weight, META.size, contentWidth);
  g.fillText(meta, FRAME.width / 2, META.baselineY);

  // Two rows share one layout: times in a column either side, sized to the
  // widest of the four, and the bars centred in the width between. The
  // timeline then spans exactly the excerpt bars' ink.
  const startLabel = fmtTimestamp(input.startSeconds);
  const endLabel = fmtTimestamp(input.startSeconds + input.excerpt.durationSeconds);
  const setStartLabel = fmtTimestamp(0);
  const setEndLabel = fmtTimestamp(input.setSeconds);
  g.font = font(400, TEXT_XS);
  const timeWidth = Math.ceil(
    Math.max(
      ...[startLabel, endLabel, setStartLabel, setEndLabel].map((l) => g.measureText(l).width),
    ),
  );
  const rowWidth = contentWidth - 2 * (timeWidth + EXCERPT.timeGap);
  const { count: barCount, inkWidth } = barRow(rowWidth, EXCERPT_BARS.width, EXCERPT_BARS.gap);
  const barsX = Math.round(MARGIN_X + timeWidth + EXCERPT.timeGap + (rowWidth - inkWidth) / 2);
  const barsWidth = inkWidth;
  const fillTimes = (left: string, right: string, y: number) => {
    g.fillStyle = COLORS.text;
    g.textBaseline = "middle";
    g.textAlign = "right";
    g.fillText(left, MARGIN_X + timeWidth, y);
    g.textAlign = "left";
    g.fillText(right, MARGIN_X + contentWidth - timeWidth, y);
    g.textBaseline = "alphabetic";
  };
  fillTimes(startLabel, endLabel, EXCERPT.y + EXCERPT.height / 2);
  fillTimes(setStartLabel, setEndLabel, TIMELINE.y + TIMELINE.height / 2);

  // Full-set timeline, with the excerpt's marker. The excerpt on a 2h set is ~2px
  // wide, so the marker never draws thinner than minMarkerWidth.
  g.fillStyle = TIMELINE.color;
  drawBarRow(
    g,
    input.setPeaks,
    barsX,
    TIMELINE.y,
    barsWidth,
    TIMELINE.height,
    TIMELINE.barWidth,
    TIMELINE.gap,
    EXCERPT_BARS.minHeight,
    true,
  );
  const markerTrueWidth = (input.excerpt.durationSeconds / input.setSeconds) * barsWidth;
  const markerWidth = Math.max(markerTrueWidth, TIMELINE.minMarkerWidth);
  const markerCentre =
    barsX +
    ((input.startSeconds + input.excerpt.durationSeconds / 2) / input.setSeconds) * barsWidth;
  const clampX = (x: number, width: number) =>
    Math.min(Math.max(x, barsX), barsX + barsWidth - width);
  g.fillStyle = COLORS.played;
  g.fillRect(
    clampX(markerCentre - markerWidth / 2, markerWidth),
    TIMELINE.y - TIMELINE.markerOverhang,
    markerWidth,
    TIMELINE.height + 2 * TIMELINE.markerOverhang,
  );

  // Position pill over the marker.
  const label = fmtTimestamp(input.startSeconds);
  g.font = font(400, PILL.fontSize);
  const pillWidth = g.measureText(label).width + 2 * PILL.paddingX;
  const pillX = clampX(markerCentre - pillWidth / 2, pillWidth);
  const pillY = PILL.bottomY - PILL.height;
  g.fillStyle = COLORS.background;
  g.fillRect(pillX, pillY, pillWidth, PILL.height);
  g.strokeStyle = COLORS.hairline;
  g.lineWidth = PILL.borderWidth;
  g.strokeRect(pillX, pillY, pillWidth, PILL.height);
  g.fillStyle = COLORS.played;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(label, pillX + PILL.paddingX, pillY + PILL.height / 2 + 1);
  g.textBaseline = "alphabetic";

  // Excerpt bars, pre-rendered once in each colour; `pad` leaves room for the
  // glow to spread past the bars.
  const pad = Math.ceil(EXCERPT_BARS.glowBlur * 2);
  const peaks = excerptPeaks(input.excerpt, barCount);
  const bars = (color: string, glow: boolean) => {
    const canvas = createCanvas(barsWidth + 2 * pad, EXCERPT.height + 2 * pad);
    const b = context2d(canvas);
    if (glow) {
      b.shadowColor = EXCERPT_BARS.glowColor;
      b.shadowBlur = EXCERPT_BARS.glowBlur;
    }
    // The shadow pass: a dark blurred copy first, the bars on top, so no
    // bar's shadow lands on its neighbour. save/restore keeps the glow set
    // above for the bars themselves.
    b.save();
    b.shadowColor = EXCERPT_BARS.shadowColor;
    b.shadowBlur = EXCERPT_BARS.shadowBlur;
    b.fillStyle = EXCERPT_BARS.shadowColor;
    drawBarRow(
      b,
      peaks,
      pad,
      pad,
      barsWidth,
      EXCERPT.height,
      EXCERPT_BARS.width,
      EXCERPT_BARS.gap,
      EXCERPT_BARS.minHeight,
    );
    b.restore();
    b.fillStyle = color;
    drawBarRow(
      b,
      peaks,
      pad,
      pad,
      barsWidth,
      EXCERPT.height,
      EXCERPT_BARS.width,
      EXCERPT_BARS.gap,
      EXCERPT_BARS.minHeight,
    );
    return canvas;
  };

  const timelineBottom = TIMELINE.y + TIMELINE.height + TIMELINE.markerOverhang;
  const spectrumHeight = Math.min(
    SPECTRUM_STRIP.maxHeight,
    SPECTRUM_STRIP.baselineY - (timelineBottom + SPECTRUM_STRIP.clearance),
  );

  return {
    layer,
    unplayed: bars(COLORS.unplayed, false),
    played: bars(COLORS.played, true),
    barsX,
    barsWidth,
    pad,
    spectrumHeight,
    markerTrueWidth,
  };
}

/**
 * One frame. `progress` is 0..1 through the excerpt; `levels` is 0..1 per
 * spectrum band, from the live analyser or previewSpectrumLevels.
 */
export function drawStoryFrame(
  g: CanvasRenderingContext2D,
  frame: StoryFrame,
  progress: number,
  levels: ArrayLike<number>,
) {
  const { layer, unplayed, played, barsX, barsWidth, pad } = frame;
  g.drawImage(layer, 0, 0);
  g.drawImage(unplayed, barsX - pad, EXCERPT.y - pad);
  // The gold layer has the same geometry, so it covers the purple exactly;
  // clipping it to the played width is the whole progress animation. The clip
  // starts at the left pad so the first bar keeps its glow.
  const playedWidth = barsWidth * Math.min(Math.max(progress, 0), 1);
  if (playedWidth > 0) {
    g.save();
    g.beginPath();
    g.rect(barsX - pad, EXCERPT.y - pad, pad + playedWidth, played.height);
    g.clip();
    g.drawImage(played, barsX - pad, EXCERPT.y - pad);
    g.restore();
  }
  drawSpectrum(g, levels, frame.spectrumHeight);
}

function drawSpectrum(g: CanvasRenderingContext2D, levels: ArrayLike<number>, maxHeight: number) {
  g.save();
  g.globalAlpha = SPECTRUM_STRIP.alpha;
  g.fillStyle = SPECTRUM_STRIP.color;
  const step = FRAME.width / levels.length;
  for (let i = 0; i < levels.length; i++) {
    const height = Math.max(2, (levels[i] ?? 0) * maxHeight);
    g.fillRect(
      i * step + SPECTRUM_STRIP.gap / 2,
      SPECTRUM_STRIP.baselineY - height,
      step - SPECTRUM_STRIP.gap,
      height,
    );
  }
  g.restore();
}

/**
 * Spectrum levels for a frame with no live audio (the preview): what the
 * live strip would show at `progress` through the excerpt, computed from the
 * decoded audio by the analyser's own algorithm.
 */
export function previewSpectrumLevels(
  excerpt: StoryFrameInput["excerpt"],
  progress: number,
): Float32Array {
  const { audio, offsetSeconds, durationSeconds } = excerpt;
  const bands = spectrumBands(audio.sampleRate);
  const at = Math.round((offsetSeconds + durationSeconds * progress) * audio.sampleRate);
  return bandLevels(smoothedSpectrum(audio, at, bands), bands);
}
