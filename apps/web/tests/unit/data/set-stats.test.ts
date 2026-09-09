import { describe, expect, it } from "vitest";
import { SAMPLE_OVERALL_STATS } from "~/data/sample-stats";
import { pickStatsForMissingDb } from "~/data/set-stats";

// Mirrors apps/admin/tests/unit/data/admin-stats.test.ts's identical
// pickStatsForMissingDb coverage — same distinction, same three cases.
describe("pickStatsForMissingDb", () => {
  it("stays honest (null) when a real Cloudflare env is present but D1 isn't bound", () => {
    expect(pickStatsForMissingDb(true)).toBeNull();
  });

  it("falls back to the sample fixture when there's no Cloudflare env at all", () => {
    expect(pickStatsForMissingDb(false)).toBe(SAMPLE_OVERALL_STATS);
  });

  it("treats a missing flag the same as false — defaults to the sample fixture", () => {
    expect(pickStatsForMissingDb(undefined)).toBe(SAMPLE_OVERALL_STATS);
    3;
  });
});
