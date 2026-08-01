import { Label, TerminalRow } from "@form-at/ui";
import type { AdminDashboardStats } from "~/data/admin-stats";
import { DashboardCard } from "./DashboardCard";
import { TrendChart } from "./TrendChart";

interface UsageTabProps {
  stats: AdminDashboardStats;
}

// app_launches + plays — "what do people already using it do," aggregate
// volume with no per-set dimension (that's the Sets tab).
export function UsageTab({ stats }: UsageTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    </div>
  );
}
