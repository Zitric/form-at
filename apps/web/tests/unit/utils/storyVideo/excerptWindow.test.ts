import { describe, expect, it } from "vitest";
import {
  ZOOM_VISIBLE_SECONDS,
  clampStart,
  initialStart,
  nudge,
  sliceCovers,
  sliceFor,
  slicePeaks,
  startFromDrag,
  startFromStripTap,
} from "~/utils/storyVideo/excerptWindow";

const SET = 8451; // set-003-unreal, 2:20:51

describe("clampStart", () => {
  it("keeps the 20s window inside the set", () => {
    expect(clampStart(-5, SET)).toBe(0);
    expect(clampStart(SET, SET)).toBe(SET - 20);
    expect(clampStart(1800, SET)).toBe(1800);
  });

  it("starts a set shorter than the window at 0", () => {
    expect(clampStart(3, 12)).toBe(0);
  });
});

describe("initialStart", () => {
  it("opens at the playback position when this set is playing", () => {
    expect(initialStart(SET, 1800.7)).toBe(1800);
  });

  it("opens a third of the way in otherwise", () => {
    expect(initialStart(SET, null)).toBe(2817);
  });

  it("pulls a position in the last 20s back so the window fits", () => {
    expect(initialStart(SET, SET - 3)).toBe(SET - 20);
  });
});

describe("nudge", () => {
  it("moves by the delta, clamped at both ends", () => {
    expect(nudge(1800, 5, SET)).toBe(1805);
    expect(nudge(1800, -5, SET)).toBe(1795);
    expect(nudge(2, -5, SET)).toBe(0);
    expect(nudge(SET - 22, 5, SET)).toBe(SET - 20);
  });
});

describe("startFromStripTap", () => {
  it("maps the middle of the strip to the middle of the valid starts", () => {
    expect(startFromStripTap(0.5, SET)).toBe(Math.round((SET - 20) / 2));
  });

  // One pixel of a phone-width strip is ~25s here, so the ends need a zone.
  it("reaches the set's very start and end from the outer 2%", () => {
    expect(startFromStripTap(0.01, SET)).toBe(0);
    expect(startFromStripTap(0.995, SET)).toBe(SET - 20);
    expect(startFromStripTap(0, SET)).toBe(0);
    expect(startFromStripTap(1, SET)).toBe(SET - 20);
  });

  it("starts a set shorter than the window at 0 wherever it's tapped", () => {
    expect(startFromStripTap(0.7, 12)).toBe(0);
  });
});

describe("startFromDrag", () => {
  const width = 330;

  it("moves back in time when the waveform is dragged right", () => {
    // Dragging a whole strip width shifts by the strip's 60s.
    expect(startFromDrag(1800, width, width, SET)).toBe(1800 - ZOOM_VISIBLE_SECONDS);
    expect(startFromDrag(1800, -width / 2, width, SET)).toBe(1830);
  });

  it("clamps at the set's ends", () => {
    expect(startFromDrag(10, width, width, SET)).toBe(0);
    expect(startFromDrag(SET - 30, -width, width, SET)).toBe(SET - 20);
  });

  it("ignores a strip with no width", () => {
    expect(startFromDrag(1800, 50, 0, SET)).toBe(1800);
  });
});

describe("zoom slice", () => {
  it("centres a 90s slice on the window", () => {
    expect(sliceFor(1800, SET)).toEqual({ start: 1765, end: 1855 });
  });

  it("stays inside the set at both ends", () => {
    expect(sliceFor(0, SET)).toEqual({ start: 0, end: 90 });
    expect(sliceFor(SET - 20, SET)).toEqual({ start: SET - 90, end: SET });
    expect(sliceFor(0, 40)).toEqual({ start: 0, end: 40 });
  });

  it("covers the strip's view with 15s to spare either side", () => {
    const slice = sliceFor(1800, SET);
    expect(sliceCovers(slice, 1800, SET)).toBe(true);
    expect(sliceCovers(slice, 1815, SET)).toBe(true);
    expect(sliceCovers(slice, 1816, SET)).toBe(false);
    expect(sliceCovers(slice, 1784, SET)).toBe(false);
  });

  it("counts the set's own ends as covered", () => {
    expect(sliceCovers(sliceFor(0, SET), 0, SET)).toBe(true);
    expect(sliceCovers(sliceFor(SET - 20, SET), SET - 20, SET)).toBe(true);
  });
});

describe("slicePeaks", () => {
  // 1s of silence, then 1s at 0.5, then 1s at 0.25, at 1kHz for easy maths.
  const rate = 1000;
  const data = Float32Array.from({ length: 3 * rate }, (_, i) =>
    i < rate ? 0 : i < 2 * rate ? 0.5 : -0.25,
  );
  const audio = {
    numberOfChannels: 1,
    length: data.length,
    sampleRate: rate,
    getChannelData: () => data,
  };

  it("gives 10 peaks per second of the slice", () => {
    const peaks = slicePeaks(audio, 0, 3);
    expect(peaks).toHaveLength(30);
    expect(peaks[5]).toBe(0);
    expect(peaks[15]).toBe(0.5);
    expect(peaks[25]).toBe(0.25);
  });

  it("starts at the offset, skipping the MP3 preroll", () => {
    const peaks = slicePeaks(audio, 1, 2);
    expect(peaks).toHaveLength(20);
    expect(peaks[0]).toBe(0.5);
    expect(peaks[19]).toBe(0.25);
  });
});
