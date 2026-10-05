import type { MusicSet } from "@form-at/data/sets";
import { describe, expect, it } from "vitest";
import { artworkUrls, djPhotoUrl, photoStatusLine } from "~/utils/storyVideo/storyImages";

const set: MusicSet = {
  id: "set-003-unreal",
  title: "Form:at 003",
  artist: "Unreal",
  date: "2026-08-28",
  djId: "unreal",
  src: "https://cdn.formatglasgow.com/sets/set-003-unreal/audio.mp3",
  artwork: "uploads/set-003-unreal",
  artworkOriginalUrl: "https://cdn.formatglasgow.com/sets/set-003-unreal/artwork.png",
};

describe("djPhotoUrl", () => {
  it("is the DJ's 1080 webp, same-origin so it can't taint the canvas", () => {
    expect(djPhotoUrl(set)).toBe("/images/djs/unreal-1080.webp");
  });

  // Both fall back to the artwork in the card.
  it("is null for a set with no DJ", () => {
    expect(djPhotoUrl({ ...set, djId: undefined })).toBeNull();
  });

  it("is null for a DJ id the roster doesn't have, so no photo", () => {
    expect(djPhotoUrl({ ...set, djId: "not-in-the-roster" })).toBeNull();
  });
});

describe("artworkUrls", () => {
  it("tries the optimised webp, then the uploaded original", () => {
    expect(artworkUrls(set)).toEqual([
      "/images/uploads/set-003-unreal-1080.webp",
      "https://cdn.formatglasgow.com/sets/set-003-unreal/artwork.png",
    ]);
  });

  it("skips what a set doesn't have", () => {
    expect(artworkUrls({ ...set, artworkOriginalUrl: undefined })).toEqual([
      "/images/uploads/set-003-unreal-1080.webp",
    ]);
  });
});

describe("photoStatusLine", () => {
  const url = "/images/djs/til-1080.webp";

  it("says which photo loaded", () => {
    expect(photoStatusLine({ photo: {}, photoUrl: url })).toBe(`photo: ${url} loaded`);
  });

  // The card silently falls back to the artwork; this is the only trace.
  it("says which photo failed", () => {
    expect(photoStatusLine({ photo: null, photoUrl: url })).toBe(`photo: ${url} failed`);
  });

  it("says none when there was no photo to try, and pending before the assets load", () => {
    expect(photoStatusLine({ photo: null, photoUrl: null })).toBe("photo: none");
    expect(photoStatusLine(null)).toBe("photo: pending");
  });
});
