import {
  TREND_BUCKET_DAYS,
  TREND_WINDOW_DAYS,
  bucketByWeek,
  fillDailyWindow,
} from "@form-at/data/set-stats";
import { getSet } from "@form-at/data/sets";
import { createServerFn } from "@tanstack/react-start";
import { SAMPLE_ADMIN_DASHBOARD_STATS } from "./sample-stats";

// Read-only aggregate queries for the internal admin dashboard
// (`routes/dashboard.tsx`). Same `createServerFn` + D1 pattern as
// packages/data/src/set-stats.ts's `fetchSetStats` — one difference: each
// query is its OWN exported, directly-callable function (not inlined in the
// handler) so it's unit-testable with a fake D1Database.

export type InstallFunnel = {
  shown: number;
  accepted: number;
  dismissed: number;
  /** accepted ÷ shown. `null` (not 0) when nothing has been shown yet —
   *  "no data" and "0% conversion" are different facts, and the caller
   *  should render them differently. */
  conversionRate: number | null;
  /** Same 60-day/7-day-bucket shape as `AppLaunchStats.weeklyTrend` /
   *  `PushSubscriberStats.weeklyGrowth` — one array per event type, so the
   *  three funnel stages can be compared as sparklines over time instead of
   *  only as all-time totals. */
  shownTrend: number[];
  acceptedTrend: number[];
  dismissedTrend: number[];
};

export type AppLaunchStats = {
  total: number;
  /** Same shape as `SetStats.weeklyPlays` — TREND_BUCKET_DAYS-day buckets
   *  over the last TREND_WINDOW_DAYS, oldest first. */
  weeklyTrend: number[];
};

export type PlayStats = {
  total: number;
  /** Rows with `is_offline IS NULL` (pre-2026-07-08 rows, or a stale
   *  client mid-rollout) count toward `total` but not toward either of
   *  these two — same exclusion schema.sql's own "useful queries" comment
   *  documents for this exact ratio. */
  offlineCount: number;
  onlineCount: number;
  /** `total - offlineCount - onlineCount` — how many plays predate
   *  `is_offline` tracking (added 2026-07-08) and are silently excluded
   *  from the offline/online ratio above. Surfaced so the dashboard can
   *  disclose this instead of presenting the ratio as if it covered every
   *  play ever recorded — flagged by the 2026-07-27 investigation session
   *  as a stat that read more confident than the data supports. */
  excludedCount: number;
  topSets: { setId: string; setTitle: string; setArtist: string; playCount: number }[];
};

export type PushSubscriberStats = {
  total: number;
  standaloneCount: number;
  tabCount: number;
  weeklyGrowth: number[];
};

export type ClickStats = {
  saveClicks: number;
  shareClicks: number;
  /** Full list, not top-N. Today's catalogue is 4 sets, so "top 5" and "all"
   *  are the same list — and unlike play counts, click volume per set is low
   *  enough that a hardcoded LIMIT risks silently hiding a set with real
   *  save/share signal once the catalogue grows past 5. Revisit with a LIMIT
   *  if the catalogue grows large enough to make this list unwieldy. */
  perSet: {
    setId: string;
    setTitle: string;
    setArtist: string;
    saveClicks: number;
    shareClicks: number;
  }[];
};

// Below this many `promptShown` impressions, `NotifyFunnel.acceptedRate`
// suppresses to `null` instead of rendering a computed percentage.
// Motivating case (2026-08-02, real remote data): notify_accepted ÷
// notify_prompt_shown was 2 ÷ 2 — a bare ratio would show "100%", which reads
// as high-confidence off two people. The existing null-when-zero pattern
// (see InstallFunnel.conversionRate) doesn't catch this, since 2/2 isn't
// zero. 10 is a plain "at least a double-digit sample" floor, not tuned to
// make today's number disappear — don't remove this as fussiness without
// addressing the underlying small-n problem it guards against.
export const MIN_SAMPLE_FOR_RATE = 10;

