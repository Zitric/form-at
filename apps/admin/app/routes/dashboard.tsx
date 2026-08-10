import { type SetStats, fetchSetStats } from "@form-at/data/set-stats";
import { sets } from "@form-at/data/sets";
import { PageTitle } from "@form-at/ui";
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
import { createFileRoute, defer } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type DashboardTabId, DashboardTabs } from "~/components/DashboardTabs";
import { GrowthTab } from "~/components/GrowthTab";
import { SetsTab } from "~/components/SetsTab";
import { UsageTab } from "~/components/UsageTab";
import {
  fetchAdminDashboardStats,
  fetchEdgeTrafficStats,
  fetchRumVisitStats,
} from "~/data/admin-stats";
import { SAMPLE_SET_STATS } from "~/data/sample-stats";

export const Route = createFileRoute("/dashboard")({
  // `stats` is awaited directly, not deferred — it IS the entire page, so
  // deferring would just show a loading skeleton before the only content there
  // is, for zero benefit on a low-traffic internal page.
  //
  // `edgeTraffic` IS deferred: it's the page's only network call (Cloudflare's
  // GraphQL API, up to an 8s timeout), and an un-awaited promise lets the whole
  // dashboard render while just that one card resolves. Same pattern as
  // apps/web's /sets loader deferring `fetchOverallStats`. The `.catch`
  // degrades a rejection to the designed `null` — without it a failure here
  // would reject the loader and take out the page it's meant to stay out of.
  loader: async () => ({
    stats: await fetchAdminDashboardStats(),
    edgeTraffic: defer(fetchEdgeTrafficStats().catch(() => null)),
    // Independent of edgeTraffic: different scope, different token permission,
    // so one failing must not blank the other.
    rumVisits: defer(fetchRumVisitStats().catch(() => null)),
  }),
  head: () => ({ meta: [{ title: "Analytics · Form:at Admin" }] }),
  component: AdminDashboard,
});

// Reuses the app's established terminal/gold design system (PageTitle) and
// owns tab-selection + the per-set-picker state; each tab's own content
// lives in GrowthTab/UsageTab/SetsTab (~/components/) — this file exceeded
// CLAUDE.md's ~150-line extraction threshold once, splitting it out.
function AdminDashboard() {
  const { stats, edgeTraffic, rumVisits } = Route.useLoaderData();
  // `usage` is the landing tab — the headline totals answer "how is it doing?"
  // in one glance, which is what the dashboard is opened for. Growth's funnels
  // and Sets' per-set detail are follow-up questions.
  const [activeTab, setActiveTab] = useState<DashboardTabId>("usage");

  // Reuses fetchSetStats from @form-at/data (the same createServerFn
  // /sets/$setId calls in apps/web) rather than duplicating its query shape.
  // Called from a client effect, not a route loader, so changing the set picker
  // re-fetches only THAT set's stats instead of all five dashboard-wide
  // aggregates the loader already ran.
  //
  // This state must stay HERE, not inside SetsTab: SetsTab only renders while
  // activeTab === "sets", so owning it there would unmount it on a tab switch,
  // losing the selection and re-firing fetchSetStats on return.
  const topSetId = stats?.plays.topSets[0]?.setId;
  const [selectedSetId, setSelectedSetId] = useState<string | undefined>(topSetId ?? sets[0]?.id);
  const [selectedSetStats, setSelectedSetStats] = useState<SetStats | null>(null);
  const [selectedSetLoading, setSelectedSetLoading] = useState(false);

  useEffect(() => {
    if (!selectedSetId || !stats) return;

    // Sample-data mode substitutes the fixture keyed by set ID instead of
    // calling the real fetchSetStats — that function is shared with
    // apps/web's public /sets/$setId page, so it can't gate on
    // hasCloudflareEnv itself without affecting that page too. Deciding
    // fixture-vs-real HERE, off the already-loaded stats.isSampleData flag,
    // keeps the fixture entirely inside apps/admin.
    if (stats.isSampleData) {
      setSelectedSetStats(SAMPLE_SET_STATS[selectedSetId] ?? null);
      return;
    }

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-baseline gap-3">
        <PageTitle>analytics</PageTitle>
        {stats?.isSampleData && (
          <span className="text-xs font-mono px-2 py-0.5 border border-gold text-gold">
            sample data
          </span>
        )}
      </div>

      {!stats ? (
        <p className="t-body sm:t-body-md text-grey">
          No data available — the analytics database isn't reachable from this environment.
        </p>
      ) : (
        <>
          <DashboardTabs active={activeTab} onChange={setActiveTab} />
          {activeTab === "growth" && <GrowthTab stats={stats} />}
          {activeTab === "usage" && (
            <UsageTab stats={stats} edgeTraffic={edgeTraffic} rumVisits={rumVisits} />
          )}
          {activeTab === "sets" && (
            <SetsTab
              stats={stats}
              selectedSetId={selectedSetId}
              selectedSetStats={selectedSetStats}
              selectedSetLoading={selectedSetLoading}
              onSelectSet={setSelectedSetId}
            />
          )}
        </>
      )}
    </div>
  );
}
