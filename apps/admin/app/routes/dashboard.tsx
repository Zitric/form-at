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
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type DashboardTabId, DashboardTabs } from "~/components/DashboardTabs";
import { GrowthTab } from "~/components/GrowthTab";
import { SetsTab } from "~/components/SetsTab";
import { UsageTab } from "~/components/UsageTab";
import { fetchAdminDashboardStats } from "~/data/admin-stats";

export const Route = createFileRoute("/dashboard")({
  // Awaited directly, not deferred — the stats ARE the entire page, so
  // deferring would just show a loading skeleton before the only content
  // there is, for zero benefit on a low-traffic internal page.
  loader: () => fetchAdminDashboardStats(),
  head: () => ({ meta: [{ title: "Analytics · Form:at Admin" }] }),
  component: AdminDashboard,
});

// Reuses the app's established terminal/gold design system (PageTitle) and
// owns tab-selection + the per-set-picker state; each tab's own content
// lives in GrowthTab/UsageTab/SetsTab (~/components/) — this file exceeded
// CLAUDE.md's ~150-line extraction threshold once, splitting it out.
function AdminDashboard() {
  const stats = Route.useLoaderData();
  const [activeTab, setActiveTab] = useState<DashboardTabId>("growth");

  // Reuses fetchSetStats from @form-at/data — the exact createServerFn
  // /sets/$setId already calls in apps/web — rather than duplicating its
  // query/weekly-trend shape. Called directly from a client effect (not a
  // route loader) so switching the set picker only re-fetches THAT set's
  // stats, not all five dashboard-wide aggregate queries the main loader
  // already ran once.
  //
  // Deliberately owned HERE, not inside SetsTab: SetsTab only renders while
  // activeTab === "sets", so if this state lived there instead, switching to
  // growth/usage and back would unmount it, losing the selection and
  // re-firing fetchSetStats for no reason. Lifting it above the tab switch
  // means the selection and its fetched stats survive a round trip through
  // the other tabs — verified by clicking through manually, not just
  // reasoned about (see PWA_PROGRESS.md's Phase C entry).
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageTitle>analytics</PageTitle>

      {!stats ? (
        <p className="t-body sm:t-body-md text-grey">
          No data available — the analytics database isn't reachable from this environment.
        </p>
      ) : (
        <>
          <DashboardTabs active={activeTab} onChange={setActiveTab} />
          {activeTab === "growth" && <GrowthTab stats={stats} />}
          {activeTab === "usage" && <UsageTab stats={stats} />}
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