export type NotifyFunnel = {
  /** Standalone subscribe soft-prompt becoming visible. */
  promptShown: number;
  /** Browser-tab install nudge becoming visible instead (tab visitors can't
   *  get a real push permission prompt — see PushOptInModal.tsx). */
  installNudgeShown: number;
  accepted: number;
  /** Closing either variant without accepting — PushOptInModal.tsx's
   *  handleClose fires this for BOTH surfaces with no distinguishing field,
   *  so this total can't be attributed to one surface from the data alone. */
  declined: number;
  /** accepted ÷ promptShown, or `null` below MIN_SAMPLE_FOR_RATE — see that
   *  constant's doc comment. */
  acceptedRate: number | null;
};

export type CalendarAddStats = {
  /** AddToCalendarButton clicks, merged across all three destinations
   *  (google/outlook/.ics) — see trackableEvents.ts's calendar_add_click
   *  comment for why destination isn't split out. */
  total: number;
};

export type InstallToPushConversion = {
  installAccepted: number;
  pushSubscribers: number;
  /** pushSubscribers ÷ installAccepted, or `null` when installAccepted is 0.
   *  ⚠️ APPROXIMATE, not a tracked per-user funnel. `install_accepted` lives
   *  in `events`, which is anonymous by design (no device identifier — see
   *  schema.sql's comment on that table), and `push_subscriptions` is a
   *  separate table with no shared key (see that table's own comment on why
   *  it's deliberately never joined against `events`). This is two
   *  independent aggregate counts divided, nothing more: a tab subscriber
   *  who never saw an install prompt, or one device re-subscribing after
   *  clearing site data, both move this number without corresponding to
   *  "one more converted install". Render this with the caveat visible —
   *  never as a precise conversion rate. */
  ratio: number | null;
};

// The 60-day/7-day trend sparklines (install funnel, app launches, push
// growth) render a fixed-width window regardless of how much real history
// exists — flagged by the 2026-07-27 investigation session: `events` has
// only been tracked since 2026-07-15 and `push_subscriptions` since
// 2026-07-19, both far short of 60 days, so most of each sparkline is
// structural zero-padding, not "nothing happened". `plays` genuinely spans
// ~84 days (since 2026-05-05) so its trend needs no such caveat — this
// logic is deliberately NOT applied there.
//
// Takes the table's true `MIN(created_at)` (see `fetchEventsTrackingStart`/
// `fetchPushSubscriptionsTrackingStart` below) rather than approximating
// from the already-window-limited trend rows: a window-derived guess can't
// distinguish "tracking genuinely started at the window boundary" from
// "tracking started earlier but the window truncated it away", and an
// extra `MIN(created_at)` query is trivially cheap (indexed on `events`,
// negligible on push_subscriptions' handful of rows) — not worth trading
// that ambiguity away to save one more query.
//
// Returns the earliest tracked day (`YYYY-MM-DD`) ONLY when it's more
// recent than the 60-day window's own start — i.e. only when the window is
// genuinely partial. Once real history reaches 60 days, this naturally
// returns `null` and the caption disappears on its own, converging with
// how `plays`'s trend already behaves — no separate "is this still needed"
// check required later.
export function computeTrackingStartDay(
  earliestCreatedAtMs: number | null,
  now: Date = new Date(),
): string | null {
  if (earliestCreatedAtMs === null) return null;
  const windowStartMs = now.getTime() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (earliestCreatedAtMs <= windowStartMs) return null;
  return new Date(earliestCreatedAtMs).toISOString().slice(0, 10);
}

export async function fetchEventsTrackingStart(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare("SELECT MIN(created_at) as earliest FROM events")
    .first<{ earliest: number | null }>();
  return row?.earliest ?? null;
}

export async function fetchPushSubscriptionsTrackingStart(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare("SELECT MIN(created_at) as earliest FROM push_subscriptions")
    .first<{ earliest: number | null }>();
  return row?.earliest ?? null;
}

export function computeInstallToPushConversion(
  installAccepted: number,
  pushSubscribersTotal: number,
): InstallToPushConversion {
  return {
    installAccepted,
    pushSubscribers: pushSubscribersTotal,
    ratio: installAccepted > 0 ? pushSubscribersTotal / installAccepted : null,
  };
}

