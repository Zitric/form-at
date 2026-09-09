import type { MusicSet } from "@form-at/data/sets";
import { fetchUploadedSets } from "@form-at/data/sets";
// Read data for the admin sets page's list + delete-confirmation +
// recently-deleted display. Kept in its own file rather than added to
// admin-stats.ts, which is strictly the read-only dashboard's data layer —
// same "owns a read for one specific mutating feature" precedent
// `push-sends.ts` set for notifications. The actual mutations
// (create/edit/delete) live in routes/api/sets.ts, which verifies the Access
// identity itself; this file is read-only.
import { createServerFn } from "@tanstack/react-start";

export type SetWithPlayCount = MusicSet & { playCount: number };

// Admin reads live D1 directly (via fetchUploadedSets, already exported by
// packages/data/src/sets.ts for exactly this "always-current" need) rather
// than the build-time snapshot the public site falls back to — the admin
// sees a just-uploaded or just-edited set immediately, without waiting for
// a deploy. Joins in a play count per set — the real signal for "how
// consequential would deleting this be," rather than a hardcoded "these 4 ids
// are legacy" list — via one extra query, not one query per set.
export async function fetchSetsWithPlayCounts(db: D1Database): Promise<SetWithPlayCount[]> {
  const [sets, playCounts] = await Promise.all([
    fetchUploadedSets(db),
    // COUNT(DISTINCT ...), not COUNT(*): `plays` has one row per ≥3s
    // LISTENING SEGMENT, not one row per play — see schema.sql's
    // `session_id` comment. This count is the delete-confirmation gate's
    // "type the exact play count" friction signal, so it needs to be the
    // real play count, not an inflated segment count.
    db
      .prepare(
        "SELECT set_id, COUNT(DISTINCT COALESCE(session_id, 'legacy-' || id)) AS n FROM plays GROUP BY set_id",
      )
      .all<{
        set_id: string;
        n: number;
      }>(),
  ]);

  const countsById = new Map(playCounts.results.map((row) => [row.set_id, row.n]));
  return sets.map((set) => ({ ...set, playCount: countsById.get(set.id) ?? 0 }));
}

export type RecentDeletedSet = {
  // `admin_deleted_sets`' own PK — the restore feature's target id, distinct
  // from `setId` because the same set id can be deleted-then-restored more
  // than once over time, each cycle producing its own log row.
  logId: number;
  deletedAt: number;
  deletedByEmail: string;
  setId: string;
  title: string;
  artist: string;
  playCountAtDeletion: number;
};

// The audit log that turns "recoverable in principle" (the R2 objects survive a
// delete, see routes/api/sets.ts's deleteSetWithAudit) into "recoverable in
// practice" — mirrors `fetchRecentPushSends`'s exact shape.
//
// `WHERE restored_at IS NULL`: once restored, a log entry stops appearing here,
// otherwise a second restore click on the same entry would just 409 against the
// row it already recreated. The row itself is never deleted — the audit trail
// survives, it's only excluded from this "still needs attention" view.
export async function fetchRecentDeletedSets(
  db: D1Database,
  limit = 10,
): Promise<RecentDeletedSet[]> {
  const result = await db
    .prepare(
      `SELECT id, deleted_at, deleted_by_email, set_id, title, artist, play_count_at_deletion
       FROM admin_deleted_sets
       WHERE restored_at IS NULL
       ORDER BY deleted_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: number;
      deleted_at: number;
      deleted_by_email: string;
      set_id: string;
      title: string;
      artist: string;
      play_count_at_deletion: number;
    }>();

  return result.results.map((row) => ({
    logId: row.id,
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
