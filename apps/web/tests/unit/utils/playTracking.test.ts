import { describe, expect, it } from "vitest";
import { MAX_LISTENED_SECONDS, maxListenedSecondsForDuration } from "~/utils/playTracking";

describe("maxListenedSecondsForDuration", () => {
  it("derives the ceiling from a real duration plus the grace margin", () => {
    // "45:18" → 2718s. Grace margin is intentionally not re-derived here —
    // this asserts the actual number callers get, so a change to the grace
    // constant is a visible, deliberate change to this test too.
    expect(maxListenedSecondsForDuration("45:18")).toBe(2718 + 60);
  });

  it("survives a set longer than the old fixed 2h ceiling — the Unreal bug this replaces", () => {
    // "2:20:51" → 8451s, set-003-unreal's real duration. Under the old flat
    // MAX_LISTENED_SECONDS (2h/7200s) ceiling, a full listen of this set was
    // silently rejected. The duration-derived ceiling must clear it.
    const ceiling = maxListenedSecondsForDuration("2:20:51");
    expect(ceiling).toBeGreaterThan(8451);
  });

  it("falls back to MAX_LISTENED_SECONDS for a missing duration", () => {
    expect(maxListenedSecondsForDuration(undefined)).toBe(MAX_LISTENED_SECONDS);
  });

  it("falls back to MAX_LISTENED_SECONDS for a malformed duration string", () => {
    expect(maxListenedSecondsForDuration("not-a-duration")).toBe(MAX_LISTENED_SECONDS);
  });
});
