import { describe, expect, it, vi } from "vitest";
import { insertSetWithRetry, validate } from "~/routes/api/sets";

const validBody = {
  id: "set-003-new-artist",
  title: "Form:at 003",
  artist: "New Artist",
  date: "2026-09-01",
  audioExt: "mp3",
  artworkExt: "jpg",
} as const;

describe("validate (api/sets)", () => {
  it("accepts the minimal required fields", () => {
    expect(validate(validBody)).toEqual({
      id: "set-003-new-artist",
      title: "Form:at 003",
      artist: "New Artist",
      date: "2026-09-01",
      venue: undefined,
      description: undefined,
      duration: undefined,
      sizeBytes: undefined,
      audioExt: "mp3",
      artworkExt: "jpg",
    });
  });

  it("accepts every optional field populated", () => {
    const full = {
      ...validBody,
      venue: "Find the red door, Glasgow",
      description: "A description.",
      duration: "45:18",
      sizeBytes: 108_761_280,
    };
    expect(validate(full)).toMatchObject({
      venue: "Find the red door, Glasgow",
      description: "A description.",
      duration: "45:18",
      sizeBytes: 108_761_280,
    });
  });

  it("rejects non-object / null / primitive payloads", () => {
    expect(validate(null)).toBeNull();
    expect(validate(undefined)).toBeNull();
    expect(validate("string")).toBeNull();
    expect(validate(42)).toBeNull();
  });

  it("rejects a missing or empty id", () => {
    expect(validate({ ...validBody, id: undefined })).toBeNull();
    expect(validate({ ...validBody, id: "" })).toBeNull();
  });

  it("rejects a missing/empty/oversized title or artist", () => {
    expect(validate({ ...validBody, title: undefined })).toBeNull();
    expect(validate({ ...validBody, title: "" })).toBeNull();
    expect(validate({ ...validBody, title: "a".repeat(201) })).toBeNull();
    expect(validate({ ...validBody, artist: undefined })).toBeNull();
    expect(validate({ ...validBody, artist: "" })).toBeNull();
  });

  it("rejects a date not in YYYY-MM-DD form", () => {
    expect(validate({ ...validBody, date: "09/01/2026" })).toBeNull();
    expect(validate({ ...validBody, date: "2026-9-1" })).toBeNull();
  });

  it("rejects an oversized venue/description/duration", () => {
    expect(validate({ ...validBody, venue: "a".repeat(201) })).toBeNull();
    expect(validate({ ...validBody, description: "a".repeat(2001) })).toBeNull();
    expect(validate({ ...validBody, duration: "a".repeat(21) })).toBeNull();
  });

  it("rejects a non-positive or non-finite sizeBytes", () => {
    expect(validate({ ...validBody, sizeBytes: 0 })).toBeNull();
    expect(validate({ ...validBody, sizeBytes: -5 })).toBeNull();
    expect(validate({ ...validBody, sizeBytes: Number.NaN })).toBeNull();
    expect(validate({ ...validBody, sizeBytes: "108761280" })).toBeNull();
  });

  it("rejects an audioExt/artworkExt not on the allowlist", () => {
    expect(validate({ ...validBody, audioExt: "wav" })).toBeNull();
    expect(validate({ ...validBody, artworkExt: "gif" })).toBeNull();
  });
});

const sampleRow = {
  id: "set-003-new-artist",
  title: "Form:at 003",
  artist: "New Artist",
  date: "2026-09-01",
  venue: null,
  description: null,
  duration: null,
  src: "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
  artwork: "sets/set-003-new-artist",
  artworkOriginalUrl: "https://cdn.formatglasgow.com/sets/set-003-new-artist/artwork.jpg",
  peaks: "https://cdn.formatglasgow.com/sets/set-003-new-artist/peaks.json",
  sizeBytes: null,
  createdAt: 1785800000000,
};

function createFakeD1(run: () => Promise<void>) {
  const runSpy = vi.fn(run);
  const statement = { bind: () => statement, run: runSpy };
  const prepare = vi.fn(() => statement);
  return { db: { prepare } as unknown as D1Database, prepare, run: runSpy };
}

describe("insertSetWithRetry", () => {
  it("returns 'created' on a successful insert with no retry", async () => {
    const { db, run } = createFakeD1(async () => {});

    expect(await insertSetWithRetry(db, sampleRow)).toBe("created");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("returns 'conflict' immediately on a UNIQUE constraint violation — never retried", async () => {
    let calls = 0;
    const { db, run } = createFakeD1(async () => {
      calls++;
      throw new Error("UNIQUE constraint failed: sets.id");
    });

    expect(await insertSetWithRetry(db, sampleRow)).toBe("conflict");
    expect(run).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
  });

  it("retries a transient error twice with backoff, then succeeds", async () => {
    let attempt = 0;
    const { db, run } = createFakeD1(async () => {
      attempt++;
      if (attempt < 3) throw new Error("simulated transient D1 error");
    });

    expect(await insertSetWithRetry(db, sampleRow)).toBe("created");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("returns 'failed' after exhausting retries on a persistent transient error", async () => {
    const { db, run } = createFakeD1(async () => {
      throw new Error("simulated persistent D1 error");
    });

    expect(await insertSetWithRetry(db, sampleRow)).toBe("failed");
    expect(run).toHaveBeenCalledTimes(3);
  });
});
