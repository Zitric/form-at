import { describe, expect, it } from "vitest";
import { avgSecondsPerPlay, bucketByWeek } from "~/set-stats";

describe("avgSecondsPerPlay", () => {
  // One play paused twice is three `plays` rows of 600s each: 1800s for the
  // play, where a per-row AVG would say 600.
  it("divides everything listened by distinct plays, not by segments", () => {
    expect(avgSecondsPerPlay(1800, 1)).toBe(1800);
    expect(avgSecondsPerPlay(1800 + 300, 2)).toBe(1050);
  });

  it("rounds to whole seconds", () => {
    expect(avgSecondsPerPlay(100, 3)).toBe(33);
  });

  it("is 0 with no plays rather than NaN", () => {
    expect(avgSecondsPerPlay(0, 0)).toBe(0);
  });
});

describe("bucketByWeek", () => {
  it("sums 60 days into 9 buckets, the last one 4 days long", () => {
    const daily = Array.from({ length: 60 }, () => 1);
    const buckets = bucketByWeek(daily, 7);
    expect(buckets).toHaveLength(9);
    expect(buckets.at(-1)).toBe(4);
  });
});
