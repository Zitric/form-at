// The approved Story video frame, as constants, and the geometry derived from
// them. This file is the design reference: the header of
// spikes/instagram-story/index.html records the first approved version, before
// the DJ photo card, the artwork background and the equal-width rows.
//
// Positions are absolute pixels on the 1080×1920 frame. Sizes that echo the
// app's own UI are its Tailwind values scaled by UI_SCALE, from an assumed
// 390px-wide phone viewport, so the video reads like the player it came from.

import { colors } from "@form-at/ui/tokens";

export const FRAME = { width: 1080, height: 1920 } as const;

// Where Instagram's own overlays sit, checked on a phone: nothing meaningful
// is covered. Everything meaningful stays inside; only the decorative
// spectrum strip goes below SAFE_ZONE.bottom, on purpose.
export const SAFE_ZONE = { top: 250, bottom: 1580 } as const;

export const MARGIN_X = 90;
const UI_SCALE = FRAME.width / 390;
const scaled = (px: number) => Math.round(px * UI_SCALE);

export const COLORS = {
  background: colors.black,
  played: colors.gold,
  // The player's purple, lightened for the story only (brand hue and
  // saturation, 55% lightness instead of 37%). Over the artwork background
  // the brand purple read at ~2:1 on dark artworks; this is ~3.8:1 there.
  // Keep it clearly darker than gold (1.56:1 against it): an unplayed bar
  // as bright as a played one would stop reading as "not yet".
  unplayed: "#6b6bae",
  text: colors.grey,
  // tokens.ts has no white; the player's DJ name is Tailwind's text-white.
  title: "#ffffff",
  hairline: "rgba(203, 203, 203, 0.3)",
} as const;

// The site's own Space Mono (/fonts, preloaded by rootHead.ts); the fallbacks
// only show if it failed to load, which renderer.ts reports.
export const FONT_FAMILY = '"Space Mono", ui-monospace, monospace';
export const TEXT_XS = scaled(12);
export const TEXT_SM = scaled(14);
export const TRACKING_WIDEST = 0.1; // em, Tailwind's tracking-widest

// The only length the picker offers. A product choice, not Instagram's limit
// (a story segment can run 60s): viewers drop off after ~15s. Everything
// else — the window, the zoomed strip, the recording — derives from this.
export const EXCERPT_SECONDS = 15;

// Top to bottom. Baselines are for text; y is a top edge.
export const BRAND = {
  text: "formatglasgow.com",
  baselineY: SAFE_ZONE.top + 52,
  size: 42,
  weight: 400,
} as const;
// The card: the DJ's photo, or the set's artwork when the set has no DJ or
// the DJ no photo. Both are cropped to the square, never stretched.
export const ARTWORK = {
  y: SAFE_ZONE.top + 116,
  size: 560,
  radius: scaled(4),
  borderWidth: 2,
} as const;
export const CARD = {
  // Where a portrait photo is cropped to the square, as a fraction of its
  // height: the faces in the roster's photos sit in the upper half.
  photoFocusY: 0.35,
} as const;

// The set's artwork behind everything, sharp, at its own aspect ratio, kept
// subtle by opacity alone (no blur: it should read as its shape).
export const BACKGROUND = {
  alpha: 0.4,
  // The artwork's drawn height; its width follows its aspect ratio.
  height: 2100,
  // Mirrored top to bottom, so its colon lands behind the card (see
  // backgroundRect) while the artwork still covers the whole frame.
  flipped: true,
} as const;

// The Form:at colon in the branded artworks, as fractions of the artwork's
// width and height. Measured from the current artworks (002 and 003; the
// Seafield artwork has none): re-measure if the artwork template changes,
// or the colon shows beside the card.
export const ARTWORK_COLON = { x: [0.466, 0.544], y: [0.603, 0.753] } as const;

export const TITLE = { baselineY: 1041, size: 84, weight: 700 } as const;
export const META = { baselineY: 1108, size: TEXT_SM, weight: 400 } as const;

// The excerpt row mirrors PlayerSeeker: start and end times either side of
// the bars (text-xs, gap-3), bars in the width left over. The timeline below
// has 0:00 and the set's length in the same two columns, and spans exactly
// the excerpt bars' ink: the two rows start and end on the same pixel.
export const EXCERPT = { y: 1192, height: 150, timeGap: scaled(12) } as const;

