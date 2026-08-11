import { describe, expect, it } from "vitest";
import { type CaptureRun, buildHistory, coveredDays } from "~/data/rum-history";

// The load-bearing behaviour here is the zero/unknown distinction. Getting it
// wrong is silent: an outage would render as a stretch of confident zero
// traffic, indistinguishable from a genuinely quiet fortnight, and nobody would
// find out until they compared against Cloudflare months later.
//
// It cuts BOTH ways, which is why the failed-run cases matter as much as the
// quiet-window ones. A run that succeeded over an empty window observed those
// days (real zeros); a run that failed observed nothing (still unknown). Only
// the run log can tell them apart — neither leaves a row behind.

const at = (iso: string) => Date.parse(`${iso}T03:17:00Z`);

/** A run over the trailing 7 days ending on `until`. */
const run = (until: string, ok = true): CaptureRun => {
  const since = new Date(`${until}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 6);
  return { capturedAt: at(until), since: since.toISOString().slice(0, 10), until, ok };
};

const row = (day: string, visits: number, pageLoads = visits * 2, isBot = 0) => ({
  day,
  is_bot: isBot,
  visits,
  page_loads: pageLoads,
});

describe("coveredDays", () => {
  it("covers the whole window a run recorded, not just the day it ran", () => {
    const covered = coveredDays([run("2026-08-11")]);

    expect(covered.size).toBe(7);
    expect(covered.has("2026-08-11")).toBe(true);
    expect(covered.has("2026-08-05")).toBe(true);
    expect(covered.has("2026-08-04")).toBe(false);
  });

  it("leaves the middle UNCOVERED when two runs are a fortnight apart", () => {
    // Two runs 14 days apart cover 7 days each; the days between were never
    // observed by anyone. Treating them as covered would let an outage render
    // as zero traffic.
    const covered = coveredDays([run("2026-08-01"), run("2026-08-15")]);

    expect(covered.has("2026-07-26")).toBe(true);
    expect(covered.has("2026-08-01")).toBe(true);
    // The gap — nobody looked at these.
    expect(covered.has("2026-08-02")).toBe(false);
    expect(covered.has("2026-08-05")).toBe(false);
    expect(covered.has("2026-08-08")).toBe(false);
    expect(covered.has("2026-08-09")).toBe(true);
    expect(covered.has("2026-08-15")).toBe(true);
    expect(covered.size).toBe(14);
  });

  it("does NOT count a failed run as coverage", () => {
    // The cron fired, but the read failed — so it saw nothing and can't vouch
    // for those days. The opposite of a successful run over an empty window.
    expect(coveredDays([run("2026-08-11", false)]).size).toBe(0);
    // A success beside a failure still covers its own window and only its own.
    expect(coveredDays([run("2026-08-11", false), run("2026-08-04")]).size).toBe(7);
  });

  it("merges overlapping runs without double-counting", () => {
    expect(coveredDays([run("2026-08-10"), run("2026-08-11")]).size).toBe(8);
  });

  it("uses each run's RECORDED window rather than assuming a fixed width", () => {
    // Windows are stored per run so changing RUM_UNSAMPLED_DAYS can't rewrite
    // what past runs are claimed to have observed.
    const narrow: CaptureRun = {
      capturedAt: at("2026-08-11"),
      since: "2026-08-09",
      until: "2026-08-11",
      ok: true,
    };
    expect(coveredDays([narrow]).size).toBe(3);
  });

  it("ignores unusable window bounds rather than inventing coverage", () => {
    const inverted: CaptureRun = {
      capturedAt: at("2026-08-11"),
      since: "2026-08-11",
      until: "2026-08-05",
      ok: true,
    };
    expect(coveredDays([inverted]).size).toBe(0);
    expect(coveredDays([]).size).toBe(0);
  });
});

describe("buildHistory", () => {
  it("distinguishes an observed zero from an unobserved day", () => {
    const history = buildHistory(
      [row("2026-08-07", 4, 10), row("2026-08-08", 6, 12)],
      [run("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    const byDay = new Map(history.days.map((d) => [d.day, d.visits]));
    expect(byDay.get("2026-08-06")).toBe(0);
    expect(byDay.get("2026-08-07")).toBe(4);
    expect(history.daysCovered).toBe(7);
    expect(history.totalVisits).toBe(10);
  });

  it("draws a GENUINELY QUIET week as real zeros, not gaps", () => {
    // THE regression this run log exists for. The cron ran every day; traffic
    // stopped after 08-07, so runs from 08-14 on fetched an empty window and
    // wrote no rows. Deriving coverage from rum_daily.captured_at would leave
    // no trace of those runs and paint seven healthy days as "nobody looked".
    const runs = [
      "2026-08-07",
      "2026-08-10",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
    ].map((d) => run(d));

    const history = buildHistory(
      [row("2026-08-05", 4, 10), row("2026-08-07", 6, 12)],
      runs,
      new Date("2026-08-20T12:00:00Z"),
    );

    const quiet = history.days.filter((d) => d.day >= "2026-08-14");
    expect(quiet).toHaveLength(7);
    expect(quiet.every((d) => d.visits === 0)).toBe(true);
    expect(history.daysUncovered).toBe(0);
  });

  it("still draws a FAILED-run window as gaps, never as zeros", () => {
    // The other direction, and the reason failures are logged with ok=0 rather
    // than not logged at all. Same "wrote nothing" outcome as the quiet week
    // above; opposite correct rendering.
    const history = buildHistory(
      [row("2026-08-05", 4, 10)],
      [run("2026-08-07"), ...["2026-08-14", "2026-08-20"].map((d) => run(d, false))],
      new Date("2026-08-20T12:00:00Z"),
    );

    const unseen = history.days.filter((d) => d.day >= "2026-08-08");
    expect(unseen.every((d) => d.visits === null)).toBe(true);
    expect(history.daysUncovered).toBe(13);
  });

  it("renders an outage as nulls, never as zeroes", () => {
    const history = buildHistory(
      [row("2026-08-01", 5), row("2026-08-15", 3)],
      [run("2026-08-01"), run("2026-08-15")],
      new Date("2026-08-15T12:00:00Z"),
    );

    const gap = history.days.filter((d) => d.day >= "2026-08-02" && d.day <= "2026-08-08");
    expect(gap).toHaveLength(7);
    expect(gap.every((d) => d.visits === null)).toBe(true);
    expect(history.daysUncovered).toBe(7);
  });

  it("counts bot page loads separately and keeps them out of visits", () => {
    // Modelled on the real archive's 2026-08-09: a bot row with one page load
    // and no human row at all for that day.
    const history = buildHistory(
      [row("2026-08-09", 1, 1, 1)],
      [run("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    const day = history.days.find((d) => d.day === "2026-08-09");
    expect(day?.visits).toBe(0);
    expect(day?.botPageLoads).toBe(1);
    expect(history.totalVisits).toBe(0);
  });

  describe("the two staleness signals", () => {
    it("keeps 'cron fired' and 'cron succeeded' apart", () => {
      // A cron firing daily whose every read fails is FRESH by one signal and
      // STALE by the other. Collapsing them to one number would report this as
      // healthy — the precise scenario the warning exists for.
      const history = buildHistory(
        [row("2026-08-05", 4, 10)],
        [
          run("2026-08-07"),
          ...["2026-08-18", "2026-08-19", "2026-08-20"].map((d) => run(d, false)),
        ],
        new Date("2026-08-20T12:00:00Z"),
      );

      expect(history.lastRunAt).toBe(at("2026-08-20"));
      expect(history.lastSuccessAt).toBe(at("2026-08-07"));
    });

    it("reports a run time even when nothing was ever captured", () => {
      // Every run failed: no coverage, so no days — but the card must still be
      // able to say "the cron is alive and the reads are broken" rather than
      // "nothing archived yet", which would send someone to the wrong fix.
      const history = buildHistory(
        [],
        [run("2026-08-19", false), run("2026-08-20", false)],
        new Date("2026-08-20T12:00:00Z"),
      );

      expect(history.days).toHaveLength(0);
      expect(history.lastRunAt).toBe(at("2026-08-20"));
      expect(history.lastSuccessAt).toBeNull();
    });

    it("returns an empty history when the archiver has never run", () => {
      const history = buildHistory([], [], new Date("2026-08-11T12:00:00Z"));

      expect(history.days).toHaveLength(0);
      expect(history.coverageStart).toBeNull();
      expect(history.lastRunAt).toBeNull();
      expect(history.lastSuccessAt).toBeNull();
    });
  });

  it("reports coverage bounds", () => {
    const history = buildHistory(
      [row("2026-08-10", 1)],
      [run("2026-08-08"), run("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    expect(history.coverageStart).toBe("2026-08-02");
    expect(history.coverageEnd).toBe("2026-08-11");
  });

  it("never renders past today — future days aren't uncovered, they haven't happened", () => {
    const history = buildHistory(
      [row("2026-08-10", 1)],
      [run("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
    );

    expect(history.days.at(-1)?.day).toBe("2026-08-11");
  });

  it("caps the rendered range so a long-lived archive stays readable", () => {
    const history = buildHistory(
      [row("2026-08-10", 1)],
      [run("2026-01-05"), run("2026-08-11")],
      new Date("2026-08-11T12:00:00Z"),
      30,
    );

    expect(history.days).toHaveLength(30);
    // Coverage still reports the true earliest observation, even though the
    // chart doesn't reach back that far — the card states the span separately.
    expect(history.coverageStart).toBe("2025-12-30");
  });
});
