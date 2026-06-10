import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";
import { cn } from "~/utils/cn";

export function ShareSetButton({ set, className }: { set: MusicSet; className?: string }) {
  const openShareModal = useStore((s) => s.openShareModal);

  return (
    <div className={cn("flex justify-center mb-6!", className)}>
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
