import { describe, expect, it } from "vitest";
import {
  FINE_PEAKS_FILE,
  generateUploadVersion,
  isValidSetId,
  isValidUploadVersion,
  uploadedArtworkName,
  versionedSetKey,
} from "~/r2Keys";

// The id becomes both an R2 object
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

const VERSION = "vmfzx1a2b-4c5d";

describe("generateUploadVersion / isValidUploadVersion", () => {
  it("is v + the time in base36 + 4 random base36 characters", () => {
    const version = generateUploadVersion(1_759_320_000_000, () => 0.5);
    expect(version).toBe(`v${(1_759_320_000_000).toString(36)}-iiii`);
    expect(isValidUploadVersion(version)).toBe(true);
  });

  it("produces valid, distinct versions in practice", () => {
    const versions = new Set(Array.from({ length: 200 }, () => generateUploadVersion()));
    expect(versions.size).toBe(200);
    for (const v of versions) expect(isValidUploadVersion(v)).toBe(true);
  });

  // A version becomes a key segment: anything path-shaped or loose is out.
  it("rejects anything that isn't exactly that shape", () => {
    for (const bad of [
      "",
      "v",
      "vmfzx1a2b",
      "vmfzx1a2b-4c5",
      "mfzx1a2b-4c5d",
      "v../x-4c5d",
      "vMFZX1A2B-4c5d",
      "vmfzx1a2b-4c5d/x",
    ]) {
      expect(isValidUploadVersion(bad)).toBe(false);
    }
  });
});

describe("versionedSetKey", () => {
  it("builds sets/{id}/{version}/{file}, any file name another writer needs", () => {
    expect(versionedSetKey("set-003-new-artist", VERSION, "peaks-fine.bin")).toBe(
      `sets/set-003-new-artist/${VERSION}/peaks-fine.bin`,
    );
  });

  it("throws on a bad id, version or file name", () => {
    expect(() => versionedSetKey("../x", VERSION, "audio.mp3")).toThrow("INVALID_SET_ID");
    expect(() => versionedSetKey("set-003-a", "../x", "audio.mp3")).toThrow(
      "INVALID_UPLOAD_VERSION",
    );
    for (const file of ["../audio.mp3", "a/b.mp3", ".hidden", ""]) {
      expect(() => versionedSetKey("set-003-a", VERSION, file)).toThrow("INVALID_FILE_NAME");
    }
  });
});

describe("uploadedArtworkName", () => {
  it("is uploads/{id}-{version}, so a re-upload's artwork gets new image URLs", () => {
    expect(uploadedArtworkName("set-003-new-artist", VERSION)).toBe(
      `uploads/set-003-new-artist-${VERSION}`,
    );
    expect(() => uploadedArtworkName("set-003-a", "nope")).toThrow("INVALID_UPLOAD_VERSION");
  });
});

describe("FINE_PEAKS_FILE", () => {
  it("is a file name versionedSetKey accepts", () => {
    expect(versionedSetKey("set-003-a", "vmupjr8nd-x08h", FINE_PEAKS_FILE)).toBe(
      "sets/set-003-a/vmupjr8nd-x08h/peaks-fine.bin",
    );
  });
});
