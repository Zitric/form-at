import type { Event } from "@form-at/data/events";
import { colors } from "@form-at/ui/tokens";
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
import { SAFE_ZONE } from "~/utils/storyVideo/layout";

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
  it("default to form:at: a gold duotone card over a purple-tinted background", () => {
    expect(DEFAULT_TREATMENT).toBe("format");
    expect(TREATMENTS.format).toEqual({
      label: "form:at",
      card: "duotone-gold",
      tint: colors.purple,
    });
  });

  it("are offered in the order form:at, raw, gold, purple, scan", () => {
    expect(TREATMENT_IDS.map((id) => TREATMENTS[id].label)).toEqual([
      "form:at",
      "raw",
      "gold",
      "purple",
      "scan",
    ]);
  });

  it("each pick a card tone; only form:at tints the background", () => {
    expect(TREATMENTS.raw.card).toBe("raw");
    expect(TREATMENTS.gold.card).toBe("duotone-gold");
    expect(TREATMENTS.purple.card).toBe("duotone-purple");
    expect(TREATMENTS.scan.card).toBe("scan");
    for (const id of TREATMENT_IDS.filter((t) => t !== "format")) {
      expect(TREATMENTS[id].tint).toBeNull();
    }
  });
});

describe("storyLine", () => {
  it("is the next night's long label when the DJ has one", () => {
    expect(storyLine("guest", nextEvent)).toBe("form:at 004 · sat\u00A005.12 · stereo");
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
  it("keeps everything inside Instagram's safe zone, in order, with room for the link sticker", () => {
    const cardBottom = DJ_STORY.card.y + DJ_STORY.card.size;
    expect(DJ_STORY.wordmark.y).toBeGreaterThanOrEqual(SAFE_ZONE.top);
    expect(DJ_STORY.card.y).toBeGreaterThan(DJ_STORY.wordmark.y);
    expect(DJ_STORY.name.baselineY).toBeGreaterThan(cardBottom);
    expect(DJ_STORY.line.baselineY).toBeGreaterThan(DJ_STORY.name.baselineY);
    // The band between the line and the site stays empty for the sticker.
    expect(DJ_STORY.site.baselineY - DJ_STORY.line.baselineY).toBeGreaterThanOrEqual(200);
    expect(DJ_STORY.site.baselineY).toBeLessThanOrEqual(SAFE_ZONE.bottom);
  });
});
