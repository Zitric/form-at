import { describe, expect, it } from "vitest";
import { fmtBytes, fmtSetDuration, parseSetDuration } from "~/utils/fmt";

// Set-upload feature. `fmtSetDuration` matches the `sets.duration`
// column's real stored format exactly — verified against the actual
// migrated rows (schema.sql): "45:18", "1:31:55", "2:01:55". Neither
// `fmtDuration` (a stats-label shape: "45s"/"12m"/"1h 5m") nor apps/web's
// `fmtTimestamp` (M:SS with no hour rollover) produces this.
describe("fmtSetDuration", () => {
  it("formats under an hour as M:SS, matching the real 45:18 row", () => {
    expect(fmtSetDuration(45 * 60 + 18)).toBe("45:18");
  });

  it("rolls over to H:MM:SS at/above an hour, matching the real 1:31:55 row", () => {
    expect(fmtSetDuration(91 * 60 + 55)).toBe("1:31:55");
  });

  it("matches the real 2:01:55 row", () => {
    expect(fmtSetDuration(121 * 60 + 55)).toBe("2:01:55");
  });

  it("pads seconds and minutes-after-hours to 2 digits", () => {
    expect(fmtSetDuration(60 * 60 + 5)).toBe("1:00:05");
  });

  it("floors a fractional seconds input", () => {
    expect(fmtSetDuration(45.9)).toBe("0:45");
  });
});

describe("parseSetDuration", () => {
  it("is the exact inverse of fmtSetDuration for the real rows above", () => {
    expect(parseSetDuration("45:18")).toBe(45 * 60 + 18);
    expect(parseSetDuration("1:31:55")).toBe(91 * 60 + 55);
    expect(parseSetDuration("2:01:55")).toBe(121 * 60 + 55);
  });

  it("returns undefined for anything that isn't 2 or 3 colon-separated numeric parts", () => {
    expect(parseSetDuration("")).toBeUndefined();
    expect(parseSetDuration("45")).toBeUndefined();
    expect(parseSetDuration("1:2:3:4")).toBeUndefined();
    expect(parseSetDuration("not:a:duration")).toBeUndefined();
  });
});

describe("fmtBytes", () => {
  it("formats sub-GB sizes in whole MB", () => {
    expect(fmtBytes(108_761_280)).toBe("109MB");
  });

  it("formats GB-scale sizes to one decimal", () => {
    expect(fmtBytes(1_500_000_000)).toBe("1.5GB");
  });

  it("returns 0MB for non-finite or non-positive input", () => {
    expect(fmtBytes(0)).toBe("0MB");
    expect(fmtBytes(Number.NaN)).toBe("0MB");
    expect(fmtBytes(-5)).toBe("0MB");
  });
});
