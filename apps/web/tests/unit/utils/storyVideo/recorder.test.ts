import { describe, expect, it } from "vitest";
import { STORY_MIME_TYPES, pickStoryMimeType } from "~/utils/storyVideo/recorder";

// Recording itself needs a real browser: tests/e2e/story-video.spec.ts.

describe("pickStoryMimeType", () => {
  const supports =
    (...types: string[]) =>
    (type: string) =>
      types.includes(type);

  it("prefers the most specific H.264 High + AAC type", () => {
    expect(pickStoryMimeType(supports(...STORY_MIME_TYPES))).toBe(STORY_MIME_TYPES[0]);
  });

  it("falls back to the generic H.264 + AAC type", () => {
    expect(pickStoryMimeType(supports("video/mp4;codecs=avc1,mp4a.40.2"))).toBe(
      "video/mp4;codecs=avc1,mp4a.40.2",
    );
  });

  // What Firefox offers, and what Chrome also records: a file that records
  // fine and then fails at Instagram. Neither may ever be chosen.
  it("never picks WebM or Opus-in-MP4", () => {
    const firefoxAndMore = supports(
      "video/webm",
      "video/webm;codecs=vp8,opus",
      "video/mp4;codecs=avc1,opus",
      "video/mp4",
    );
    expect(pickStoryMimeType(firefoxAndMore)).toBeNull();
  });

  it("is null where MediaRecorder doesn't exist", () => {
    expect(pickStoryMimeType()).toBeNull(); // jsdom has no MediaRecorder
  });
});
