import { describe, expect, it } from "vitest";
import {
  APPROVED_INK,
  ARTWORK,
  BRAND,
  EXCERPT,
  EXCERPT_BARS,
  META,
  PILL,
  SAFE_ZONE,
  SPECTRUM_STRIP,
  TEXT_SM,
  TEXT_XS,
  TIMELINE,
  TITLE,
} from "~/utils/storyVideo/layout";

// Relationships the approved layout depends on. Each one can break from an
// edit to a single constant that looks harmless on its own.

const order = ["brand", "artwork", "title", "meta", "excerpt", "pill", "timeline"] as const;

describe("story video layout", () => {
  it("keeps every meaningful element inside the safe zone", () => {
    for (const name of order) {
      const [top, bottom] = APPROVED_INK[name];
      expect(top, name).toBeGreaterThanOrEqual(SAFE_ZONE.top);
      expect(bottom, name).toBeLessThanOrEqual(SAFE_ZONE.bottom);
    }
  });

  it("keeps DJ name → meta clearly tighter than artwork → DJ name, so they read as one block", () => {
    const artToTitle = APPROVED_INK.title[0] - APPROVED_INK.artwork[1];
    const titleToMeta = APPROVED_INK.meta[0] - APPROVED_INK.title[1];
    expect(titleToMeta).toBeLessThan(artToTitle);
  });

  it("keeps the tallest spectrum bar its clearance below the timeline", () => {
    const spectrumTop = SPECTRUM_STRIP.baselineY - SPECTRUM_STRIP.maxHeight;
    expect(spectrumTop - APPROVED_INK.timeline[1]).toBeGreaterThanOrEqual(SPECTRUM_STRIP.clearance);
  });

  // APPROVED_INK is a hand-recorded measurement and the constants are what
  // the renderer draws from. These two keep them describing the same frame:
  // move the artwork without updating the table and the invariants above
  // would be checking a layout nobody draws.
  it("keeps the measured boxes in step with the constants that draw them", () => {
    expect(APPROVED_INK.artwork).toEqual([ARTWORK.y, ARTWORK.y + ARTWORK.size]);
    expect(APPROVED_INK.excerpt).toEqual([EXCERPT.y, EXCERPT.y + EXCERPT.height]);
    expect(APPROVED_INK.pill).toEqual([PILL.bottomY - PILL.height, PILL.bottomY]);
    expect(APPROVED_INK.timeline).toEqual([
      TIMELINE.y - TIMELINE.markerOverhang,
      TIMELINE.y + TIMELINE.height + TIMELINE.markerOverhang,
    ]);
  });

  it("keeps each text baseline inside its measured ink box", () => {
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

  it("scales the player's sizes from a 390px viewport", () => {
    expect([EXCERPT_BARS.width, EXCERPT_BARS.gap]).toEqual([8, 3]);
    expect([TEXT_XS, TEXT_SM]).toEqual([33, 39]);
    expect(ARTWORK.radius).toBe(11);
  });
});