// Exported so the per-tab dashboard components (GrowthTab/UsageTab/SetsTab)
// can type their `stats` prop — dashboard.tsx now splits across those files
// instead of reading fields dynamically off `Route.useLoaderData()` in one
// place.
export type AdminDashboardStats = {
  installFunnel: InstallFunnel;
  appLaunches: AppLaunchStats;
  plays: PlayStats;
  pushSubscribers: PushSubscriberStats;
  clicks: ClickStats;
  notifyFunnel: NotifyFunnel;
  calendarAdds: CalendarAddStats;
  installToPushConversion: InstallToPushConversion;
  /** Non-null only when real tracking history is shorter than the 60-day
   *  trend window — see `computeTrackingStartDay`'s doc comment. Shared by
   *  `installFunnel` and `appLaunches` since both trend off the same
   *  `events` table. */
  eventsTrackingStartDay: string | null;
  /** Same idea as `eventsTrackingStartDay`, for `pushSubscribers.weeklyGrowth`. */
  pushTrackingStartDay: string | null;
  /** True only for the hand-written fixture in sample-stats.ts, substituted
   *  when there's no real Cloudflare env at all (see fetchAdminDashboardStats
   *  below) — never true against a real D1 query result. Drives the
   *  "sample data" marker in dashboard.tsx so nobody mistakes it for real. */
  isSampleData: boolean;
};

export async function fetchInstallFunnel(db: D1Database): Promise<InstallFunnel> {
  const [totals, trend] = await Promise.all([
    db
      .prepare(
        `SELECT event_type, COUNT(*) as n FROM events
         WHERE event_type IN ('install_prompt_shown', 'install_accepted', 'install_dismissed')
         GROUP BY event_type`,
      )
      .all<{ event_type: string; n: number }>(),
    // One query for all three event types (grouped by day AND event_type)
    // rather than three separate day-bucketed queries — same total data,
    // one D1 round trip instead of three.
    db
      .prepare(
        `SELECT DATE(created_at/1000, 'unixepoch') AS day, event_type, COUNT(*) AS count
         FROM events
         WHERE event_type IN ('install_prompt_shown', 'install_accepted', 'install_dismissed')
           AND created_at >= (strftime('%s', 'now', '-${TREND_WINDOW_DAYS} days') * 1000)
         GROUP BY day, event_type
         ORDER BY day ASC`,
      )
      .all<{ day: string; event_type: string; count: number }>(),
  ]);

  const counts = Object.fromEntries(totals.results.map((r) => [r.event_type, r.n]));
  const shown = counts.install_prompt_shown ?? 0;
  const accepted = counts.install_accepted ?? 0;
  const dismissed = counts.install_dismissed ?? 0;

  const trendFor = (eventType: string) =>
    bucketByWeek(
      fillDailyWindow(
        trend.results.filter((r) => r.event_type === eventType),
        TREND_WINDOW_DAYS,
      ),
      TREND_BUCKET_DAYS,
    );

  return {
    shown,
    accepted,
    dismissed,
    conversionRate: shown > 0 ? accepted / shown : null,
    shownTrend: trendFor("install_prompt_shown"),
    acceptedTrend: trendFor("install_accepted"),
    dismissedTrend: trendFor("install_dismissed"),
  };
}

export async function fetchAppLaunchStats(db: D1Database): Promise<AppLaunchStats> {
  const [totalRow, trend] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) as total FROM events WHERE event_type = 'app_launch'")
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT DATE(created_at/1000, 'unixepoch') AS day, COUNT(*) AS count
         FROM events
         WHERE event_type = 'app_launch'
           AND created_at >= (strftime('%s', 'now', '-${TREND_WINDOW_DAYS} days') * 1000)
         GROUP BY day
         ORDER BY day ASC`,
      )
      .all<{ day: string; count: number }>(),
  ]);

  const dailyDense = fillDailyWindow(trend.results, TREND_WINDOW_DAYS);
  return {
    total: totalRow?.total ?? 0,
    weeklyTrend: bucketByWeek(dailyDense, TREND_BUCKET_DAYS),
  };
}

export async function fetchPlayStats(db: D1Database): Promise<PlayStats> {
  const [totals, topSets] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN is_offline = 1 THEN 1 ELSE 0 END), 0) as offline_count,
                COALESCE(SUM(CASE WHEN is_offline = 0 THEN 1 ELSE 0 END), 0) as online_count
         FROM plays`,
      )
      .first<{ total: number; offline_count: number; online_count: number }>(),
    db
      .prepare(
        `SELECT set_id, set_title, set_artist, COUNT(*) as play_count
         FROM plays
         GROUP BY set_id, set_title, set_artist
         ORDER BY play_count DESC
         LIMIT 5`,
      )
      .all<{ set_id: string; set_title: string; set_artist: string; play_count: number }>(),
  ]);

  const total = totals?.total ?? 0;
  const offlineCount = totals?.offline_count ?? 0;
  const onlineCount = totals?.online_count ?? 0;
  return {
    total,
    offlineCount,
    onlineCount,
    excludedCount: total - offlineCount - onlineCount,
    topSets: topSets.results.map((r) => ({
      setId: r.set_id,
      setTitle: r.set_title,
      setArtist: r.set_artist,
      playCount: r.play_count,
    })),
  };
}

