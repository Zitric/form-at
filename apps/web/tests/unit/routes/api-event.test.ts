import { sets } from "@form-at/data/sets";
import { describe, expect, it, vi } from "vitest";
import { validate } from "~/routes/api/event";
import { TRACKABLE_EVENT_TYPES } from "~/utils/trackableEvents";

// Locks the allowlist guard (Step 2, 2026-07-08): `events` must never become
// a dumping ground for arbitrary strings. Every accepted event_type is
// enumerated in `utils/trackableEvents.ts`; anything else is rejected.

const realSetId = sets[0]?.id;
if (!realSetId) throw new Error("test needs at least one set in the catalogue");

// `validate` is `async` (PR3) — set_id existence now goes through
// `isKnownSetId`, snapshot-first then D1-fallback-on-miss. `undefined` here
// means "no D1 binding at all" (matches local `vite dev`), which
// `isKnownSetId` already treats as "snapshot-only, reject on miss".
describe("validate (api/event)", () => {
  it("accepts every allowlisted event_type with no set_id", async () => {
    for (const eventType of TRACKABLE_EVENT_TYPES) {
      const result = await validate({ event_type: eventType, is_standalone: true }, undefined);
      expect(result).toEqual({ eventType, setId: null, isStandalone: true });
    }
  });

  it("rejects an event_type not on the allowlist", async () => {
    expect(
      await validate({ event_type: "totally_made_up_event", is_standalone: false }, undefined),
    ).toBeNull();
  });

  // The accept-everything loop above would pass even if these were dropped
  // from the allowlist — this locks their PRESENCE, since the soft-prompt
  // modal fires all four (feat/push-optin-modal, 2026-07-16).
  it("keeps the push opt-in quartet on the allowlist", () => {
    for (const eventType of [
      "notify_prompt_shown",
      "notify_accepted",
      "notify_declined",
      "notify_install_nudge_shown",
    ]) {
      expect(TRACKABLE_EVENT_TYPES).toContain(eventType);
    }
  });

  // Same reasoning as the quartet above — locks the PRESENCE of
  // calendar_add_click (feat/calendar-tracking-and-dashboard, 2026-08-02),
  // fired by AddToCalendarButton for all three calendar destinations.
  it("keeps calendar_add_click on the allowlist", () => {
    expect(TRACKABLE_EVENT_TYPES).toContain("calendar_add_click");
  });

  it("rejects a missing event_type", async () => {
    expect(await validate({ is_standalone: true }, undefined)).toBeNull();
  });

  it("rejects a non-boolean is_standalone", async () => {
    expect(
      await validate({ event_type: "app_launch", is_standalone: "yes" }, undefined),
    ).toBeNull();
  });

  it("accepts a real set_id and passes it through", async () => {
    const result = await validate(
      { event_type: "save_click", set_id: realSetId, is_standalone: true },
      undefined,
    );
    expect(result).toEqual({ eventType: "save_click", setId: realSetId, isStandalone: true });
  });

  it("rejects a set_id that doesn't resolve to a known set (anti-spam, same rule as api/signal.ts)", async () => {
    expect(
      await validate(
        { event_type: "save_click", set_id: "not-a-real-set", is_standalone: true },
        undefined,
      ),
    ).toBeNull();
  });

  it("treats a null set_id the same as an absent one", async () => {
    const result = await validate(
      { event_type: "app_launch", set_id: null, is_standalone: true },
      undefined,
    );
    expect(result).toEqual({ eventType: "app_launch", setId: null, isStandalone: true });
  });

  it("rejects non-object / null / primitive payloads", async () => {
    expect(await validate(null, undefined)).toBeNull();
    expect(await validate(undefined, undefined)).toBeNull();
    expect(await validate("string", undefined)).toBeNull();
    expect(await validate(42, undefined)).toBeNull();
  });

  // Validation precedence (PR3, item 2): snapshot first — free, covers every
  // set that existed at last deploy — D1 only on a miss. Proven here via a
  // fake D1 whose `.first()` is a spy: a snapshot-hit id must never reach it.
  it("snapshot-hit set_id never touches D1", async () => {
    const first = vi.fn();
    const fakeDb = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;

    const result = await validate(
      { event_type: "save_click", set_id: realSetId, is_standalone: true },
      fakeDb,
    );

    expect(result).toEqual({ eventType: "save_click", setId: realSetId, isStandalone: true });
    expect(first).not.toHaveBeenCalled();
  });

  it("snapshot-miss set_id falls back to exactly one D1 query, and accepts on a D1 hit", async () => {
    const first = vi.fn().mockResolvedValue({ 1: 1 });
    const fakeDb = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;

    const result = await validate(
      { event_type: "save_click", set_id: "uploaded-since-last-deploy", is_standalone: true },
      fakeDb,
    );

    expect(result).toEqual({
      eventType: "save_click",
      setId: "uploaded-since-last-deploy",
      isStandalone: true,
    });
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("snapshot-miss + D1-miss rejects", async () => {
    const first = vi.fn().mockResolvedValue(null);
    const fakeDb = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;

    expect(
      await validate(
        { event_type: "save_click", set_id: "not-a-real-set", is_standalone: true },
        fakeDb,
      ),
    ).toBeNull();
    expect(first).toHaveBeenCalledTimes(1);
  });
});
