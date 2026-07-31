import { type SetStats, fetchSetStats } from "@form-at/data/set-stats";
import { sets } from "@form-at/data/sets";
import { Button } from "@form-at/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

// TEMPORARY proof-of-concept route — verifies that `fetchSetStats`, a
// `createServerFn` defined once in packages/data, resolves correctly when
// client-invoked from this app's own independent Vite/TanStack Start build
// (the more failure-prone path vs. an SSR-loader call). Replaced by the real
// dashboard route once this is confirmed working end to end (dev + build).
export const Route = createFileRoute("/")({
  component: ProofOfConcept,
});

function ProofOfConcept() {
  const [selectedSetId, setSelectedSetId] = useState(sets[0]?.id);
  const [stats, setStats] = useState<SetStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedSetId) return;
    let cancelled = false;
    setLoading(true);
    fetchSetStats({ data: selectedSetId })
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSetId]);

  return (
    <div className="p-8 flex flex-col gap-4">
      <h1 className="text-lg">@form-at/data proof of concept</h1>
      <div className="flex flex-wrap gap-2">
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
      {loading && <p>loading…</p>}
      {!loading && stats && <p>play count: {stats.playCount}</p>}
      {!loading && !stats && <p>no data (expected locally — no D1 binding)</p>}
    </div>
  );
}