// No trend arrays here — same call as ClickStats: ~16 total events across
// four types would make a 60-day sparkline near-empty noise, not a useful
// chart.
export async function fetchNotifyFunnel(db: D1Database): Promise<NotifyFunnel> {
  const totals = await db
    .prepare(
      `SELECT event_type, COUNT(*) as n FROM events
       WHERE event_type IN ('notify_prompt_shown', 'notify_accepted', 'notify_declined', 'notify_install_nudge_shown')
       GROUP BY event_type`,
    )
    .all<{ event_type: string; n: number }>();

  const counts = Object.fromEntries(totals.results.map((r) => [r.event_type, r.n]));
  const promptShown = counts.notify_prompt_shown ?? 0;
  const installNudgeShown = counts.notify_install_nudge_shown ?? 0;
  const accepted = counts.notify_accepted ?? 0;
  const declined = counts.notify_declined ?? 0;

  return {
    promptShown,
    installNudgeShown,
    accepted,
    declined,
    acceptedRate: promptShown >= MIN_SAMPLE_FOR_RATE ? accepted / promptShown : null,
  };
}

export async function fetchCalendarAddStats(db: D1Database): Promise<CalendarAddStats> {
  const row = await db
    .prepare("SELECT COUNT(*) as total FROM events WHERE event_type = 'calendar_add_click'")
    .first<{ total: number }>();
  return { total: row?.total ?? 0 };
}

