import { sets } from "@form-at/data/sets";
import { describe, expect, it } from "vitest";
import { SAMPLE_ADMIN_DASHBOARD_STATS, SAMPLE_SET_STATS } from "~/data/sample-stats";

// These assert the specific "awkward shapes" the fixture exists to stress —
// not just that the fixture has *some* data. If a future edit smooths these
// out (e.g. "fixing" the empty array), rendering bugs they'd have caught go
// dark again.
describe("SAMPLE_ADMIN_DASHBOARD_STATS", () => {
  it("is marked as sample data", () => {
    expect(SAMPLE_ADMIN_DASHBOARD_STATS.isSampleData).toBe(true);
  });

  it("includes an empty trend array (installFunnel.dismissedTrend)", () => {
    expect(SAMPLE_ADMIN_DASHBOARD_STATS.installFunnel.dismissedTrend).toEqual([]);
  });

  it("includes an all-zero trend array (appLaunches.weeklyTrend)", () => {
    const trend = SAMPLE_ADMIN_DASHBOARD_STATS.appLaunches.weeklyTrend;
    expect(trend.length).toBeGreaterThan(0);
    expect(trend.every((n) => n === 0)).toBe(true);
  });

  it("includes a large spike next to small values (pushSubscribers.weeklyGrowth)", () => {
    const trend = SAMPLE_ADMIN_DASHBOARD_STATS.pushSubscribers.weeklyGrowth;
    const max = Math.max(...trend);
    const others = trend.filter((n) => n !== max);
    expect(max).toBeGreaterThan(Math.max(...others) * 3);
  });

  it("installToPushConversion.ratio realistically exceeds 100% (no shared key between the two aggregates)", () => {
    expect(SAMPLE_ADMIN_DASHBOARD_STATS.installToPushConversion.ratio).toBeGreaterThan(1);
  });
});

describe("SAMPLE_SET_STATS", () => {
  it("has a fixture entry for every real set", () => {
    for (const set of sets) {
      expect(SAMPLE_SET_STATS[set.id]).toBeDefined();
    }
  });

  it("includes a set with an empty weeklyPlays trend", () => {
    const hasEmpty = Object.values(SAMPLE_SET_STATS).some((s) => s.weeklyPlays.length === 0);
    expect(hasEmpty).toBe(true);
  });

  it("includes a set whose avgSeconds exceeds its own track length (cumulative, not furthest-position)", () => {
    const til = SAMPLE_SET_STATS["set-002-til"];
    const durationSeconds = 45 * 60 + 18; // t.i.l.'s duration, "45:18"
    expect(til.avgSeconds).toBeGreaterThan(durationSeconds);
  });
});
