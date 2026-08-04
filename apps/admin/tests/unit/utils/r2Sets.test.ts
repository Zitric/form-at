import { describe, expect, it } from "vitest";
import { deriveSetR2Keys, isValidSetId } from "~/utils/r2Sets";

// Set-upload feature (PR4, review item): the id becomes both an R2 object
// key path segment AND a public URL path segment — the one place in this
// flow the client controls something structural (it's auto-generated but
// user-editable). Strict allowlist, no denylist — these lock the exact
// path-traversal-shaped inputs the review specifically called out.

describe("isValidSetId", () => {
  it("accepts the real convention's shape", () => {
    expect(isValidSetId("set-002-til")).toBe(true);
    expect(isValidSetId("set-002-brandon-lee-vear")).toBe(true);
  });

  it("rejects a slash (path-traversal-shaped)", () => {
    expect(isValidSetId("sets/002/../../etc")).toBe(false);
    expect(isValidSetId("a/b")).toBe(false);
  });

  it("rejects a literal .. segment", () => {
    expect(isValidSetId("set-..-til")).toBe(false);
    expect(isValidSetId("..")).toBe(false);
  });

  it("rejects a percent-encoded byte", () => {
    expect(isValidSetId("set%2e%2e-til")).toBe(false);
    expect(isValidSetId("set-002-til%00")).toBe(false);
  });

  it("rejects uppercase", () => {
    expect(isValidSetId("Set-002-Til")).toBe(false);
  });

  it("rejects whitespace", () => {
    expect(isValidSetId("set 002 til")).toBe(false);
    expect(isValidSetId("set-002-til ")).toBe(false);
  });

  it("rejects a unicode lookalike digit/letter", () => {
    // U+0430 CYRILLIC SMALL LETTER A (looks identical to ASCII 'a')
    expect(isValidSetId("set-002-аrtist")).toBe(false);
    // Fullwidth digit lookalikes
    expect(isValidSetId("set-００２-til")).toBe(false);
  });

  it("rejects a leading or trailing hyphen", () => {
    expect(isValidSetId("-set-002-til")).toBe(false);
    expect(isValidSetId("set-002-til-")).toBe(false);
  });

  it("rejects an empty segment (double hyphen)", () => {
    expect(isValidSetId("set--002-til")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidSetId("")).toBe(false);
  });

  it("rejects a string under the minimum length", () => {
    expect(isValidSetId("ab")).toBe(false);
  });

  it("rejects an over-length string", () => {
    expect(isValidSetId(`set-${"a".repeat(200)}`)).toBe(false);
  });
});

describe("deriveSetR2Keys", () => {
  it("derives keys and public URLs from a valid id", () => {
    const result = deriveSetR2Keys("set-003-new-artist", { audio: "mp3", artwork: "jpg" });

    expect(result).toEqual({
      audioKey: "sets/set-003-new-artist/audio.mp3",
      artworkKey: "sets/set-003-new-artist/artwork.jpg",
      peaksKey: "sets/set-003-new-artist/peaks.json",
      publicAudioUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
      publicArtworkUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/artwork.jpg",
      publicPeaksUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/peaks.json",
    });
  });

  // The fail-closed defense-in-depth check (PR4 review) — this must throw
  // regardless of whether some call site validated the id first, since this
  // is the function that actually turns it into a key/URL segment.
  it("throws on an invalid id rather than silently building a key from it", () => {
    expect(() => deriveSetR2Keys("../../etc/passwd", { audio: "mp3", artwork: "jpg" })).toThrow(
      "INVALID_SET_ID",
    );
    expect(() => deriveSetR2Keys("", { audio: "mp3", artwork: "jpg" })).toThrow("INVALID_SET_ID");
  });
});
