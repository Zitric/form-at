import { Button, Label, Muted, PageTitle, TerminalRow } from "@form-at/ui";
// Internal read-only analytics dashboard. NO IN-APP AUTHENTICATION HERE —
// this is deliberate, not an oversight. Access is restricted at the edge by
// Cloudflare Access (Julian configures this himself, outside this repo's
// scope: a policy on the /admin/* path allowing exactly the team's 3
// emails). A future session finding no login check on this route should
// read this comment before "fixing" it — adding in-app auth here would be
// solving an already-solved problem with a weaker mechanism (client-side
// checks are trivially bypassed; Cloudflare Access blocks the request
// before it ever reaches this app).
//
// Pure display: aggregate COUNT/GROUP BY reads only (see
// `~/data/admin-stats.ts`), no mutations, no forms, nothing that writes.
// Excluded from the sitemap by construction — `scripts/generate-sitemap.ts`
// only emits routes from its own explicit `staticRoutes` allowlist plus the
// data-driven set/dj/event routes; `/admin/dashboard` was never added to
// either, so there was nothing to exclude. `noindex` below is the second,
// independent layer (stops indexing even if something crawls it directly).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageLayout } from "~/components/PageLayout";
import { fetchAdminDashboardStats } from "~/data/admin-stats";
import { type SetStats, fetchSetStats } from "~/data/set-stats";
import { sets } from "~/data/sets";
import { asciiBar, fmtDuration } from "~/utils/fmt";
import { pageHead } from "~/utils/head";

export const Route = createFileRoute("/admin/dashboard")({
  // Awaited directly, not deferred (unlike `/sets`'s `OverallMetrics`) —
  // there this data is a secondary enhancement below the primary content
  // (the set cards), so deferring lets the cards paint first. Here the
  // stats ARE the entire page; deferring would just show a loading
  // skeleton before the only content there is, for zero benefit on a
  // low-traffic internal page where a moment's wait is a non-issue.
  loader: () => fetchAdminDashboardStats(),
  head: () =>
    pageHead({
      title: "Analytics · Form:at",
      description: "Internal analytics dashboard — Form:at team only.",
      path: "/admin/dashboard",
      noindex: true,
    }),
  component: AdminDashboard,
});

// Reuses the app's established terminal/gold design system (PageTitle,
// Label, TerminalRow, asciiBar) rather than a separate plain admin style —
// justified, not a default: (1) `/sets`'s `OverallMetrics` already renders
// exactly this kind of label/value metrics block with `TerminalRow`, so
// this page is more of the same established pattern, not a new one; (2)
// the monospace font aligns tabular numbers for free; (3) a second visual
// language for one internal page would be inconsistency for its own sake —
// nobody viewing this (behind Cloudflare Access) needs a visual cue that
// it's "different" from the rest of the site.
function AdminDashboard() {
  const stats = Route.useLoaderData();

  // Reuses `fetchSetStats` — the exact createServerFn `/sets/$setId` already
  // calls in its own loader — rather than duplicating its query/weekly-trend
  // shape. `set-stats.ts` is a shared data module, not the public route
  // itself, so importing it here is no different from `admin-stats.ts`
  // already importing its trend-bucketing helpers from the same file.
  //
  // Called directly from a client effect (not a route loader) — the first
  // client-invoked `createServerFn` call in this codebase — specifically so
  // switching the set picker only re-fetches THAT set's stats, not all five
  // dashboard-wide aggregate queries the main loader already ran once.
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
    <PageLayout>
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
              <TerminalRow
                label="shown_trend"
                value={asciiBar(stats.installFunnel.shownTrend)}
                dimValue
              />
              <TerminalRow
                label="accepted_trend"
                value={asciiBar(stats.installFunnel.acceptedTrend)}
                dimValue
              />
              <TerminalRow
                label="dismissed_trend"
                value={asciiBar(stats.installFunnel.dismissedTrend)}
                dimValue
              />
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
              <TerminalRow
                label="last_60d"
                value={asciiBar(stats.appLaunches.weeklyTrend)}
                dimValue
              />
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
                <TerminalRow
                  label="trend_60d"
                  value={asciiBar(selectedSetStats.weeklyPlays)}
                  dimValue
                />
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
              <TerminalRow
                label="growth_60d"
                value={asciiBar(stats.pushSubscribers.weeklyGrowth)}
                dimValue
              />
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
    </PageLayout>
  );
}
