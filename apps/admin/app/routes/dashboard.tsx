import { type SetStats, fetchSetStats } from "@form-at/data/set-stats";
import { sets } from "@form-at/data/sets";
import { Button, Label, Muted, PageTitle, TerminalRow } from "@form-at/ui";
// Internal read-only analytics dashboard. NO IN-APP AUTHENTICATION HERE —
// this is deliberate, not an oversight. Access is restricted at the edge by
// Cloudflare Access on the admin.formatglasgow.com subdomain itself (Julian
// configures this outside this repo's scope). A future session finding no
// login check on this route should read this comment before "fixing" it —
// adding in-app auth here would be solving an already-solved problem with a
// weaker mechanism (client-side checks are trivially bypassed; Cloudflare
// Access blocks the request before it ever reaches this app). Any future
// mutating admin endpoint MUST verify Access identity server-side rather
// than relying on the page load being gated — Access protects the page,
// not automatically every server-function call.
//
// Pure display: aggregate COUNT/GROUP BY reads only (see
// ~/data/admin-stats.ts), no mutations, no forms, nothing that writes.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchAdminDashboardStats } from "~/data/admin-stats";
import { fmtDuration } from "~/utils/fmt";

export const Route = createFileRoute("/dashboard")({
  // Awaited directly, not deferred — the stats ARE the entire page, so
  // deferring would just show a loading skeleton before the only content
  // there is, for zero benefit on a low-traffic internal page.
  loader: () => fetchAdminDashboardStats(),
  head: () => ({ meta: [{ title: "Analytics · Form:at Admin" }] }),
  component: AdminDashboard,
});

// Reuses the app's established terminal/gold design system (PageTitle,
// Label, TerminalRow) rather than a separate plain admin style — the
// monospace font aligns tabular numbers for free, and a second visual
// language for one internal page would be inconsistency for its own sake.
function AdminDashboard() {
  const stats = Route.useLoaderData();

  // Reuses fetchSetStats from @form-at/data — the exact createServerFn
  // /sets/$setId already calls in apps/web — rather than duplicating its
  // query/weekly-trend shape. Called directly from a client effect (not a
  // route loader) so switching the set picker only re-fetches THAT set's
  // stats, not all five dashboard-wide aggregate queries the main loader
  // already ran once.
  const topSetId = stats?.plays.topSets[0]?.setId;
  const [selectedSetId, setSelectedSetId] = useState<string | undefined>(topSetId ?? sets[0]?.id);
  const [selectedSetStats, setSelectedSetStats] = useState<SetStats | null>(null);
  const [selectedSetLoading, setSelectedSetLoading] = useState(false);

  useEffect(() => {
    if (!selectedSetId || !stats) return;
    let cancelled = false;
    setSelectedSetLoading(true);
    fetchSetStats({ data: selectedSetId })
      .then((result) => {
        if (!cancelled) setSelectedSetStats(result);
      })
      .catch(() => {
        if (!cancelled) setSelectedSetStats(null);
      })
      .finally(() => {
        if (!cancelled) setSelectedSetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSetId, stats]);

  const installConversionLabel =
    stats?.installFunnel.conversionRate == null
      ? "—"
      : `${Math.round(stats.installFunnel.conversionRate * 100)}%`;
  const installToPushLabel =
    stats?.installToPushConversion.ratio == null
      ? "—"
      : `${Math.round(stats.installToPushConversion.ratio * 100)}%`;

  return (
    <div className="p-6">
      <PageTitle>analytics</PageTitle>

      {!stats ? (
        <p className="t-body sm:t-body-md text-grey">
          No data available — the analytics database isn't reachable from this environment.
        </p>
      ) : (
        <div className="space-y-10">
          <section>
            <Label className="mb-2 text-grey tracking-widest">{"// install_funnel"}</Label>
            <div className="space-y-1">
              <TerminalRow label="shown" value={String(stats.installFunnel.shown)} dimValue />
              <TerminalRow label="accepted" value={String(stats.installFunnel.accepted)} dimValue />
              <TerminalRow
                label="dismissed"
                value={String(stats.installFunnel.dismissed)}
                dimValue
              />
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
          </section>

          <section>
            <Label className="mb-2 text-grey tracking-widest">{"// app_launches"}</Label>
            <div className="space-y-1">
              <TerminalRow label="total" value={String(stats.appLaunches.total)} dimValue />
              {/* TODO(charting-phase): stats.appLaunches.weeklyTrend is already fetched. */}
              <TerminalRow label="last_60d" value={<Muted>chart pending</Muted>} dimValue />
            </div>
            {stats.eventsTrackingStartDay && (
              <p className="mt-1 text-xs text-grey/70">
                tracking since {stats.eventsTrackingStartDay} — the 60-day window shown is mostly
                not-yet-tracked, not "nothing happened".
              </p>
            )}
          </section>

          <section>
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
                {stats.plays.excludedCount} of {stats.plays.total} plays predate offline tracking
                (added 2026-07-08) and are excluded from this ratio.
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
          </section>

          <section>
            <Label className="mb-2 text-grey tracking-widest">{"// per_set_plays"}</Label>
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
              {sets.map((set) => (
                <Button
                  key={set.id}
                  variant="secondary"
                  onClick={() => setSelectedSetId(set.id)}
                  className={set.id === selectedSetId ? "text-white" : undefined}
                >
                  {set.artist}
                </Button>
              ))}
            </div>
            {selectedSetLoading ? (
              <Muted>loading…</Muted>
            ) : selectedSetStats ? (
              <div className="space-y-1">
                <TerminalRow label="plays" value={String(selectedSetStats.playCount)} dimValue />
                <TerminalRow
                  label="avg_engaged_listening"
                  value={fmtDuration(selectedSetStats.avgSeconds)}
                  dimValue
                />
                {/* TODO(charting-phase): selectedSetStats.weeklyPlays is already fetched. */}
                <TerminalRow label="trend_60d" value={<Muted>chart pending</Muted>} dimValue />
              </div>
            ) : (
              <Muted>no plays yet for this set</Muted>
            )}
            {selectedSetStats && (
              <p className="mt-1 text-xs text-grey/70">
                avg_engaged_listening is cumulative playback time, not furthest position reached —
                it can exceed the track's own length for a listener who scrubs back and replays
                sections.
              </p>
            )}
          </section>

          <section>
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
              tab will always read 0 by current product policy — the browser-tab opt-in variant
              never subscribes (see PushOptInModal.tsx), it only offers an install nudge instead.
            </p>
            {stats.pushTrackingStartDay && (
              <p className="mt-1 text-xs text-grey/70">
                tracking since {stats.pushTrackingStartDay} — the 60-day window shown is mostly
                not-yet-tracked, not "nothing happened".
              </p>
            )}
          </section>

          <section>
            <Label className="mb-2 text-grey tracking-widest">{"// clicks"}</Label>
            <div className="mb-4 space-y-1">
              <TerminalRow label="save_click" value={String(stats.clicks.saveClicks)} dimValue />
              <TerminalRow label="share_click" value={String(stats.clicks.shareClicks)} dimValue />
            </div>
            {stats.clicks.perSet.length > 0 && (
              <div className="space-y-1">
                {stats.clicks.perSet.map((set) => (
                  <TerminalRow
                    key={set.setId}
                    label={`${set.setArtist} @ ${set.setTitle}`}
                    value={`${set.saveClicks} save / ${set.shareClicks} share`}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
