import { describe, expect, it } from "vitest";
import { bucketStartDates } from "~/utils/trendDates";

describe("bucketStartDates", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");

  it("returns one date per bucket, oldest first", () => {
    const dates = bucketStartDates(3, 7, now);
    expect(dates).toHaveLength(3);
    expect(dates[0] < dates[1]).toBe(true);
    expect(dates[1] < dates[2]).toBe(true);
  });

  it("the most recent bucket is `now`", () => {
    const dates = bucketStartDates(3, 7, now);
    expect(dates.at(-1)?.getTime()).toBe(now.getTime());
  });

  it("spaces buckets by bucketDays", () => {
    const dates = bucketStartDates(3, 7, now);
    const diffDays = (dates[1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 5);
  });

  it("handles count 0 and 1 without throwing", () => {
    expect(bucketStartDates(0, 7, now)).toEqual([]);
    expect(bucketStartDates(1, 7, now)).toEqual([now]);
  });
});
