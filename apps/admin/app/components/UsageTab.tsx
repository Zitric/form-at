import { Label, Muted, TerminalRow } from "@form-at/ui";
import { Await } from "@tanstack/react-router";
import { Suspense } from "react";
import type { AdminDashboardStats } from "~/data/admin-stats";
import { EDGE_TRAFFIC_MAX_WINDOW_DAYS } from "~/data/cf-analytics";
import type { EdgeTraffic, RumVisits } from "~/data/cf-analytics";
import { DashboardCard } from "./DashboardCard";
import { TrendChart } from "./TrendChart";

interface UsageTabProps {
  stats: AdminDashboardStats;
  /** Deferred — see dashboard.tsx's loader. Read through <Await> so a slow
   *  Cloudflare API delays only the two places that show it. */
  edgeTraffic: Promise<EdgeTraffic | null>;
  /** Deferred, and fetched independently of edgeTraffic — see dashboard.tsx. */
  rumVisits: Promise<RumVisits | null>;
}

// Sits beside edge_traffic so the two numbers can be compared directly: this
// one counts real browsers, that one counts every request at the edge. The gap
// between them IS the disclosure — the captions explain it, the pairing shows
// it.
function VisitsCard({ rum }: { rum: RumVisits | null }) {
  if (!rum) {
    return (
      <Muted className="block text-xs">
        no data — the Cloudflare Analytics credentials are missing, the token lacks Account
        Analytics:Read (a different permission from the zone one edge_traffic uses), or the API
        didn't answer. Deliberately blank rather than 0.
      </Muted>
    );
  }
  const pct = (n: number) => Math.round(n * 100);
  return (
    <>
      <div className="space-y-1">
        <TerminalRow label="visits" value={String(rum.visits)} dimValue />
        {rum.intervalValid && (
          <TerminalRow
            label={`${pct(rum.confidenceLevel)}% interval`}
            value={`${rum.visitsLower} – ${rum.visitsUpper}`}
            dimValue
          />
        )}
        <TerminalRow label="page_loads" value={String(rum.pageloads)} dimValue />
        <TerminalRow label="bots_excluded" value={`${pct(rum.botShare)}%`} dimValue />
        <TerminalRow label="window" value={`${rum.windowDays}d`} dimValue />
      </div>
      {rum.intervalValid ? (
        <div className="mt-3">
          <Label className="mb-1 block text-xs text-grey">since {rum.startDay}</Label>
          <TrendChart data={rum.weeklyVisits} />
        </div>
      ) : (
        // Cloudflare's own isValid, not a threshold invented here: with too few
        // samples the interval is meaningless, so neither bounds nor a curve
        // are shown — both would read as precision that doesn't exist.
        <p className="mt-3 text-xs text-grey/70">
          too few samples ({rum.sampleSize}) to characterise — Cloudflare reports the confidence
          interval as invalid at this volume, so no range and no chart are shown. The visit count
          above is still its best estimate.
        </p>
      )}
      <p className="mt-3 text-xs text-grey/70">
        a visit is a page load arriving from a different site or a direct link — Cloudflare compares
        the referer against the hostname. Moving between pages here, or reloading, doesn't add one.
        Not sessions, and not people: Web Analytics stores no cookie or identifier, so it can't
        count distinct humans at all.
      </p>
      <p className="mt-1 text-xs text-grey/70">
        real browsers running the beacon, with Cloudflare's bot-flagged rows removed — which is why
        this is far below edge_traffic. Adaptively sampled, so it's an estimate
        {rum.intervalValid ? " with the interval shown above" : ""}.
      </p>
      {rum.windowDays < EDGE_TRAFFIC_MAX_WINDOW_DAYS && (
        // The beacon started collecting on 2026-08-10; before that it wasn't in
        // the page at all, so a low number here means "only just started",
        // not "nobody visits". Derived from the oldest day Cloudflare actually
        // returned rather than a hardcoded date, so it self-corrects and this
        // caption disappears once history fills the window — same pattern as
        // app_launches' `tracking since`.
        <p className="mt-1 text-xs text-grey/70">
          only {rum.windowDays}d of data exists (since {rum.startDay}) — the beacon hasn't been
          collecting for the full window, so a low count reflects that rather than low traffic.
        </p>
      )}
      {!rum.boundaryKnown && (
        <p className="mt-1 text-xs text-grey/70">
          retention boundary couldn't be read this time, so the full window was requested.
        </p>
      )}
    </>
  );
}

