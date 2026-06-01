import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";

export function ShareSetButton({ set }: { set: MusicSet }) {
  const openShareModal = useStore((s) => s.openShareModal);

  return (
    <div className="flex justify-center mb-8">
      <button
        type="button"
        onClick={() => openShareModal(set)}
        className="text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer"
      >
        [ share_set ]
      </button>
    </div>
  );
}