// ⚠️ Only ever SELECTs `is_standalone` / `created_at` (plus COUNT) from
// `push_subscriptions` — never `endpoint` / `p256dh` / `auth`. Per
// schema.sql's own comment on this table: a subscription's `endpoint` is
// an addressable per-device token by necessity (that's how push delivery
// works), and the mitigation for that is scope — this table is read here
// for aggregate counts only, the same discipline every other consumer of
// this table (besides the send script itself) must hold to.
export async function fetchPushSubscriberStats(db: D1Database): Promise<PushSubscriberStats> {
  const [totals, trend] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN is_standalone = 1 THEN 1 ELSE 0 END), 0) as standalone_count,
                COALESCE(SUM(CASE WHEN is_standalone = 0 THEN 1 ELSE 0 END), 0) as tab_count
         FROM push_subscriptions`,
      )
      .first<{ total: number; standalone_count: number; tab_count: number }>(),
    db
      .prepare(
        `SELECT DATE(created_at/1000, 'unixepoch') AS day, COUNT(*) AS count
         FROM push_subscriptions
         WHERE created_at >= (strftime('%s', 'now', '-${TREND_WINDOW_DAYS} days') * 1000)
         GROUP BY day
         ORDER BY day ASC`,
      )
      .all<{ day: string; count: number }>(),
  ]);

  const dailyDense = fillDailyWindow(trend.results, TREND_WINDOW_DAYS);
  return {
    total: totals?.total ?? 0,
    standaloneCount: totals?.standalone_count ?? 0,
    tabCount: totals?.tab_count ?? 0,
    weeklyGrowth: bucketByWeek(dailyDense, TREND_BUCKET_DAYS),
  };
}

export async function fetchClickStats(db: D1Database): Promise<ClickStats> {
  const [totals, perSetRows] = await Promise.all([
    db
      .prepare(
        `SELECT event_type, COUNT(*) as n FROM events
         WHERE event_type IN ('save_click', 'share_click')
         GROUP BY event_type`,
      )
      .all<{ event_type: string; n: number }>(),
    db
      .prepare(
        `SELECT set_id, event_type, COUNT(*) as n FROM events
         WHERE event_type IN ('save_click', 'share_click') AND set_id IS NOT NULL
         GROUP BY set_id, event_type`,
      )
      .all<{ set_id: string; event_type: string; n: number }>(),
  ]);

  const totalCounts = Object.fromEntries(totals.results.map((r) => [r.event_type, r.n]));

  // events stores only set_id (no denormalized title/artist, unlike `plays`)
  // — map to a title/artist via the static catalogue, the same source
  // `getSet()` already provides for the public routes.
  const bySet = new Map<string, { saveClicks: number; shareClicks: number }>();
  for (const row of perSetRows.results) {
    const entry = bySet.get(row.set_id) ?? { saveClicks: 0, shareClicks: 0 };
    if (row.event_type === "save_click") entry.saveClicks = row.n;
    if (row.event_type === "share_click") entry.shareClicks = row.n;
    bySet.set(row.set_id, entry);
  }
  const perSet = [...bySet.entries()]
    .map(([setId, counts]) => {
      const set = getSet(setId);
      return {
        setId,
        setTitle: set?.title ?? setId,
        setArtist: set?.artist ?? "unknown",
        ...counts,
      };
    })
    .sort((a, b) => b.saveClicks + b.shareClicks - (a.saveClicks + a.shareClicks));

  return {
    saveClicks: totalCounts.save_click ?? 0,
    shareClicks: totalCounts.share_click ?? 0,
    perSet,
  };
}

// `hasCloudflareEnv` (set by server.ts from the raw `env` argument, before
// it gets coalesced to `{}`) tells apart "no D1 binding because we're not
// running under Cloudflare at all" (plain `vite dev`/e2e — safe to fake)
// from "no D1 binding despite a real Cloudflare env" (a real deployment
// mid-setup, or D1 genuinely down — must stay honest, never show sample
// data there). NODE_ENV was considered and rejected: it's baked into
// _worker.js at BUILD time via esbuild's --define, so it reads "production"
// for every built worker regardless of where that worker actually runs
// (local `wrangler pages dev` or the real deployment) — it can't make this
// distinction. Extracted as its own function, like every other query below,
// so it's directly unit-testable without going through createServerFn.
export function pickStatsForMissingDb(
  hasCloudflareEnv: boolean | undefined,
): AdminDashboardStats | null {
  return hasCloudflareEnv ? null : SAMPLE_ADMIN_DASHBOARD_STATS;
}

export const fetchAdminDashboardStats = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    try {
      const cf = (context as unknown as Record<string, unknown>).cloudflare as
        | { env: { DB: D1Database }; hasCloudflareEnv: boolean }
        | undefined;
      const db = cf?.env?.DB;
      if (!db) return pickStatsForMissingDb(cf?.hasCloudflareEnv);

      const [
        installFunnel,
        appLaunches,
        plays,
        pushSubscribers,
        clicks,
        notifyFunnel,
        calendarAdds,
        eventsEarliest,
        pushEarliest,
      ] = await Promise.all([
        fetchInstallFunnel(db),
        fetchAppLaunchStats(db),
        fetchPlayStats(db),
        fetchPushSubscriberStats(db),
        fetchClickStats(db),
        fetchNotifyFunnel(db),
        fetchCalendarAddStats(db),
        fetchEventsTrackingStart(db),
        fetchPushSubscriptionsTrackingStart(db),
      ]);

      // No new query — just dividing two aggregates already fetched above.
      // See InstallToPushConversion's doc comment for why this can't be a
      // real per-user join.
      const installToPushConversion = computeInstallToPushConversion(
        installFunnel.accepted,
        pushSubscribers.total,
      );

      return {
        installFunnel,
        appLaunches,
        plays,
        pushSubscribers,
        clicks,
        notifyFunnel,
        calendarAdds,
        installToPushConversion,
        eventsTrackingStartDay: computeTrackingStartDay(eventsEarliest),
        pushTrackingStartDay: computeTrackingStartDay(pushEarliest),
        isSampleData: false,
      } satisfies AdminDashboardStats;
    } catch {
      return null;
    }
  },
);