// Bar style mirrors Waveform.tsx (3px bars, 1px gaps, centred at 0.9 of the
// height with a 2px floor, gold glow), scaled.
export const EXCERPT_BARS = {
  width: scaled(3),
  gap: scaled(1),
  fill: 0.9,
  minHeight: 2 * UI_SCALE,
  glowBlur: 4 * UI_SCALE,
  glowColor: "rgba(197, 133, 56, 0.35)",
  // A dark, blurred copy of the bars drawn under them, so they stand off any
  // artwork. On Seafield's light background it takes the gold from 1.5:1 to
  // 3.3:1 and the lighter purple to 2.2:1; on dark artwork it barely shows.
  shadowColor: "rgba(22, 22, 21, 0.85)",
  shadowBlur: 12,
} as const;

// Position pill ("30:00"; the set's length is beside the timeline), centred on
// the timeline marker, clamped to the timeline.
export const PILL = {
  bottomY: 1456,
  height: 40,
  fontSize: 26,
  paddingX: 14,
  borderWidth: 2,
} as const;

export const TIMELINE = {
  y: 1472,
  height: 40,
  barWidth: 2,
  gap: 1,
  // 60%, not the player's 35%: over the artwork background 35% fell to
  // ~2.6:1 on dark artworks and 1.7:1 on Seafield; 60% is ~5:1 and 2.3:1.
  color: "rgba(203, 203, 203, 0.6)",
  // The true width of the excerpt on a 2h set is ~2px; the marker never draws thinner.
  minMarkerWidth: 12,
  markerOverhang: 6,
} as const;

// Decorative, bottom-anchored, deliberately inside Instagram's bottom zone.
// Subordinate to the excerpt bars: no glow, reduced opacity.
export const SPECTRUM_STRIP = {
  baselineY: FRAME.height,
  maxHeight: 330,
  // The tallest bar never comes closer than this to the timeline.
  clearance: 70,
  gap: 4,
  alpha: 0.45,
  color: colors.gold,
} as const;

/**
 * Ink extents [top, bottom] of each element in the approved render, measured
 * in the spike with measureText. Text ink depends on the font, so these are
 * recorded rather than derived; the tests hold the rest of the layout to
 * them.
 */
export const APPROVED_INK = {
  brand: [273, 310],
  artwork: [366, 926],
  title: [982, 1042],
  meta: [1080, 1109],
  excerpt: [1192, 1342],
  pill: [1416, 1456],
  timeline: [1466, 1518],
} as const satisfies Record<string, readonly [number, number]>;

// ── Geometry derived from the constants above ─────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The square of a `width`×`height` source that fills the card: the full short side, centred across, at `focusY` down. */
export function coverCrop(width: number, height: number, focusY: number): Rect {
  const side = Math.min(width, height);
  const x = (width - side) / 2;
  const y = Math.min(Math.max(0, height * focusY - side / 2), height - side);
  return { x, y, width: side, height: side };
}

/**
 * Where the background artwork is drawn, in frame pixels, before any mirroring:
 * centred across, and placed down so the colon's centre (mirrored when
 * BACKGROUND.flipped) sits on the card's centre.
 */
export function backgroundRect(aspect: number): Rect {
  const height = BACKGROUND.height;
  const width = height * aspect;
  const colonMid = (ARTWORK_COLON.y[0] + ARTWORK_COLON.y[1]) / 2;
  const colonY = BACKGROUND.flipped ? 1 - colonMid : colonMid;
  return {
    x: (FRAME.width - width) / 2,
    y: ARTWORK.y + ARTWORK.size / 2 - colonY * height,
    width,
    height,
  };
}

/** Where the colon lands in the frame, for an artwork drawn at backgroundRect. */
export function backgroundColonRect(aspect: number): Rect {
  const bg = backgroundRect(aspect);
  const [top, bottom] = BACKGROUND.flipped
    ? [1 - ARTWORK_COLON.y[1], 1 - ARTWORK_COLON.y[0]]
    : ARTWORK_COLON.y;
  return {
    x: bg.x + ARTWORK_COLON.x[0] * bg.width,
    y: bg.y + top * bg.height,
    width: (ARTWORK_COLON.x[1] - ARTWORK_COLON.x[0]) * bg.width,
    height: (bottom - top) * bg.height,
  };
}

/** How many bars of `barWidth` + `gap` fit in `width`, and the width their ink spans. */
export function barRow(width: number, barWidth: number, gap: number) {
  const count = Math.max(0, Math.floor((width + gap) / (barWidth + gap)));
  return { count, inkWidth: count > 0 ? count * (barWidth + gap) - gap : 0 };
}