// The edge_traffic caption is not optional: without it, anyone comparing this
// to Cloudflare Web Analytics sees two wildly different numbers for what looks
// like the same thing and reasonably concludes one is broken. Full reasoning in
// cf-analytics.ts's header.
function EdgeTrafficCard({ edge }: { edge: EdgeTraffic | null }) {
  if (!edge) {
    return (
      <Muted className="block text-xs">
        no data — the Cloudflare Analytics credentials are missing, expired, or the API didn't
        answer. Deliberately blank rather than 0, which would read as "no traffic".
      </Muted>
    );
  }
  return (
    <>
      <div className="space-y-1">
        <TerminalRow label="requests" value={String(edge.requests)} dimValue />
        <TerminalRow label="page_views" value={String(edge.pageViews)} dimValue />
        <TerminalRow label="window" value={`${edge.windowDays}d`} dimValue />
      </div>
      <div className="mt-3">
        <Label className="mb-1 block text-xs text-grey">since {edge.startDay}</Label>
        {/* WEEKLY buckets, like every other trend — TrendChart derives its axis
            from length × bucketDays, so a daily series here would draw a
            413-day span labelled "60 weeks". */}
        <TrendChart data={edge.weeklyRequests} />
      </div>
      <p className="mt-3 text-xs text-grey/70">
        HTTP requests counted at Cloudflare's edge, including bots, crawlers and asset requests —
        not people, not sessions. Cloudflare Web Analytics counts real browsers running a beacon and
        excludes bots, so its numbers are much lower. Both are correct; they measure different
        things.
      </p>
      <p className="mt-1 text-xs text-grey/70">
        window is however far back Cloudflare retains this zone's data, read per-request — not a
        window we choose.
      </p>
      {!edge.boundaryKnown && (
        <p className="mt-1 text-xs text-grey/70">
          retention boundary couldn't be read this time, so the full window was requested — the days
          shown are still real returned days, but the cap wasn't confirmed.
        </p>
      )}
    </>
  );
}

// The landing tab (see dashboard.tsx): a full-width `totals` summary first,
// then aggregate volume with no per-set dimension (that's the Sets tab) —
// edge_traffic and visits side by side, then app_launches, plays,
// calendar_adds.
//
// `totals` repeats numbers that also appear in growth's funnels. That's
// deliberate and safe: both read the same `admin-stats` computation, so they
// cannot drift — unlike duplicated prose.
//
// calendar_add_click carries no set_id/event_id (see trackableEvents.ts), so
// it's a bare total like app_launches rather than a per-entity breakdown
// that would need its own tab.
export function UsageTab({ stats, edgeTraffic, rumVisits }: UsageTabProps) {
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
          {/* Same deferred promise as the edge_traffic card below, read in a
              second <Await>. The fallback is the same em-dash this row shows
              for a null result, so resolving causes no layout shift. */}
          <Suspense fallback={<TerminalRow label="edge_requests" value="—" dimValue />}>
            <Await promise={edgeTraffic}>
              {(edge) => (
                <TerminalRow
                  label="edge_requests"
                  value={edge ? String(edge.requests) : "—"}
                  dimValue
                />
              )}
            </Await>
          </Suspense>
          <Suspense fallback={<TerminalRow label="visits" value="—" dimValue />}>
            <Await promise={rumVisits}>
              {(rum) => (
                <TerminalRow label="visits" value={rum ? String(rum.visits) : "—"} dimValue />
              )}
            </Await>
          </Suspense>
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
      {/* Label is `edge_traffic`, never "visitors" — see cf-analytics.ts. */}
      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// edge_traffic"}</Label>
        <Suspense fallback={<Muted className="block text-xs">reading…</Muted>}>
          <Await promise={edgeTraffic}>{(edge) => <EdgeTrafficCard edge={edge} />}</Await>
        </Suspense>
      </DashboardCard>

      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// visits"}</Label>
        <Suspense fallback={<Muted className="block text-xs">reading…</Muted>}>
          <Await promise={rumVisits}>{(rum) => <VisitsCard rum={rum} />}</Await>
        </Suspense>
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
        <div className="mb-4">
          <Label className="mb-1 block text-xs text-grey">last_60d</Label>
          {/* Total plays only — see PlayStats.weeklyTrend for why this isn't
              split by offline/online. No "tracking since" caption: plays
              predate the 60-day window, unlike the events table. */}
          <TrendChart data={stats.plays.weeklyTrend} />
        </div>
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
