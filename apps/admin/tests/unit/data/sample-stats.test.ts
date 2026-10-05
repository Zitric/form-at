import { sets } from "@form-at/data/sets";
import { describe, expect, it } from "vitest";
import { SAMPLE_ADMIN_DASHBOARD_STATS, SAMPLE_SETS, SAMPLE_SET_STATS } from "~/data/sample-stats";

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

  // Both count share_click, so the two cards must agree.
  it("gives storyFunnel the same share_click count as clicks", () => {
    expect(SAMPLE_ADMIN_DASHBOARD_STATS.storyFunnel.shareClicks).toBe(
      SAMPLE_ADMIN_DASHBOARD_STATS.clicks.shareClicks,
    );
  });

  // The shape a launch gives: weeks of zeros, then a start.
  it("has story taps only at the end of the window (storyFunnel.createTapsTrend)", () => {
    const trend = SAMPLE_ADMIN_DASHBOARD_STATS.storyFunnel.createTapsTrend;
    expect(trend.slice(0, -2).every((n) => n === 0)).toBe(true);
    expect(trend.at(-1)).toBeGreaterThan(0);
  });

  // listening and plays describe the same rows, so they must agree.
  it("gives listening the same play count as plays, and per-set figures that add up", () => {
    const { listening, plays } = SAMPLE_ADMIN_DASHBOARD_STATS;
    expect(listening.plays).toBe(plays.total);
    expect(listening.perSet.reduce((n, s) => n + s.minutes, 0)).toBe(listening.totalMinutes);
    expect(listening.perSet.reduce((n, s) => n + s.plays, 0)).toBe(listening.plays);
  });

  // Cumulative listening can run past a set's length; the fixture shows it.
  it("includes a set whose average listen per play exceeds a 90-minute set", () => {
    const longest = Math.max(
      ...SAMPLE_ADMIN_DASHBOARD_STATS.listening.perSet.map((s) => s.avgMinutesPerPlay ?? 0),
    );
    expect(longest).toBeGreaterThan(90);
  });

  it("has one milestone of each kind", () => {
    const kinds = SAMPLE_ADMIN_DASHBOARD_STATS.milestones.map((m) => m.kind).sort();
    expect(kinds).toEqual(["event", "launch", "push", "upload"]);
  });

  it("installToPushConversion.ratio realistically exceeds 100% (no shared key between the two aggregates)", () => {
    expect(SAMPLE_ADMIN_DASHBOARD_STATS.installToPushConversion.ratio).toBeGreaterThan(1);
  });
});

// SetsTab's sample-data-mode picker fixture — kept in its own describe since
// it stands in for a different real thing (live D1 via fetchSetsPageData,
// not the build-time snapshot `sets` reimported above for the OTHER
// fixture's own symmetry check) — see SAMPLE_SETS's own comment for why
// admin never reads that snapshot at all.
describe("SAMPLE_SETS", () => {
  it("has exactly the same ids as SAMPLE_SET_STATS — every picker button has stats to show", () => {
    const setsIds = SAMPLE_SETS.map((s) => s.id).sort();
    const statsIds = Object.keys(SAMPLE_SET_STATS).sort();
    expect(setsIds).toEqual(statsIds);
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
