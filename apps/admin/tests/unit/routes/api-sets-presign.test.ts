// @vitest-environment node
//
// aws4fetch's SigV4 signing uses Web Crypto (HMAC-SHA256) — forced to
// Node's native environment rather than this project's default jsdom for
// the same reason verifyAccessJwt.test.ts is: jsdom's global
// Uint8Array/ArrayBuffer are distinct constructors from Node's, which has
// caused cross-realm WebCrypto failures in this repo before (jose's sign
// path). This module has zero DOM surface anyway.
import { describe, expect, it, vi } from "vitest";
import { presignSetUpload, validate } from "~/routes/api/sets-presign";

type FakeRoute = { match: RegExp; first?: unknown; throws?: boolean };

function createFakeD1(routes: FakeRoute[]) {
  const prepare = vi.fn((sql: string) => {
    const route = routes.find((r) => r.match.test(sql));
    if (!route) throw new Error(`No fake D1 route matched SQL:\n${sql}`);
    const statement = {
      bind: () => statement,
      first: async <T>() => {
        if (route.throws) throw new Error("simulated D1 failure");
        return (route.first ?? null) as T | null;
      },
    };
    return statement;
  });
  return { db: { prepare } as unknown as D1Database, prepare };
}

const validBody = { id: "set-003-new-artist", audioExt: "mp3", artworkExt: "jpg" } as const;
const fakeCreds = { accountId: "acct123", accessKeyId: "AKIAFAKE", secretAccessKey: "fakesecret" };

describe("validate (api/sets-presign)", () => {
  it("accepts a well-formed body", () => {
    expect(validate(validBody)).toEqual(validBody);
  });

  it("rejects non-object / null / primitive payloads", () => {
    expect(validate(null)).toBeNull();
    expect(validate(undefined)).toBeNull();
    expect(validate("string")).toBeNull();
    expect(validate(42)).toBeNull();
  });

  it("rejects an invalid id (path-traversal-shaped)", () => {
    expect(validate({ ...validBody, id: "../../etc" })).toBeNull();
    expect(validate({ ...validBody, id: "a/b" })).toBeNull();
  });

  it("rejects an audioExt not on the allowlist", () => {
    expect(validate({ ...validBody, audioExt: "wav" })).toBeNull();
  });

  it("rejects an artworkExt not on the allowlist", () => {
    expect(validate({ ...validBody, artworkExt: "gif" })).toBeNull();
  });

  it("rejects a missing field", () => {
    expect(validate({ audioExt: "mp3", artworkExt: "jpg" })).toBeNull();
  });
});

describe("presignSetUpload", () => {
  it("returns conflict without ever deriving keys or presigning, when the id already exists", async () => {
    const { db, prepare } = createFakeD1([{ match: /WHERE id = \?/, first: { 1: 1 } }]);

    const result = await presignSetUpload(db, fakeCreds, validBody);

    expect(result).toEqual({ outcome: "conflict" });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("presigns 3 URLs and returns public URLs when the id is available", async () => {
    const { db } = createFakeD1([{ match: /WHERE id = \?/, first: null }]);

    const result = await presignSetUpload(db, fakeCreds, validBody);

    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") throw new Error("expected ok");
    expect(result.response.publicAudioUrl).toBe(
      "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
    );
    expect(result.response.publicArtworkUrl).toBe(
      "https://cdn.formatglasgow.com/sets/set-003-new-artist/artwork.jpg",
    );
    expect(result.response.publicPeaksUrl).toBe(
      "https://cdn.formatglasgow.com/sets/set-003-new-artist/peaks.json",
    );
    expect(result.response.audioUploadUrl).toContain("acct123.r2.cloudflarestorage.com");
    expect(result.response.audioUploadUrl).toContain("X-Amz-Signature");
  });
});
