import { sets } from "@form-at/data/sets";
import { describe, expect, it, vi } from "vitest";
import { validate } from "~/routes/api/signal";

// No test file existed for this endpoint's `validate` before PR3 review
// flagged the gap — `api/event.ts` had precedence coverage, this didn't.
// `validate` is `async` (PR3) — set_id existence now goes through
// `isKnownSetId`, snapshot-first then D1-fallback-on-miss. `undefined` here
// means "no D1 binding at all" (matches local `vite dev`), same convention
// as api-event.test.ts.

const realSetId = sets[0]?.id;
if (!realSetId) throw new Error("test needs at least one set in the catalogue");

const validPayload = {
  setId: realSetId,
  setTitle: "Form:at 002",
  setArtist: "t.i.l.",
  listenedSeconds: 42,
  isOffline: false,
};

describe("validate (api/signal)", () => {
  it("accepts a well-formed payload", async () => {
    const result = await validate(validPayload, undefined);
    expect(result).toEqual(validPayload);
  });

  it("rejects non-object / null / primitive payloads", async () => {
    expect(await validate(null, undefined)).toBeNull();
    expect(await validate(undefined, undefined)).toBeNull();
    expect(await validate("string", undefined)).toBeNull();
    expect(await validate(42, undefined)).toBeNull();
  });

  it("rejects a missing / empty / oversized setId", async () => {
    expect(await validate({ ...validPayload, setId: undefined }, undefined)).toBeNull();
    expect(await validate({ ...validPayload, setId: "" }, undefined)).toBeNull();
    expect(await validate({ ...validPayload, setId: "x".repeat(201) }, undefined)).toBeNull();
  });

  it("rejects a setId that doesn't resolve to a known set (anti-spam, same rule as api/event.ts)", async () => {
    expect(await validate({ ...validPayload, setId: "not-a-real-set" }, undefined)).toBeNull();
  });

  it("rejects a missing / empty setTitle or setArtist", async () => {
    expect(await validate({ ...validPayload, setTitle: undefined }, undefined)).toBeNull();
    expect(await validate({ ...validPayload, setTitle: "" }, undefined)).toBeNull();
    expect(await validate({ ...validPayload, setArtist: undefined }, undefined)).toBeNull();
    expect(await validate({ ...validPayload, setArtist: "" }, undefined)).toBeNull();
  });

  it("truncates an oversized setTitle/setArtist to MAX_STR rather than rejecting", async () => {
    const result = await validate(
      { ...validPayload, setTitle: "x".repeat(500), setArtist: "y".repeat(500) },
      undefined,
    );
    expect(result?.setTitle).toHaveLength(200);
    expect(result?.setArtist).toHaveLength(200);
  });

  it("rejects a non-number / non-finite listenedSeconds", async () => {
    expect(await validate({ ...validPayload, listenedSeconds: "42" }, undefined)).toBeNull();
    expect(await validate({ ...validPayload, listenedSeconds: Number.NaN }, undefined)).toBeNull();
    expect(
      await validate({ ...validPayload, listenedSeconds: Number.POSITIVE_INFINITY }, undefined),
    ).toBeNull();
  });

  it("floors a fractional listenedSeconds", async () => {
    const result = await validate({ ...validPayload, listenedSeconds: 42.9 }, undefined);
    expect(result?.listenedSeconds).toBe(42);
  });

  it("rejects listenedSeconds below the 3s minimum (defense in depth)", async () => {
    expect(await validate({ ...validPayload, listenedSeconds: 2 }, undefined)).toBeNull();
  });

  it("rejects listenedSeconds above the 4h maximum", async () => {
    expect(
      await validate({ ...validPayload, listenedSeconds: 4 * 60 * 60 + 1 }, undefined),
    ).toBeNull();
  });

  it("treats a missing/non-boolean isOffline as null (pre-2026-07-08 rows / rollout window)", async () => {
    expect(await validate({ ...validPayload, isOffline: undefined }, undefined)).toMatchObject({
      isOffline: null,
    });
    expect(await validate({ ...validPayload, isOffline: "yes" }, undefined)).toMatchObject({
      isOffline: null,
    });
  });

  it("passes through isOffline: true", async () => {
    const result = await validate({ ...validPayload, isOffline: true }, undefined);
    expect(result?.isOffline).toBe(true);
  });

  // Validation precedence (PR3, item 2): snapshot first — free, covers every
  // set that existed at last deploy — D1 only on a miss. Same coverage as
  // api-event.test.ts, since both endpoints share `isKnownSetId`.
  it("snapshot-hit setId never touches D1", async () => {
    const first = vi.fn();
    const fakeDb = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;

    const result = await validate(validPayload, fakeDb);

    expect(result).toEqual(validPayload);
    expect(first).not.toHaveBeenCalled();
  });

  it("snapshot-miss setId falls back to exactly one D1 query, and accepts on a D1 hit", async () => {
    const first = vi.fn().mockResolvedValue({ 1: 1 });
    const fakeDb = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;

    const result = await validate({ ...validPayload, setId: "uploaded-since-last-deploy" }, fakeDb);

    expect(result).toMatchObject({ setId: "uploaded-since-last-deploy" });
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("snapshot-miss + D1-miss rejects", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const fakeDb = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;

    expect(await validate({ ...validPayload, setId: "not-a-real-set" }, fakeDb)).toBeNull();
    expect(first).toHaveBeenCalledTimes(1);
  });
});
