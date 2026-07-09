import { describe, expect, it } from "vitest";
import { sets } from "~/data/sets";
import { validate } from "~/routes/api/event";
import { TRACKABLE_EVENT_TYPES } from "~/utils/trackableEvents";

// Locks the allowlist guard (Step 2, 2026-07-08): `events` must never become
// a dumping ground for arbitrary strings. Every accepted event_type is
// enumerated in `utils/trackableEvents.ts`; anything else is rejected.

const realSetId = sets[0]?.id;
if (!realSetId) throw new Error("test needs at least one set in the catalogue");

describe("validate (api/event)", () => {
  it("accepts every allowlisted event_type with no set_id", () => {
    for (const eventType of TRACKABLE_EVENT_TYPES) {
      const result = validate({ event_type: eventType, is_standalone: true });
      expect(result).toEqual({ eventType, setId: null, isStandalone: true });
    }
  });

  it("rejects an event_type not on the allowlist", () => {
    expect(validate({ event_type: "totally_made_up_event", is_standalone: false })).toBeNull();
  });

  it("rejects a missing event_type", () => {
    expect(validate({ is_standalone: true })).toBeNull();
  });

  it("rejects a non-boolean is_standalone", () => {
    expect(validate({ event_type: "app_launch", is_standalone: "yes" })).toBeNull();
  });

  it("accepts a real set_id and passes it through", () => {
    const result = validate({ event_type: "save_click", set_id: realSetId, is_standalone: true });
    expect(result).toEqual({ eventType: "save_click", setId: realSetId, isStandalone: true });
  });

  it("rejects a set_id that doesn't resolve to a known set (anti-spam, same rule as api/signal.ts)", () => {
    expect(
      validate({ event_type: "save_click", set_id: "not-a-real-set", is_standalone: true }),
    ).toBeNull();
  });

  it("treats a null set_id the same as an absent one", () => {
    const result = validate({ event_type: "app_launch", set_id: null, is_standalone: true });
    expect(result).toEqual({ eventType: "app_launch", setId: null, isStandalone: true });
  });

  it("rejects non-object / null / primitive payloads", () => {
    expect(validate(null)).toBeNull();
    expect(validate(undefined)).toBeNull();
    expect(validate("string")).toBeNull();
    expect(validate(42)).toBeNull();
  });
});
