import { ShareIcon } from "~/components/icons";
import type { MusicSet } from "~/data/sets";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";

// Sibling of <CirclePlayButton>: same circular silhouette, bordered, with the
// same hover + transition treatment — but smaller and in subdued grey so the
// play button still reads as the primary action.
export function ShareIconButton({ set }: { set: MusicSet }) {
  const openShareModal = useStore((s) => s.openShareModal);
  const trackEvent = useTrackEvent();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        trackEvent("share_click", set.id);
        openShareModal(set);
      }}
      aria-label={`Share ${set.artist} — ${set.title}`}
      className="flex items-center justify-center shrink-0 w-10 h-10 sm:w-14 sm:h-14 text-grey transition-all duration-300 cursor-pointer hover:scale-110 hover:text-gold"
    >
      <ShareIcon className="w-5 h-5" />
    </button>
  );
}
