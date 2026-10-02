import { describe, expect, it } from "vitest";
import { deriveSetR2Keys } from "~/utils/r2Sets";

// The key helpers themselves (isValidSetId, versions, versionedSetKey) are
// tested in packages/data/tests/unit/r2Keys.test.ts.

const VERSION = "vmfzx1a2b-4c5d";

describe("deriveSetR2Keys", () => {
  it("derives versioned keys and public URLs", () => {
    const result = deriveSetR2Keys("set-003-new-artist", VERSION, { audio: "mp3", artwork: "jpg" });

    const key = `sets/set-003-new-artist/${VERSION}`;
    expect(result).toEqual({
      audioKey: `${key}/audio.mp3`,
      artworkKey: `${key}/artwork.jpg`,
      peaksKey: `${key}/peaks.json`,
      finePeaksKey: `${key}/peaks-fine.bin`,
      publicAudioUrl: `https://cdn.formatglasgow.com/${key}/audio.mp3`,
      publicArtworkUrl: `https://cdn.formatglasgow.com/${key}/artwork.jpg`,
      publicPeaksUrl: `https://cdn.formatglasgow.com/${key}/peaks.json`,
      publicFinePeaksUrl: `https://cdn.formatglasgow.com/${key}/peaks-fine.bin`,
    });
  });

  // The fail-closed defense-in-depth check — this must throw
  // regardless of whether some call site validated the id first, since this
  // is the function that actually turns it into a key/URL segment.
  it("throws on an invalid id or version rather than silently building a key", () => {
    const exts = { audio: "mp3", artwork: "jpg" };
    expect(() => deriveSetR2Keys("../../etc/passwd", VERSION, exts)).toThrow("INVALID_SET_ID");
    expect(() => deriveSetR2Keys("", VERSION, exts)).toThrow("INVALID_SET_ID");
    expect(() => deriveSetR2Keys("set-003-new-artist", "../..", exts)).toThrow(
      "INVALID_UPLOAD_VERSION",
    );
  });
});
