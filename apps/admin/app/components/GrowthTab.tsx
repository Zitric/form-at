import { Label, Muted, TerminalRow } from "@form-at/ui";
import type { AdminDashboardStats } from "~/data/admin-stats";
import { DashboardCard } from "./DashboardCard";

interface GrowthTabProps {
  stats: AdminDashboardStats;
}

// install_funnel + push_subscribers — both are "is the app spreading," and
// install_to_push (below) explains the relationship between the two, so
// grouping them lets that caption sit next to both numbers it's about
// instead of living awkwardly inside install_funnel alone.
export function GrowthTab({ stats }: GrowthTabProps) {
  const installConversionLabel =
    stats.installFunnel.conversionRate == null
      ? "—"
      : `${Math.round(stats.installFunnel.conversionRate * 100)}%`;
  const installToPushLabel =
    stats.installToPushConversion.ratio == null
      ? "—"
      : `${Math.round(stats.installToPushConversion.ratio * 100)}%`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// install_funnel"}</Label>
        <div className="space-y-1">
          <TerminalRow label="shown" value={String(stats.installFunnel.shown)} dimValue />
          <TerminalRow label="accepted" value={String(stats.installFunnel.accepted)} dimValue />
          <TerminalRow label="dismissed" value={String(stats.installFunnel.dismissed)} dimValue />
          <TerminalRow label="conversion" value={installConversionLabel} dimValue />
          {/* TODO(charting-phase): stats.installFunnel.shownTrend is already
              fetched — this is a pure presentation swap, no data work needed. */}
          <TerminalRow label="shown_trend" value={<Muted>chart pending</Muted>} dimValue />
          {/* TODO(charting-phase): stats.installFunnel.acceptedTrend is already fetched. */}
          <TerminalRow label="accepted_trend" value={<Muted>chart pending</Muted>} dimValue />
          {/* TODO(charting-phase): stats.installFunnel.dismissedTrend is already fetched. */}
          <TerminalRow label="dismissed_trend" value={<Muted>chart pending</Muted>} dimValue />
          <TerminalRow label="install_to_push" value={installToPushLabel} dimValue />
        </div>
        <p className="mt-1 text-xs text-grey/70">
          install_to_push is an aggregate approximation, not a tracked per-user funnel — install
          events are anonymous and push_subscriptions shares no key with them.
        </p>
        {stats.eventsTrackingStartDay && (
          <p className="mt-1 text-xs text-grey/70">
            trends above cover tracking since {stats.eventsTrackingStartDay} — the 60-day window
            shown is mostly not-yet-tracked, not "nothing happened".
          </p>
        )}
      </DashboardCard>

      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// push_subscribers"}</Label>
        <div className="space-y-1">
          <TerminalRow label="total" value={String(stats.pushSubscribers.total)} dimValue />
          <TerminalRow
            label="standalone / tab"
            value={`${stats.pushSubscribers.standaloneCount} / ${stats.pushSubscribers.tabCount}`}
            dimValue
          />
          {/* TODO(charting-phase): stats.pushSubscribers.weeklyGrowth is already fetched. */}
          <TerminalRow label="growth_60d" value={<Muted>chart pending</Muted>} dimValue />
        </div>
        <p className="mt-1 text-xs text-grey/70">
          tab will always read 0 by current product policy — the browser-tab opt-in variant never
          subscribes (see PushOptInModal.tsx), it only offers an install nudge instead.
        </p>
        {stats.pushTrackingStartDay && (
          <p className="mt-1 text-xs text-grey/70">
            tracking since {stats.pushTrackingStartDay} — the 60-day window shown is mostly
            not-yet-tracked, not "nothing happened".
          </p>
        )}
      </DashboardCard>
    </div>
  );
}
