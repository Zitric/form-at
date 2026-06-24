import type React from "react";
import { PauseIcon } from "~/components/icons/PauseIcon";
import { PlayIcon } from "~/components/icons/PlayIcon";
import { cn } from "~/utils/cn";

interface CirclePlayButtonProps {
  isThisPlaying: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export function CirclePlayButton({ isThisPlaying, onClick, className }: CirclePlayButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center shrink-0 w-14 h-14 sm:w-22 sm:h-22 rounded-full border-2 transition-all duration-300 text-grey cursor-pointer hover:scale-110 hover:text-gold",
        isThisPlaying
          ? "border-purple bg-purple/10 shadow-[0_0_15px_rgba(67,67,122,0.3)] text-gold"
          : "border-gold shadow-[0_0_10px_rgba(197,133,56,0.1)] hover:shadow-[0_0_20px_rgba(197,133,56,0.4)]",
        className,
      )}
      onClick={onClick}
      style={{ animation: isThisPlaying ? "" : "border-pulse 2s infinite" }}
      aria-label={isThisPlaying ? "Pause set" : "Play set"}
    >
      <span>{isThisPlaying ? <PauseIcon /> : <PlayIcon />}</span>
    </button>
  );
}
