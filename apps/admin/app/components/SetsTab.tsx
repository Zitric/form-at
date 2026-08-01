import type { SetStats } from "@form-at/data/set-stats";
import { sets } from "@form-at/data/sets";
import { Button, Label, Muted, TerminalRow } from "@form-at/ui";
import type { AdminDashboardStats } from "~/data/admin-stats";
import { fmtDuration } from "~/utils/fmt";
import { DashboardCard } from "./DashboardCard";

interface SetsTabProps {
  stats: AdminDashboardStats;
  selectedSetId: string | undefined;
  selectedSetStats: SetStats | null;
  selectedSetLoading: boolean;
  onSelectSet: (id: string) => void;
}

// per_set_plays + clicks — both are already per-set-scoped (the picker here,
// and clicks.perSet below), a natural "drill into one set" tab.
//
// selectedSetId/selectedSetStats/selectedSetLoading are owned by
// dashboard.tsx, NOT this component — switching to another tab and back
// must not lose the selection or re-trigger fetchSetStats, which it would if
// this state lived here and got unmounted with the tab.
export function SetsTab({
  stats,
  selectedSetId,
  selectedSetStats,
  selectedSetLoading,
  onSelectSet,
}: SetsTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <DashboardCard>
        <Label className="mb-2 text-grey tracking-widest">{"// per_set_plays"}</Label>
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
          {sets.map((set) => (
            <Button
              key={set.id}
              variant="secondary"
              onClick={() => onSelectSet(set.id)}
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
            avg_engaged_listening is cumulative playback time, not furthest position reached — it
            can exceed the track's own length for a listener who scrubs back and replays sections.
          </p>
        )}
      </DashboardCard>

      <DashboardCard>
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
      </DashboardCard>
    </div>
  );
}
