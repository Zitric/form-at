import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { movieDurationSeconds, topLevelBoxes } from "~/utils/storyVideo/mp4Boxes";
import { toProgressiveMp4 } from "~/utils/storyVideo/remux";

// A real Chrome MediaRecorder recording, cut after its second fragment: its
// headers claim ~3.4s (the first fragment) and mvhd 0, over 6.76s of media.
// That lie is what made Instagram keep only the start of a story.
const fixture = new Uint8Array(
  readFileSync(resolve(__dirname, "../../../fixtures/mediarecorder-fragmented.mp4")),
);
const types = (bytes: Uint8Array) => topLevelBoxes(bytes).boxes.map((b) => b.type);

describe("the MediaRecorder fixture", () => {
  it("is fragmented and declares no duration, like every recording", () => {
    expect(types(fixture)).toEqual(["ftyp", "moov", "moof", "mdat", "moof", "mdat"]);
    expect(movieDurationSeconds(fixture)).toBe(0);
  });
});

describe("toProgressiveMp4", () => {
  it("writes one moov, before the media, with no fragments", async () => {
    const out = await toProgressiveMp4(new Blob([fixture]));
    expect(types(out)).toEqual(["ftyp", "moov", "mdat"]);
  });

  it("declares the full length, not the first fragment's", async () => {
    const out = await toProgressiveMp4(new Blob([fixture]));
    // ffprobe on the fixture: 6.756599s.
    expect(movieDurationSeconds(out)).toBeCloseTo(6.7566, 2);
  });

  // Same samples, new index: only the headers change size.
  it("copies the media rather than re-encoding it", async () => {
    const out = await toProgressiveMp4(new Blob([fixture]));
    const mdat = (bytes: Uint8Array) => topLevelBoxes(bytes).boxes.filter((b) => b.type === "mdat");
    const payload = (bytes: Uint8Array) => mdat(bytes).reduce((n, b) => n + b.size - 8, 0);
    expect(payload(out)).toBe(payload(fixture));
  });

  it("refuses what isn't an MP4 rather than returning something", async () => {
    await expect(toProgressiveMp4(new Blob([new Uint8Array(64)]))).rejects.toThrow();
  });
});
