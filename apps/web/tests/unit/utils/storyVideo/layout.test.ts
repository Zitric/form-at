import { describe, expect, it } from "vitest";
import {
  APPROVED_INK,
  ARTWORK,
  ARTWORK_COLON,
  BACKGROUND,
  BRAND,
  EXCERPT,
  EXCERPT_BARS,
  FRAME,
  META,
  PILL,
  SAFE_ZONE,
  SPECTRUM_STRIP,
  TEXT_SM,
  TEXT_XS,
  TIMELINE,
  TITLE,
  backgroundColonRect,
  backgroundRect,
  barRow,
  coverCrop,
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

describe("coverCrop", () => {
  it("takes a centred square from a square source, untouched", () => {
    expect(coverCrop(1080, 1080, 0.35)).toEqual({ x: 0, y: 0, width: 1080, height: 1080 });
  });

  it("crops a portrait photo to its full width, at the focus", () => {
    // 1080×1440 at 0.35: the square's centre wants to be at 504, so it starts at -36 → 0.
    expect(coverCrop(1080, 1440, 0.35)).toEqual({ x: 0, y: 0, width: 1080, height: 1080 });
    // 1080×1620 at 0.35: centre at 567, so the square starts at 27.
    expect(coverCrop(1080, 1620, 0.35)).toEqual({ x: 0, y: 27, width: 1080, height: 1080 });
  });

  it("crops a 4:5 artwork around its middle, never stretching it", () => {
    expect(coverCrop(4500, 5625, 0.5)).toEqual({ x: 0, y: 562.5, width: 4500, height: 4500 });
  });

  it("crops a landscape source across, centred", () => {
    expect(coverCrop(4482, 3524, 0.5)).toEqual({ x: 479, y: 0, width: 3524, height: 3524 });
  });

  it("never reads past the bottom, however low the focus", () => {
    const crop = coverCrop(1000, 3000, 1);
    expect(crop.y + crop.height).toBe(3000);
  });
});

// The background artwork has to cover the whole frame and keep the colon
// behind the card, at the aspect ratios in the catalogue: 4:5 (002, 003)
// and Seafield's landscape.
describe("background artwork placement", () => {
  const card = { left: (FRAME.width - ARTWORK.size) / 2, top: ARTWORK.y, size: ARTWORK.size };

  for (const [name, aspect] of [
    ["4:5", 4 / 5],
    ["Seafield, 4482×3524", 4482 / 3524],
  ] as const) {
    it(`covers the whole frame (${name})`, () => {
      const bg = backgroundRect(aspect);
      expect(bg.x).toBeLessThanOrEqual(0);
      expect(bg.y).toBeLessThanOrEqual(0);
      expect(bg.x + bg.width).toBeGreaterThanOrEqual(FRAME.width);
      expect(bg.y + bg.height).toBeGreaterThanOrEqual(FRAME.height);
    });
  }

  it("puts the colon entirely behind the card", () => {
    const colon = backgroundColonRect(4 / 5);
    expect(colon.x).toBeGreaterThanOrEqual(card.left);
    expect(colon.x + colon.width).toBeLessThanOrEqual(card.left + card.size);
    expect(colon.y).toBeGreaterThanOrEqual(card.top);
    expect(colon.y + colon.height).toBeLessThanOrEqual(card.top + card.size);
  });

  // Upright, the colon sits low in the artwork (60–75% down), so an artwork
  // placed to hide it ends well above the frame's bottom at any size where
  // the colon still fits behind the card. Flipping is what makes both hold.
  it("is mirrored, because upright the two constraints can't both hold", () => {
    expect(BACKGROUND.flipped).toBe(true);
    const colonMid = (ARTWORK_COLON.y[0] + ARTWORK_COLON.y[1]) / 2;
    const colonHeight = ARTWORK_COLON.y[1] - ARTWORK_COLON.y[0];
    const tallestHidingColon = ARTWORK.size / colonHeight;
    const shortestCoveringFrame = (FRAME.height - (ARTWORK.y + ARTWORK.size / 2)) / (1 - colonMid);
    expect(tallestHidingColon).toBeLessThan(shortestCoveringFrame);
  });
});

describe("barRow", () => {
  it("fits as many bars as end inside the width, and reports their ink", () => {
    // 8px bars, 3px gaps: 53 bars end at 53×11 − 3 = 580.
    expect(barRow(586, 8, 3)).toEqual({ count: 53, inkWidth: 580 });
    // A bar that would end exactly at the edge fits.
    expect(barRow(580, 8, 3)).toEqual({ count: 53, inkWidth: 580 });
  });

  it("has nothing to draw in a row narrower than one bar", () => {
    expect(barRow(5, 8, 3)).toEqual({ count: 0, inkWidth: 0 });
  });
});
