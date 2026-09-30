import { describe, expect, it } from "vitest";
import { previewSpectrumLevels } from "~/utils/storyVideo/renderer";

// A two-channel excerpt: silence for the first half, a 1kHz tone for the second.
function halfSilentHalfTone(rate = 48000, seconds = 4) {
  const length = rate * seconds;
  const data = Float32Array.from({ length }, (_, i) =>
    i < length / 2 ? 0 : 0.5 * Math.sin((2 * Math.PI * 1000 * i) / rate),
  );
  return {
    numberOfChannels: 2,
    length,
    sampleRate: rate,
    getChannelData: () => data,
  };
}

describe("previewSpectrumLevels", () => {
  const excerpt = { audio: halfSilentHalfTone(), offsetSeconds: 0, durationSeconds: 4 };

  it("reads the spectrum at the requested point of the excerpt", () => {
    expect(Math.max(...previewSpectrumLevels(excerpt, 0.25))).toBe(0);
    expect(Math.max(...previewSpectrumLevels(excerpt, 0.75))).toBeGreaterThan(0.5);
  });

  it("measures from the excerpt's offset, not the buffer's start", () => {
    const shifted = { ...excerpt, offsetSeconds: 2, durationSeconds: 2 };
    expect(Math.max(...previewSpectrumLevels(shifted, 0.5))).toBeGreaterThan(0.5);
  });

  it("puts a 1kHz tone in the band that contains 1kHz", () => {
    const levels = Array.from(previewSpectrumLevels(excerpt, 0.75));
    const loudest = levels.indexOf(Math.max(...levels));
    // 72 log bands from 50Hz to 16kHz: 1kHz falls in band ⌊72·log(20)/log(320)⌋ = 37.
    expect(loudest).toBe(Math.floor((72 * Math.log(1000 / 50)) / Math.log(16000 / 50)));
  });
});
