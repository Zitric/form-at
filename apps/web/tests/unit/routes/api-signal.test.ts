import { sets } from "@form-at/data/sets";
import { describe, expect, it, vi } from "vitest";
import { validate } from "~/routes/api/signal";
import { MAX_LISTENED_SECONDS, maxListenedSecondsForDuration } from "~/utils/playTracking";

// Precedence coverage for this endpoint's `validate`, matching
// api-event.test.ts's. `validate` is `async` — set_id existence (and
// duration, for the per-track ceiling below) goes through
// `resolveKnownSet`, snapshot-first then D1-fallback-on-miss. `undefined`
// here means "no D1 binding at all" (matches local `vite dev`), same
// convention as api-event.test.ts.

const realSet = sets[0];
if (!realSet) throw new Error("test needs at least one set in the catalogue");
const realSetId = realSet.id;
if (!realSet.duration) throw new Error("test needs sets[0] to have a duration");
// Derived from the real fixture via the actual function under test, not
// hardcoded — so a future change to sets[0]'s duration or to the grace
// margin fails this test loudly instead of silently testing the wrong
// ceiling.
const realSetCeiling = maxListenedSecondsForDuration(realSet.duration);

const validPayload = {
  setId: realSetId,
  setTitle: "Form:at 002",
  setArtist: "t.i.l.",
  listenedSeconds: 42,
  isOffline: false,
  sessionId: "session-abc-123",
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

  it("rejects listenedSeconds above the reported set's own duration-derived ceiling", async () => {
    expect(
      await validate({ ...validPayload, listenedSeconds: realSetCeiling + 1 }, undefined),
    ).toBeNull();
  });

  it("accepts listenedSeconds right at the set's own duration-derived ceiling", async () => {
    const result = await validate({ ...validPayload, listenedSeconds: realSetCeiling }, undefined);
    expect(result?.listenedSeconds).toBe(realSetCeiling);
  });

  it("accepts a full uninterrupted listen of a set longer than the old fixed 2h ceiling (the Unreal bug)", async () => {
    const longSet = { duration: "2:20:51" }; // 8451s — set-003-unreal's real duration
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => ({ duration: longSet.duration }) }) }),
    } as unknown as D1Database;

    const result = await validate(
      { ...validPayload, setId: "uploaded-since-last-deploy", listenedSeconds: 8451 },
      db,
    );

    expect(result?.listenedSeconds).toBe(8451);
  });

  it("falls back to MAX_LISTENED_SECONDS when a known set's duration can't be resolved", async () => {
    const db = {
      prepare: () => ({ bind: () => ({ first: async () => ({ duration: null }) }) }),
    } as unknown as D1Database;

    const atFallback = await validate(
      {
        ...validPayload,
        setId: "uploaded-since-last-deploy",
        listenedSeconds: MAX_LISTENED_SECONDS,
      },
      db,
    );
    expect(atFallback?.listenedSeconds).toBe(MAX_LISTENED_SECONDS);

    const overFallback = await validate(
      {
        ...validPayload,
        setId: "uploaded-since-last-deploy",
        listenedSeconds: MAX_LISTENED_SECONDS + 1,
      },
      db,
    );
    expect(overFallback).toBeNull();
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

  it("treats a missing/non-string/oversized sessionId as null (pre-fix rows / rollout window / bad input)", async () => {
    expect(await validate({ ...validPayload, sessionId: undefined }, undefined)).toMatchObject({
      sessionId: null,
    });
    expect(await validate({ ...validPayload, sessionId: 42 }, undefined)).toMatchObject({
      sessionId: null,
    });
    expect(await validate({ ...validPayload, sessionId: "" }, undefined)).toMatchObject({
      sessionId: null,
    });
    expect(
      await validate({ ...validPayload, sessionId: "x".repeat(201) }, undefined),
    ).toMatchObject({ sessionId: null });
  });

  it("passes through a well-formed sessionId", async () => {
    const result = await validate({ ...validPayload, sessionId: "abc-123" }, undefined);
    expect(result?.sessionId).toBe("abc-123");
  });

  // Validation precedence: snapshot first for the existence/duration
  // query — D1 only on a miss. Same coverage as api-event.test.ts's
  // isKnownSetId tests, since both endpoints' existence checks share
  // `resolveKnownSet` (signal.ts uses it directly for the duration too;
  // event.ts goes through the `isKnownSetId` wrapper).
  it("snapshot-hit setId never queries the sets table for existence/duration", async () => {
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
