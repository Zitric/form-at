import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";

// Sibling of <CirclePlayButton>: same circular silhouette, bordered, with the
// same hover + transition treatment — but smaller and in subdued grey so the
// play button still reads as the primary action.
export function ShareIconButton({ set }: { set: MusicSet }) {
  const openShareModal = useStore((s) => s.openShareModal);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openShareModal(set);
      }}
      aria-label={`Share ${set.artist} — ${set.title}`}
      className="flex items-center justify-center shrink-0 w-14 h-14 text-grey transition-all duration-300 cursor-pointer hover:scale-110 hover:text-gold"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden="true"
        className="w-5 h-5"
      >
        <path d="M12 3v12" />
        <path d="M7 8l5-5 5 5" />
        <path d="M5 14v6h14v-6" />
      </svg>
    </button>
  );
}
