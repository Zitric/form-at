// Read + write for the admin_push_sends table. Kept in its own file rather than added to
// admin-stats.ts, which is strictly the read-only dashboard's data layer —
// this file owns both a read (for the notifications page's recent-sends
// list) and a write (recording each send) for the notifications feature
// specifically. Same directly-callable, unit-testable-with-a-fake-D1
// convention admin-stats.ts already established.
//
// Schema: see apps/web/schema.sql's `admin_push_sends` table. Migrations are
// applied by hand against the remote database, never by running schema.sql as
// a file — it holds non-idempotent ALTERs that fail on a second run.
import { createServerFn } from "@tanstack/react-start";
import { fetchPushSubscriberStats } from "./admin-stats";

export type RecentPushSend = {
  sentAt: number;
  sentByEmail: string;
  title: string;
  sentCount: number;
  failedCount: number;
  deadRemovedCount: number;
};

export async function fetchRecentPushSends(db: D1Database, limit = 10): Promise<RecentPushSend[]> {
  const result = await db
    .prepare(
      `SELECT sent_at, sent_by_email, title, sent_count, failed_count, dead_removed_count
       FROM admin_push_sends
       ORDER BY sent_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{
      sent_at: number;
      sent_by_email: string;
      title: string;
      sent_count: number;
      failed_count: number;
      dead_removed_count: number;
    }>();

  return result.results.map((row) => ({
    sentAt: row.sent_at,
    sentByEmail: row.sent_by_email,
    title: row.title,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    deadRemovedCount: row.dead_removed_count,
  }));
}

export type PushSendRecord = {
  sentByEmail: string;
  title: string;
  body: string;
  url?: string;
  image?: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  deadRemovedCount: number;
};

// `sentAt` is a parameter, not `Date.now()` called inside this function —
// same reasoning as `computeTrackingStartDay`'s `now` parameter in
// admin-stats.ts: keeps this directly unit-testable with a fixed value
// instead of needing to mock the clock.
export async function recordPushSend(
  db: D1Database,
  record: PushSendRecord,
  sentAt: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_push_sends
       (sent_at, sent_by_email, title, body, url, image, recipient_count, sent_count, failed_count, dead_removed_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sentAt,
      record.sentByEmail,
      record.title,
      record.body,
      record.url ?? null,
      record.image ?? null,
      record.recipientCount,
      record.sentCount,
      record.failedCount,
      record.deadRemovedCount,
    )
    .run();
}

export type NotificationsPageData = {
  subscriberCount: number;
  recentSends: RecentPushSend[];
};

// The notifications page's loader data — mirrors dashboard.tsx's
// `loader: () => fetchAdminDashboardStats()` pattern (a createServerFn,
// not a raw db call in the route's own loader) so it inherits the same
// request-scoped `context.cloudflare.env` server.ts sets up. Read-only —
// the mutating send itself is the separate POST handler in
// routes/api/send-push.ts.
export const fetchNotificationsPageData = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<NotificationsPageData> => {
    const cf = (context as unknown as Record<string, unknown>).cloudflare as
      | { env: { DB: D1Database } }
      | undefined;
    const db = cf?.env?.DB;
    if (!db) return { subscriberCount: 0, recentSends: [] };

    const [subscriberStats, recentSends] = await Promise.all([
      fetchPushSubscriberStats(db),
      fetchRecentPushSends(db, 10),
    ]);
    return { subscriberCount: subscriberStats.total, recentSends };
  },
);
