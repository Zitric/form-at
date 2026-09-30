// The approved Story video frame, as constants. The design reference is the
// header of spikes/instagram-story/index.html; keep the two in step until the
// spike is deleted, then this file is the reference.
//
// Positions are absolute pixels on the 1080×1920 frame. Sizes that echo the
// app's own UI are its Tailwind values scaled by UI_SCALE, from an assumed
// 390px-wide phone viewport, so the video reads like the player it came from.

import { colors } from "@form-at/ui/tokens";

export const FRAME = { width: 1080, height: 1920 } as const;

// Where Instagram's own overlays sit. PROVISIONAL: never checked against a
// published story. Everything meaningful stays inside; only the decorative
// spectrum strip goes below SAFE_ZONE.bottom, on purpose.
export const SAFE_ZONE = { top: 250, bottom: 1580 } as const;

export const MARGIN_X = 90;
const UI_SCALE = FRAME.width / 390;
const scaled = (px: number) => Math.round(px * UI_SCALE);

export const COLORS = {
  background: colors.black,
  played: colors.gold,
  // Same pairing as the player: Waveform.tsx draws unplayed bars in purple.
  unplayed: colors.purple,
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

// Top to bottom. Baselines are for text; y is a top edge.
export const BRAND = {
  text: "formatglasgow.com",
  baselineY: SAFE_ZONE.top + 52,
  size: 42,
  weight: 400,
} as const;
export const ARTWORK = {
  y: SAFE_ZONE.top + 116,
  size: 560,
  radius: scaled(4),
  borderWidth: 2,
} as const;
export const TITLE = { baselineY: 1041, size: 84, weight: 700 } as const;
export const META = { baselineY: 1108, size: TEXT_SM, weight: 400 } as const;

// The excerpt row mirrors PlayerSeeker: start and end times either side of
// the bars (text-xs, gap-3), bars in the width left over.
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
} as const;

// "start / total" pill, centred on the timeline marker, clamped to the margins.
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
  color: "rgba(203, 203, 203, 0.35)",
  // The true width of 20s on a 2h set is ~2px; the marker never draws thinner.
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
