import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";
import { cn } from "~/utils/cn";

// Bare button — no layout wrapper. Callers compose it into rows/columns as
// needed. Two consumers right now: the set detail page (paired with
// SaveForOfflineButton in a shared centred row) and the FullPlayer overlay
// (stacked in a flex col with the open-set-details link).
export function ShareSetButton({ set, className }: { set: MusicSet; className?: string }) {
  const openShareModal = useStore((s) => s.openShareModal);

  return (
    <button
      type="button"
      onClick={() => openShareModal(set)}
      className={cn(
        "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer",
        className,
      )}
    >
      [ share_set ]
    </button>
  );
}
