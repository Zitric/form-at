import { describe, expect, it } from "vitest";
import { fmtDate, fmtDuration } from "~/utils/fmt";

describe("fmtDuration", () => {
  it("formats seconds under a minute", () => {
    expect(fmtDuration(0)).toBe("0s");
    expect(fmtDuration(45)).toBe("45s");
    expect(fmtDuration(59)).toBe("59s");
  });

  it("formats whole minutes", () => {
    expect(fmtDuration(60)).toBe("1m");
    expect(fmtDuration(180)).toBe("3m");
    expect(fmtDuration(3540)).toBe("59m");
  });

  it("formats hours with leftover minutes", () => {
    expect(fmtDuration(3600)).toBe("1h");
    expect(fmtDuration(3660)).toBe("1h 1m");
    expect(fmtDuration(7320)).toBe("2h 2m");
  });
});

describe("fmtDate", () => {
  it("returns an ISO date (YYYY-MM-DD)", () => {
    // 2026-05-08T12:00:00Z
    const ms = Date.UTC(2026, 4, 8, 12, 0, 0);
    expect(fmtDate(ms)).toBe("2026-05-08");
  });
});
