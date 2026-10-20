import type { Event } from "@form-at/data/events";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TREATMENT,
  DJ_STORY,
  TREATMENTS,
  TREATMENT_IDS,
  duotoneRange,
  storyFileName,
  storyLine,
} from "~/utils/djStory/renderDjStory";
import {
  FRAME,
  MARGIN_X,
  META_SIZE,
  SAFE_ZONE,
  SITE,
  WORDMARK,
  WORDMARK_HEIGHT,
} from "~/utils/storyVideo/layout";

const nextEvent: Event = {
  id: "format-004",
  title: "Form:at 004",
  date: "2026-12-05",
  venue: "Stereo, Renfield Lane, City Centre, Glasgow",
  city: "Glasgow",
  lineupIds: ["dzeko"],
  audio: "techno",
  runtime: "23:00 — tbc",
  status: "upcoming",
};

describe("treatments", () => {
  it("default to form:at: a gold duotone card over the purple background", () => {
    expect(DEFAULT_TREATMENT).toBe("format");
    expect(TREATMENTS.format).toEqual({
      label: "form:at",
      card: "duotone-gold",
      background: "purple",
    });
  });

  it("are exactly form:at and raw, in that order", () => {
    expect(TREATMENT_IDS).toEqual(["format", "raw"]);
    expect(TREATMENT_IDS.map((id) => TREATMENTS[id].label)).toEqual(["form:at", "raw"]);
  });

  it("raw is the photo as it is, over the neutral background", () => {
    expect(TREATMENTS.raw).toEqual({ label: "raw", card: "raw", background: "neutral" });
  });
});

describe("storyLine", () => {
  it("is the next night as the page's short label with the venue, without form:at", () => {
    expect(storyLine("guest", nextEvent)).toBe("004 · sat\u00A005.12 · stereo");
  });

  it("is the DJ's role otherwise", () => {
    expect(storyLine("resident", null)).toBe("resident");
    expect(storyLine("guest", null)).toBe("guest");
  });
});

describe("storyFileName", () => {
  it("is a JPEG named for the site and the DJ", () => {
    expect(storyFileName("dzeko")).toBe("formatglasgow-dzeko.jpg");
  });
});

describe("duotoneRange", () => {
  it("stretches a dark photo's own range, ignoring its extreme 2% at each end", () => {
    // 1000 pixels evenly between 0.05 and 0.35: a dark photo.
    const lums = Array.from({ length: 1000 }, (_, i) => 0.05 + (0.3 * i) / 999);
    const [lo, hi] = duotoneRange(lums);
    expect(lo).toBeCloseTo(0.056, 2);
    expect(hi).toBeCloseTo(0.344, 2);
  });

  it("never narrows below 0.1, so a flat photo isn't stretched into noise", () => {
    const [lo, hi] = duotoneRange(Array(100).fill(0.5));
    expect(hi - lo).toBeCloseTo(0.1, 5);
  });

  it("is the full range with nothing to measure", () => {
    expect(duotoneRange([])).toEqual([0, 1]);
  });
});

describe("DJ_STORY layout", () => {
  it("spans the photo card across the content width, square, under the shared wordmark", () => {
    expect(DJ_STORY.card.size).toBe(FRAME.width - 2 * MARGIN_X);
    expect(DJ_STORY.card.size).toBe(900);
    expect(WORDMARK.y).toBeGreaterThanOrEqual(SAFE_ZONE.top);
    expect(DJ_STORY.card.y).toBeGreaterThan(WORDMARK.y + WORDMARK_HEIGHT);
  });

  it("puts the name, the line and the site under the card, in order, as one block", () => {
    const cardBottom = DJ_STORY.card.y + DJ_STORY.card.size;
    expect(DJ_STORY.name.baselineY).toBeGreaterThan(cardBottom);
    expect(DJ_STORY.line.baselineY).toBeGreaterThan(DJ_STORY.name.baselineY);
    expect(DJ_STORY.site.baselineY).toBeGreaterThan(DJ_STORY.line.baselineY);
    // One unit under the photo, not text spread down the frame.
    expect(DJ_STORY.site.baselineY - DJ_STORY.name.baselineY).toBeLessThanOrEqual(200);
  });

  it("keeps everything inside the safe zone: nothing goes below it, where the link sticker goes", () => {
    // A quarter of the font size covers Space Mono's descenders (g, y).
    expect(DJ_STORY.site.baselineY + SITE.size / 4).toBeLessThanOrEqual(SAFE_ZONE.bottom);
  });

  it("draws the line under the name at the set Story's meta size", () => {
    expect(DJ_STORY.line.size).toBe(META_SIZE);
  });
});
