import { describe, expect, it } from "vitest";
import {
  type Milestone,
  STATIC_MILESTONES,
  markerPositions,
  trendWindowStartDay,
} from "~/utils/milestones";

const m = (date: string, kind: Milestone["kind"] = "push"): Milestone => ({
  date,
  kind,
  label: date,
});

describe("trendWindowStartDay", () => {
  it("is the first of the 60 days ending today, as fillDailyWindow builds them", () => {
    expect(trendWindowStartDay(60, new Date("2026-10-02T15:00:00Z"))).toBe("2026-08-04");
    expect(trendWindowStartDay(1, new Date("2026-10-02T15:00:00Z"))).toBe("2026-10-02");
  });
});

describe("markerPositions", () => {
  // 60 days from 2026-08-04 to 2026-10-02 in 7-day buckets: 9 bars, the last
  // one 4 days long (Sep 29 – Oct 2).
  const weekly = { startDay: "2026-08-04", bucketDays: 7, buckets: 9, totalDays: 60 };

  it("puts a milestone in the bar its day was counted in, at that day's middle", () => {
    const [first] = markerPositions([m("2026-08-04")], weekly);
    expect(first).toMatchObject({ bucket: 0, fraction: 0.5 / 7 });
    const [mid] = markerPositions([m("2026-08-14")], weekly); // day 10: bar 1, 4th day
    expect(mid).toMatchObject({ bucket: 1, fraction: 3.5 / 7 });
  });

  it("measures the short last bar by its own days", () => {
    // The Android launch, on the window's last day: day 59, bar 8 of 4 days.
    const [launch] = markerPositions([m("2026-10-02", "launch")], weekly);
    expect(launch).toMatchObject({ bucket: 8, fraction: 3.5 / 4 });
  });

  it("leaves out milestones before or after the chart", () => {
    expect(markerPositions([m("2026-08-03"), m("2026-10-03"), m("2026-12-05")], weekly)).toEqual(
      [],
    );
  });

  it("places daily charts one day per bar", () => {
    const daily = { startDay: "2026-08-02", bucketDays: 1, buckets: 10 };
    expect(markerPositions([m("2026-08-05")], daily)[0]).toMatchObject({
      bucket: 3,
      fraction: 0.5,
    });
  });

  it("knows the launch and the 5 Dec event", () => {
    expect(STATIC_MILESTONES.map((s) => [s.date, s.kind])).toEqual([
      ["2026-10-02", "launch"],
      ["2026-12-05", "event"],
    ]);
  });
});
