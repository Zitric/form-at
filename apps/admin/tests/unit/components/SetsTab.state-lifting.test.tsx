import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type DashboardTabId, DashboardTabs } from "~/components/DashboardTabs";
import { SetsTab } from "~/components/SetsTab";
import type { AdminDashboardStats } from "~/data/admin-stats";

const STATS = {
  clicks: { saveClicks: 0, shareClicks: 0, perSet: [] },
} as unknown as AdminDashboardStats;

const fakeSetStats = { playCount: 5, avgSeconds: 90, weeklyPlays: [] };

// Mirrors AdminDashboard's real shape: fetchSetStats-per-selection state and
// its effect live in the PARENT, above the tab switch — exactly like
// dashboard.tsx does. This is the actual risk Julian flagged: if that state
// instead lived inside SetsTab, switching away from "sets" and back would
// unmount it, losing the selection and re-firing the fetch. Using the real
// SetsTab/DashboardTabs components (not reimplemented stand-ins) so this
// exercises the real mount/unmount behavior, not just a description of it.
function Harness({
  fetchSetStats,
}: { fetchSetStats: (id: string) => Promise<typeof fakeSetStats> }) {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("sets");
  const [selectedSetId, setSelectedSetId] = useState<string | undefined>("set-a");
  const [selectedSetStats, setSelectedSetStats] = useState<typeof fakeSetStats | null>(null);
  const [selectedSetLoading, setSelectedSetLoading] = useState(false);

  useEffect(() => {
    if (!selectedSetId) return;
    setSelectedSetLoading(true);
    fetchSetStats(selectedSetId).then((result) => {
      setSelectedSetStats(result);
      setSelectedSetLoading(false);
    });
  }, [selectedSetId, fetchSetStats]);

  return (
    <>
      <DashboardTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === "sets" && (
        <SetsTab
          stats={STATS}
          selectedSetId={selectedSetId}
          selectedSetStats={selectedSetStats}
          selectedSetLoading={selectedSetLoading}
          onSelectSet={setSelectedSetId}
        />
      )}
      {activeTab === "growth" && <p>growth placeholder</p>}
    </>
  );
}

describe("state-lifting: selected-set state survives a tab round trip", () => {
  it("does not refetch or lose the selection after switching away and back", async () => {
    const fetchSetStats = vi.fn().mockResolvedValue(fakeSetStats);
    const user = userEvent.setup();
    render(<Harness fetchSetStats={fetchSetStats} />);

    await waitFor(() =>
      expect(screen.getByText(/avg_engaged_listening is cumulative/i)).toBeInTheDocument(),
    );
    expect(fetchSetStats).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: /growth/i }));
    expect(screen.getByText(/growth placeholder/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /sets/i }));
    await waitFor(() =>
      expect(screen.getByText(/avg_engaged_listening is cumulative/i)).toBeInTheDocument(),
    );

    // The whole point: SetsTab unmounted and remounted across that round
    // trip, but the state lives in the parent, so no second fetch fired.
    expect(fetchSetStats).toHaveBeenCalledTimes(1);
  });
});
