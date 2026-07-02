import { Button } from "~/components/Button";
import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";

// Bare button — no layout wrapper. Callers compose it into rows/columns as
// needed. Two consumers right now: the set detail page (paired with
// SaveForOfflineButton in a shared centred row) and the FullPlayer overlay
// (stacked in a flex col with the open-set-details link).
export function ShareSetButton({ set, className }: { set: MusicSet; className?: string }) {
  const openShareModal = useStore((s) => s.openShareModal);

  return (
    <Button variant="secondary" onClick={() => openShareModal(set)} className={className}>
      share_set
    </Button>
  );
}
