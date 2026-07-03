import { describe, expect, it } from "vitest";
import {
  SNAP_PROGRESS,
  SNAP_VELOCITY,
  shouldSnapClose,
  shouldSnapOpen,
} from "~/utils/playerGestures";

describe("shouldSnapOpen", () => {
  it("opens when drag distance exceeds the progress threshold", () => {
    expect(shouldSnapOpen(SNAP_PROGRESS + 0.01)).toBe(true);
  });

  it("does not open when below the progress threshold", () => {
    expect(shouldSnapOpen(SNAP_PROGRESS - 0.01)).toBe(false);
  });

  it("has NO velocity commit — a scroll-flick-sized drag stays closed (2026-07-03 field bug)", () => {
    // 25% of viewport at any speed: with the old velocity shortcut this
    // committed open, turning upward scroll flicks that start on the
    // mini-player strip into accidental full-player launches. Distance is
    // the only signature that separates a deliberate pull from a flick.
    expect(shouldSnapOpen(0.25)).toBe(false);
  });

  it("stays closed for tap-equivalent input", () => {
    expect(shouldSnapOpen(0)).toBe(false);
  });
});

describe("shouldSnapClose", () => {
  it("closes when drag distance exceeds the progress threshold (negative)", () => {
    expect(shouldSnapClose(-SNAP_PROGRESS - 0.01, 0, 100)).toBe(true);
  });

  it("does not close when below the threshold with no flick", () => {
    expect(shouldSnapClose(-SNAP_PROGRESS + 0.01, 0, 100)).toBe(false);
  });

  it("closes on a fast downward flick even at low progress", () => {
    expect(shouldSnapClose(-0.05, SNAP_VELOCITY + 0.01, 10)).toBe(true);
  });

  it("ignores fast velocity going the wrong direction (upward)", () => {
    expect(shouldSnapClose(-0.05, SNAP_VELOCITY + 0.5, -50)).toBe(false);
  });

  it("stays open for tap-equivalent input (zero everything)", () => {
    expect(shouldSnapClose(0, 0, 0)).toBe(false);
  });
});
