// Canvas helpers shared by the two Story renderers: the set Story video's
// frame (renderer.ts) and the DJ Story image (utils/djStory/renderDjStory.ts).
// Browser-only (canvas, FontFaceSet, Image). Light on purpose: each renderer
// is its own lazy chunk, and this is all they share besides layout.ts, so
// nothing here may import a renderer, the recorder or the spectrum.

import { FONT_FAMILY, type Rect, TRACKING_WIDEST, coverCrop } from "./layout";

export const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_FAMILY}`;

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** `willReadFrequently` for a canvas whose pixels are read back (getImageData). */
export function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const g = canvas.getContext("2d", options);
  if (!g) throw new Error("2D canvas unavailable");
  return g;
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

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Without CORS the canvas is tainted: captureStream() and toBlob() then
    // throw a SecurityError. Every artwork origin answers with ACAO *; the DJ
    // photos and the wordmark are same-origin.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = corsImageUrl(url, window.location.origin);
  });
}

/**
 * Waits for Space Mono at the given sizes, in both weights the frames use
 * (400 and 700). false means text will render in a fallback face.
 */
export async function loadSpaceMono(regularSize: number, boldSize: number): Promise<boolean> {
  await Promise.allSettled([
    document.fonts.load(font(400, regularSize)),
    document.fonts.load(font(700, boldSize)),
  ]);
  const faces = Array.from(document.fonts).filter(
    (f) => f.family.replace(/"/g, "") === "Space Mono" && f.style === "normal",
  );
  const loadedWeights = new Set(faces.filter((f) => f.status === "loaded").map((f) => f.weight));
  return loadedWeights.has("400") && loadedWeights.has("700");
}

export function sourceSize(img: CanvasImageSource): { width: number; height: number } {
  if (img instanceof HTMLImageElement)
    return { width: img.naturalWidth, height: img.naturalHeight };
  const sized = img as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  return { width: Number(sized.width), height: Number(sized.height) };
}

/** Fills the square at (x, y) with `img`, cropped (coverCrop), never stretched. */
export function drawCropped(
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

// Letter-spacing drawn glyph by glyph rather than via ctx.letterSpacing,
// whose support varies. Centred on x.
export function fillTrackedCentred(
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

/** Sets g.font, stepping the size down by 2px (to 20px at least) until `text` fits `maxWidth`. */
export function fitFont(
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

export function roundRectPath(
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
