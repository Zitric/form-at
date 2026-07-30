import { Button } from "@form-at/ui";
import type { MusicSet } from "~/data/sets";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";

// Bare button — no layout wrapper. Callers compose it into rows/columns as
// needed. Two consumers right now: the set detail page (paired with
// SaveForOfflineButton in a shared centred row) and the FullPlayer overlay
// (stacked in a flex col with the open-set-details link).
export function ShareSetButton({ set, className }: { set: MusicSet; className?: string }) {
  const openShareModal = useStore((s) => s.openShareModal);
  const trackEvent = useTrackEvent();

  const handleClick = () => {
    trackEvent("share_click", set.id);
    openShareModal(set);
  };

  return (
    <Button variant="secondary" onClick={handleClick} className={className}>
      share_set
    </Button>
  );
}
