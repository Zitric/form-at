import { Label, Muted, TerminalRow } from "@form-at/ui";
import type { AdminDashboardStats } from "~/data/admin-stats";
import { DashboardCard } from "./DashboardCard";
import { TrendChart } from "./TrendChart";

interface UsageTabProps {
  stats: AdminDashboardStats;
}

// app_launches + plays + calendar_adds — "what do people already using it
// do," aggregate volume with no per-set dimension (that's the Sets tab).
// calendar_add_click carries no set_id/event_id (see trackableEvents.ts), so
// it's a bare total like app_launches rather than a per-entity breakdown
// that would need its own tab.
export function UsageTab({ stats }: UsageTabProps) {
  return (
    // Same lg:grid-cols-3 treatment as GrowthTab, for the same reason — see
    // its comment.
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
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
