import { colors } from "@form-at/ui/tokens";
import { describe, expect, it } from "vitest";
import {
  APPROVED_INK,
  ARTWORK,
  BRAND,
  COLORS,
  EXCERPT,
  EXCERPT_BARS,
  FRAME,
  MARGIN_X,
  META,
  PILL,
  SAFE_ZONE,
  SPECTRUM_STRIP,
  TEXT_SM,
  TEXT_XS,
  TIMELINE,
  TITLE,
} from "~/utils/storyVideo/layout";

// The layout was approved by eye on rendered frames. These hold the numbers
// to what was approved, so an edit to one constant that silently shifts the
// rest fails here rather than on someone's Instagram story.

const order = ["brand", "artwork", "title", "meta", "excerpt", "pill", "timeline"] as const;

describe("story video layout", () => {
  it("keeps every meaningful element inside the safe zone", () => {
    for (const name of order) {
      const [top, bottom] = APPROVED_INK[name];
      expect(top, name).toBeGreaterThanOrEqual(SAFE_ZONE.top);
      expect(bottom, name).toBeLessThanOrEqual(SAFE_ZONE.bottom);
    }
  });

  it("keeps the approved vertical rhythm", () => {
    const gaps = order
      .slice(1)
      .map((name, i) => APPROVED_INK[name][0] - APPROVED_INK[order[i] ?? name][1]);
    expect(gaps).toEqual([56, 56, 38, 83, 74, 10]);
  });

  it("keeps DJ name → meta clearly tighter than artwork → DJ name, so they read as one block", () => {
    const artToTitle = APPROVED_INK.title[0] - APPROVED_INK.artwork[1];
    const titleToMeta = APPROVED_INK.meta[0] - APPROVED_INK.title[1];
    expect(titleToMeta).toBeLessThan(artToTitle);
  });

  it("derives the non-text boxes from the constants", () => {
    expect(APPROVED_INK.artwork).toEqual([ARTWORK.y, ARTWORK.y + ARTWORK.size]);
    expect(APPROVED_INK.excerpt).toEqual([EXCERPT.y, EXCERPT.y + EXCERPT.height]);
    expect(APPROVED_INK.pill).toEqual([PILL.bottomY - PILL.height, PILL.bottomY]);
    expect(APPROVED_INK.timeline).toEqual([
      TIMELINE.y - TIMELINE.markerOverhang,
      TIMELINE.y + TIMELINE.height + TIMELINE.markerOverhang,
    ]);
  });

  it("puts each text baseline inside its measured ink box", () => {
    for (const [name, baseline] of [
      ["brand", BRAND.baselineY],
      ["title", TITLE.baselineY],
      ["meta", META.baselineY],
    ] as const) {
      const [top, bottom] = APPROVED_INK[name];
      expect(baseline, name).toBeGreaterThan(top);
      expect(baseline, name).toBeLessThanOrEqual(bottom);
    }
  });

  it("keeps the tallest spectrum bar its clearance below the timeline", () => {
    const spectrumTop = SPECTRUM_STRIP.baselineY - SPECTRUM_STRIP.maxHeight;
    expect(spectrumTop - APPROVED_INK.timeline[1]).toBeGreaterThanOrEqual(SPECTRUM_STRIP.clearance);
    expect(SPECTRUM_STRIP.baselineY).toBe(FRAME.height);
  });

  it("keeps the artwork at its approved size, inside the side margins", () => {
    expect(ARTWORK.size).toBe(560);
    expect(ARTWORK.size).toBeLessThanOrEqual(FRAME.width - 2 * MARGIN_X);
  });

  it("scales the player's sizes from a 390px viewport", () => {
    expect([EXCERPT_BARS.width, EXCERPT_BARS.gap]).toEqual([8, 3]);
    expect([TEXT_XS, TEXT_SM]).toEqual([33, 39]);
    expect(ARTWORK.radius).toBe(11);
  });

  it("takes brand colours from the design tokens", () => {
    expect(COLORS.background).toBe(colors.black);
    expect(COLORS.played).toBe(colors.gold);
    expect(COLORS.unplayed).toBe(colors.purple);
    expect(COLORS.text).toBe(colors.grey);
  });
});
