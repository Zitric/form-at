import { RUM_UNSAMPLED_DAYS } from "@form-at/data/rumArchive";
import { describe, expect, it } from "vitest";
import { buildHistory, coveredDays } from "~/data/rum-history";

// The load-bearing behaviour here is the zero/unknown distinction. Getting it
// wrong is silent: an outage would render as a stretch of confident zero
// traffic, indistinguishable from a genuinely quiet fortnight, and nobody would
// find out until they compared against Cloudflare months later.

const at = (iso: string) => Date.parse(`${iso}T03:17:00Z`);
const row = (day: string, visits: number, pageLoads = visits * 2, isBot = 0) => ({
  day,
  is_bot: isBot,
  visits,
  page_loads: pageLoads,
});

describe("coveredDays", () => {
  it("covers the whole trailing window a single run observed, not just its day", () => {
    // A run re-fetches the trailing 7 days, so one capture proves 7 days were
    // looked at — that's what makes a missing row inside them a real zero.
    const covered = coveredDays([at("2026-08-11")], RUM_UNSAMPLED_DAYS);

    expect(covered.size).toBe(7);
    expect(covered.has("2026-08-11")).toBe(true);
    expect(covered.has("2026-08-05")).toBe(true);
    expect(covered.has("2026-08-04")).toBe(false);
  });

  it("leaves the middle UNCOVERED when two captures are a fortnight apart", () => {
    // THE case this exists for. Two runs 14 days apart cover 7 days each; the
    // days between were never observed by anyone. Treating them as covered
    // would let an outage render as zero traffic.
    const covered = coveredDays([at("2026-08-01"), at("2026-08-15")], RUM_UNSAMPLED_DAYS);

    // First run's window.
    expect(covered.has("2026-07-26")).toBe(true);
    expect(covered.has("2026-08-01")).toBe(true);
    // The gap — nobody looked at these.
    expect(covered.has("2026-08-02")).toBe(false);
    expect(covered.has("2026-08-05")).toBe(false);
    expect(covered.has("2026-08-08")).toBe(false);
    // Second run's window.
    expect(covered.has("2026-08-09")).toBe(true);
    expect(covered.has("2026-08-15")).toBe(true);
    expect(covered.size).toBe(14);
  });

  it("merges overlapping runs without double-counting", () => {
    const covered = coveredDays([at("2026-08-10"), at("2026-08-11")], RUM_UNSAMPLED_DAYS);
    // 7 days each, overlapping by 6 → 8 distinct days.
    expect(covered.size).toBe(8);
  });

  it("ignores unusable timestamps rather than inventing coverage", () => {
    expect(coveredDays([Number.NaN, at("2026-08-11")], RUM_UNSAMPLED_DAYS).size).toBe(7);
    expect(coveredDays([], RUM_UNSAMPLED_DAYS).size).toBe(0);
  });
});

describe("buildHistory", () => {
  it("distinguishes an observed zero from an unobserved day", () => {
    // The whole point: 08-06 was looked at and had nothing (0), while 08-01
    // predates any capture (null). Both have no row.
    const history = buildHistory(
      [row("2026-08-07", 4, 10), row("2026-08-08", 6, 12)],
      [at("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    const byDay = new Map(history.days.map((d) => [d.day, d.visits]));
    expect(byDay.get("2026-08-06")).toBe(0);
    expect(byDay.get("2026-08-07")).toBe(4);
    expect(byDay.get("2026-08-01")).toBeUndefined(); // outside the rendered range
    expect(history.daysCovered).toBe(7);
    expect(history.totalVisits).toBe(10);
  });

  it("renders an outage as nulls, never as zeroes", () => {
    const history = buildHistory(
      [row("2026-08-01", 5), row("2026-08-15", 3)],
      [at("2026-08-01"), at("2026-08-15")],
      new Date("2026-08-15T12:00:00Z"),
    );

    const gap = history.days.filter((d) => d.day >= "2026-08-02" && d.day <= "2026-08-08");
    expect(gap).toHaveLength(7);
    // If any of these were 0 instead of null, the chart would draw a week of
    // flat traffic across a week nobody captured.
    expect(gap.every((d) => d.visits === null)).toBe(true);
    expect(history.daysUncovered).toBe(7);
  });

  it("counts bot page loads separately and keeps them out of visits", () => {
    // Modelled on the real archive's 2026-08-09: a bot row with one page load
    // and no human row at all for that day.
    const history = buildHistory(
      [row("2026-08-09", 1, 1, 1)],
      [at("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    const day = history.days.find((d) => d.day === "2026-08-09");
    // A bot-only day: real zero human visits, but the page load is recorded.
    expect(day?.visits).toBe(0);
    expect(day?.botPageLoads).toBe(1);
    expect(history.totalVisits).toBe(0);
  });

  it("reports coverage bounds and the newest capture time", () => {
    const history = buildHistory(
      [row("2026-08-10", 1)],
      [at("2026-08-08"), at("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    expect(history.coverageStart).toBe("2026-08-02");
    expect(history.coverageEnd).toBe("2026-08-11");
    expect(history.lastCapturedAt).toBe(at("2026-08-11"));
  });

  it("never renders past today — future days aren't uncovered, they haven't happened", () => {
    const history = buildHistory(
      [row("2026-08-10", 1)],
      [at("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    expect(history.days.at(-1)?.day).toBe("2026-08-11");
  });

  it("caps the rendered range so a long-lived archive stays readable", () => {
    const history = buildHistory(
      [row("2026-08-10", 1)],
      [at("2026-01-05"), at("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
      30,
    );

    expect(history.days).toHaveLength(30);
    // Coverage still reports the true earliest observation, even though the
    // chart doesn't reach back that far — the card states the span separately.
    expect(history.coverageStart).toBe("2025-12-30");
  });

  it("returns an empty history when nothing has ever been captured", () => {
    const history = buildHistory([], [], new Date("2026-08-11T12:00:00Z"));

    expect(history.days).toHaveLength(0);
    expect(history.coverageStart).toBeNull();
    expect(history.lastCapturedAt).toBeNull();
  });
});
