import { describe, expect, it } from "vitest";
import { fetchRecentPushSends, recordPushSend } from "~/data/push-sends";

// Minimal fake D1, purpose-built for this file — admin-stats.test.ts
// defines its own similarly-shaped fake rather than sharing one, so this
// follows the same precedent rather than introducing a new shared helper
// for a single additional consumer. `lastBoundParams` captures whatever the
// most recent `.bind(...)` call received, regardless of whether the
// statement is later run via `.all()` or `.run()`.
function createFakeD1(rows: Record<string, unknown>[] = []) {
  const state = { lastBoundParams: [] as unknown[] };
  const db = {
    prepare: () => {
      const statement = {
        bind: (...params: unknown[]) => {
          state.lastBoundParams = params;
          return statement;
        },
        all: async () => ({ results: rows }),
        run: async () => ({ success: true }),
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, state };
}

describe("fetchRecentPushSends", () => {
  it("maps snake_case D1 rows to camelCase", async () => {
    const { db } = createFakeD1([
      {
        sent_at: 1_722_000_000_000,
        sent_by_email: "julian@example.com",
        title: "New set dropped",
        sent_count: 5,
        failed_count: 1,
        dead_removed_count: 0,
      },
    ]);

    expect(await fetchRecentPushSends(db)).toEqual([
      {
        sentAt: 1_722_000_000_000,
        sentByEmail: "julian@example.com",
        title: "New set dropped",
        sentCount: 5,
        failedCount: 1,
        deadRemovedCount: 0,
      },
    ]);
  });

  it("returns an empty array when there are no sends yet", async () => {
    const { db } = createFakeD1([]);
    expect(await fetchRecentPushSends(db)).toEqual([]);
  });

  it("binds the limit parameter", async () => {
    const { db, state } = createFakeD1([]);
    await fetchRecentPushSends(db, 3);
    expect(state.lastBoundParams).toEqual([3]);
  });
});

describe("recordPushSend", () => {
  it("binds every field in order, with url/image null when absent", async () => {
    const { db, state } = createFakeD1();

    await recordPushSend(
      db,
      {
        sentByEmail: "julian@example.com",
        title: "New set dropped",
        body: "Check it out",
        recipientCount: 5,
        sentCount: 4,
        failedCount: 1,
        deadRemovedCount: 0,
      },
      1_722_000_000_000,
    );

    expect(state.lastBoundParams).toEqual([
      1_722_000_000_000,
      "julian@example.com",
      "New set dropped",
      "Check it out",
      null,
      null,
      5,
      4,
      1,
      0,
    ]);
  });

  it("passes url/image through when present", async () => {
    const { db, state } = createFakeD1();

    await recordPushSend(
      db,
      {
        sentByEmail: "julian@example.com",
        title: "t",
        body: "b",
        url: "/sets/003",
        image: "/images/003.webp",
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
        deadRemovedCount: 0,
      },
      1_722_000_000_000,
    );

    expect(state.lastBoundParams).toEqual([
      1_722_000_000_000,
      "julian@example.com",
      "t",
      "b",
      "/sets/003",
      "/images/003.webp",
      1,
      1,
      0,
      0,
    ]);
  });
});
