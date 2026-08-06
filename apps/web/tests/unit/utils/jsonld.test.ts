import { describe, expect, it } from "vitest";
import { eventDateTimes } from "~/utils/jsonld";

// Locks the WebKit crash fix: `startDate` must ALWAYS be a
// full `T`-qualified local datetime, never a bare date. `ics.ts`'s calendar
// builders feed it straight into `new Date(\`${startDate}Z\`)` — a bare
// date there ("2026-07-24Z") is malformed ISO 8601. Chromium tolerates it;
// Safari/WebKit throws "date value is not finite" inside
// `Intl.DateTimeFormat().formatToParts()`, crashing the whole event page.
// Found via a real Safari e2e run against the Seafield Sound entry, whose
// runtime ("20:30 — very late") has an unparseable end time.

describe("eventDateTimes", () => {
  it("full HH:MM — HH:MM range: both startDate and endDate, same day", () => {
    const result = eventDateTimes("2026-04-24", "23:00 — 05:00");
    expect(result.startDate).toBe("2026-04-24T23:00:00");
    // End wraps past midnight — rolls forward a day.
    expect(result.endDate).toBe("2026-04-25T05:00:00");
  });

  it("end time later than start, same day: no date rollover", () => {
    const result = eventDateTimes("2026-04-24", "14:00 — 18:00");
    expect(result.startDate).toBe("2026-04-24T14:00:00");
    expect(result.endDate).toBe("2026-04-24T18:00:00");
  });

  it("parseable start, unparseable end (e.g. 'very late'): keeps the REAL start time, omits endDate", () => {
    const result = eventDateTimes("2026-07-24", "20:30 — very late");
    expect(result.startDate).toBe("2026-07-24T20:30:00");
    expect(result.endDate).toBeUndefined();
  });

  it("nothing parseable: falls back to midnight — never a bare date-only string", () => {
    const result = eventDateTimes("2026-08-28", undefined);
    expect(result.startDate).toBe("2026-08-28T00:00:00");
    expect(result.endDate).toBeUndefined();
  });

  it("garbage runtime string: same midnight fallback, not a crash", () => {
    const result = eventDateTimes("2026-08-28", "TBC");
    expect(result.startDate).toBe("2026-08-28T00:00:00");
  });

  it("startDate is always parseable as a valid, finite Date (the actual crash repro)", () => {
    for (const runtime of ["23:00 — 05:00", "20:30 — very late", undefined, "TBC"]) {
      const { startDate } = eventDateTimes("2026-07-24", runtime);
      const parsed = new Date(`${startDate}Z`);
      expect(Number.isFinite(parsed.getTime())).toBe(true);
    }
  });
});
