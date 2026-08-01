import { describe, expect, it } from "vitest";
import { niceIntegerTicks } from "~/utils/chartTicks";

describe("niceIntegerTicks", () => {
  it("returns only integers", () => {
    for (const max of [1, 2, 3, 5, 15, 63, 100]) {
      for (const tick of niceIntegerTicks(max)) {
        expect(Number.isInteger(tick)).toBe(true);
      }
    }
  });

  it("doesn't over-produce ticks for a small range (max 2 → 3 ticks, not 5)", () => {
    expect(niceIntegerTicks(2)).toEqual([0, 1, 2]);
  });

  it("handles max 1 without fractional ticks", () => {
    expect(niceIntegerTicks(1)).toEqual([0, 1]);
  });

  it("handles a larger spike range with a sensible step", () => {
    expect(niceIntegerTicks(15)).toEqual([0, 5, 10, 15]);
  });

  it("always includes 0", () => {
    for (const max of [1, 2, 15, 63]) {
      expect(niceIntegerTicks(max)).toContain(0);
    }
  });
});
