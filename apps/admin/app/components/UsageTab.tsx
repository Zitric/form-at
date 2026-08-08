import { Label, Muted, TerminalRow } from "@form-at/ui";
import type { AdminDashboardStats } from "~/data/admin-stats";
import { DashboardCard } from "./DashboardCard";
import { TrendChart } from "./TrendChart";

interface UsageTabProps {
  stats: AdminDashboardStats;
}

// The landing tab (see dashboard.tsx): a full-width `totals` summary first,
// then aggregate volume with no per-set dimension (that's the Sets tab) —
// edge_traffic, app_launches, plays, calendar_adds.
//
// `totals` repeats numbers that also appear in growth's funnels. That's
// deliberate and safe: both read the same `admin-stats` computation, so they
// cannot drift — unlike duplicated prose.
//
// calendar_add_click carries no set_id/event_id (see trackableEvents.ts), so
// it's a bare total like app_launches rather than a per-entity breakdown
// that would need its own tab.
export function UsageTab({ stats }: UsageTabProps) {
  const edge = stats.edgeTraffic;

  return (
    // Two columns above mobile, matching SetsTab. Three columns made each card
    // too narrow for its TerminalRow label/value pairs.
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      {/* Full-width deliberately — this is the "how's it doing" summary the
          dashboard opens on, and a two-column split would break its rows into
          two scan paths. It stays a single column of label/value rows at every
          width, so 375px costs nothing. */}
      <DashboardCard className="md:col-span-2">
        <Label className="mb-2 text-grey tracking-widest">{"// totals"}</Label>
        <div className="space-y-1">
          <TerminalRow label="edge_requests" value={edge ? String(edge.requests) : "—"} dimValue />
          <TerminalRow label="app_launches" value={String(stats.appLaunches.total)} dimValue />
          <TerminalRow label="plays" value={String(stats.plays.total)} dimValue />
          <TerminalRow
            label="installs_accepted"
            value={String(stats.installFunnel.accepted)}
            dimValue
          />
          <TerminalRow
            label="push_subscribers"
            value={String(stats.pushSubscribers.total)}
            dimValue
          />
          <TerminalRow label="calendar_adds" value={String(stats.calendarAdds.total)} dimValue />
          <TerminalRow label="save_clicks" value={String(stats.clicks.saveClicks)} dimValue />
          <TerminalRow label="share_clicks" value={String(stats.clicks.shareClicks)} dimValue />
        </div>
        <p className="mt-3 text-xs text-grey/70">
          installs_accepted and push_subscribers also appear inside growth's funnels — same numbers,
          same computation, shown here as bare totals and there in context.
        </p>
      </DashboardCard>
      {/* Label is `edge_traffic`, never "visitors" — see cf-analytics.ts. The
          caption is not optional: without it, anyone comparing this to
          Cloudflare Web Analytics sees two wildly different numbers for what
          looks like the same thing and reasonably concludes one is broken. */}
      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// edge_traffic"}</Label>
        {edge ? (
          <>
            <div className="space-y-1">
              <TerminalRow label="requests" value={String(edge.requests)} dimValue />
              <TerminalRow label="page_views" value={String(edge.pageViews)} dimValue />
              <TerminalRow label="window" value={`${edge.windowDays}d`} dimValue />
            </div>
            <div className="mt-3">
              <Label className="mb-1 block text-xs text-grey">since {edge.startDay}</Label>
              <TrendChart data={edge.dailyRequests} />
            </div>
            <p className="mt-3 text-xs text-grey/70">
              HTTP requests counted at Cloudflare's edge, including bots, crawlers and asset
              requests — not people, not sessions. Cloudflare Web Analytics counts real browsers
              running a beacon and excludes bots, so its numbers are much lower. Both are correct;
              they measure different things.
            </p>
            <p className="mt-1 text-xs text-grey/70">
              window is however far back Cloudflare retains this zone's data, read per-request — not
              a window we choose.
            </p>
          </>
        ) : (
          <Muted className="block text-xs">
            no data — the Cloudflare Analytics credentials are missing, expired, or the API didn't
            answer. Deliberately blank rather than 0, which would read as "no traffic".
          </Muted>
        )}
      </DashboardCard>

      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// app_launches"}</Label>
        <div className="space-y-1">
          <TerminalRow label="total" value={String(stats.appLaunches.total)} dimValue />
        </div>
        <div className="mt-3">
          <Label className="mb-1 block text-xs text-grey">last_60d</Label>
          <TrendChart data={stats.appLaunches.weeklyTrend} />
        </div>
        {stats.eventsTrackingStartDay && (
          <p className="mt-3 text-xs text-grey/70">
            tracking since {stats.eventsTrackingStartDay} — the 60-day window shown is mostly
            not-yet-tracked, not "nothing happened".
          </p>
        )}
      </DashboardCard>

      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// plays"}</Label>
        <div className="space-y-1 mb-4">
          <TerminalRow label="total" value={String(stats.plays.total)} dimValue />
          <TerminalRow
            label="offline / online"
            value={`${stats.plays.offlineCount} / ${stats.plays.onlineCount}`}
            dimValue
          />
        </div>
        {stats.plays.excludedCount > 0 && (
          <p className="mt-1 mb-4 text-xs text-grey/70">
            {stats.plays.excludedCount} of {stats.plays.total} plays predate offline tracking (added
            2026-07-08) and are excluded from this ratio.
          </p>
        )}
        {stats.plays.topSets.length > 0 && (
          <div className="space-y-1">
            {stats.plays.topSets.map((set) => (
              <TerminalRow
                key={set.setId}
                label={`${set.setArtist} @ ${set.setTitle}`}
                value={String(set.playCount)}
              />
            ))}
          </div>
        )}
      </DashboardCard>

      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// calendar_adds"}</Label>
        <div className="space-y-1">
          <TerminalRow label="total" value={String(stats.calendarAdds.total)} dimValue />
        </div>
        <p className="mt-1 text-xs text-grey/70">
          counts AddToCalendarButton clicks merged across all three destinations (google, outlook,
          .ics) — not split by which one was chosen.
        </p>
        {stats.calendarAdds.total === 0 && (
          <Muted className="mt-1 block text-xs">
            nothing recorded yet — this event type was only just added
          </Muted>
        )}
      </DashboardCard>
    </div>
  );
}
