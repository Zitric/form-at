import { describe, expect, it } from "vitest";
import { rubberBand } from "~/utils/rubberBand";

describe("rubberBand", () => {
  it("returns 0 for zero displacement", () => {
    expect(rubberBand(0, 100)).toBe(0);
  });

  it("guards against a 0 limit (avoids divide-by-zero)", () => {
    expect(rubberBand(50, 0)).toBe(0);
  });

  it("follows near-linearly at small displacements", () => {
    // 10px into a 100-limit zone: formula gives 100 * (1 - 1/1.1) ≈ 9.09 — i.e.
    // the user sees ~91% of their actual finger travel.
    const out = rubberBand(10, 100);
    expect(out).toBeGreaterThan(9);
    expect(out).toBeLessThan(10);
  });

  it("returns exactly limit/2 when displacement equals the limit", () => {
    // The canonical "you've reached the half-resistance point" inflection
    // — guards the curve's defining property against accidental tweaks.
    expect(rubberBand(100, 100)).toBeCloseTo(50, 5);
  });

  it("asymptotes toward `limit` for large displacements", () => {
    // 10× the limit should land well above 90% but never reach it.
    const out = rubberBand(1000, 100);
    expect(out).toBeGreaterThan(90);
    expect(out).toBeLessThan(100);
  });

  it("preserves sign — negative displacement produces negative offset", () => {
    expect(rubberBand(-100, 100)).toBeCloseTo(-50, 5);
    expect(rubberBand(-10, 100)).toBeLessThan(0);
  });
});
