import type { MusicSet } from "@form-at/data/sets";
import { fetchUploadedSets } from "@form-at/data/sets";
// Read data for the admin sets page's list + delete-confirmation +
// recently-deleted display (PR6, minimal edit/delete). Kept in its own
// file rather than added to admin-stats.ts, which is strictly the
// read-only dashboard's data layer — same "owns a read for one specific
// mutating feature" precedent `push-sends.ts` already set for
// notifications. The actual mutations (create/edit/delete) live in
// routes/api/sets.ts, which verifies the Access identity itself; this file
// is read-only.
import { createServerFn } from "@tanstack/react-start";

export type SetWithPlayCount = MusicSet & { playCount: number };

// Admin reads live D1 directly (via fetchUploadedSets, already exported by
// packages/data/src/sets.ts for exactly this "always-current" need) rather
// than the build-time snapshot the public site falls back to — the admin
// sees a just-uploaded or just-edited set immediately, without waiting for
// a deploy. Joins in a play count per set (PR6 review item 1a — the real
// signal for "how consequential would deleting this be," not a hardcoded
// "these 4 ids are legacy" list) via one extra query, not one query per set.
export async function fetchSetsWithPlayCounts(db: D1Database): Promise<SetWithPlayCount[]> {
  const [sets, playCounts] = await Promise.all([
    fetchUploadedSets(db),
    db.prepare("SELECT set_id, COUNT(*) AS n FROM plays GROUP BY set_id").all<{
      set_id: string;
      n: number;
    }>(),
  ]);

  const countsById = new Map(playCounts.results.map((row) => [row.set_id, row.n]));
  return sets.map((set) => ({ ...set, playCount: countsById.get(set.id) ?? 0 }));
}

export type RecentDeletedSet = {
  deletedAt: number;
  deletedByEmail: string;
  setId: string;
  title: string;
  artist: string;
  playCountAtDeletion: number;
};

// The audit log that turns "recoverable in principle" (the R2 objects
// survive a delete, see routes/api/sets.ts's deleteSetWithAudit) into
// "recoverable in practice" (PR6 review item 2a) — mirrors
// `fetchRecentPushSends`'s exact shape.
export async function fetchRecentDeletedSets(
  db: D1Database,
  limit = 10,
): Promise<RecentDeletedSet[]> {
  const result = await db
    .prepare(
      `SELECT deleted_at, deleted_by_email, set_id, title, artist, play_count_at_deletion
       FROM admin_deleted_sets
       ORDER BY deleted_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{
      deleted_at: number;
      deleted_by_email: string;
      set_id: string;
      title: string;
      artist: string;
      play_count_at_deletion: number;
    }>();

  return result.results.map((row) => ({
    deletedAt: row.deleted_at,
    deletedByEmail: row.deleted_by_email,
    setId: row.set_id,
    title: row.title,
    artist: row.artist,
    playCountAtDeletion: row.play_count_at_deletion,
  }));
}

export type SetsPageData = {
  sets: SetWithPlayCount[];
  recentDeletions: RecentDeletedSet[];
};

// Mirrors fetchNotificationsPageData's exact pattern — a createServerFn
// (not a raw db call in the route's own loader) so it inherits the same
// request-scoped context.cloudflare.env server.ts sets up.
export const fetchSetsPageData = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<SetsPageData> => {
    const cf = (context as unknown as Record<string, unknown>).cloudflare as
      | { env: { DB: D1Database } }
      | undefined;
    const db = cf?.env?.DB;
    if (!db) return { sets: [], recentDeletions: [] };

    const [sets, recentDeletions] = await Promise.all([
      fetchSetsWithPlayCounts(db),
      fetchRecentDeletedSets(db, 10),
    ]);
    return { sets, recentDeletions };
  },
);
