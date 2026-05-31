import { useState } from "react";
import type { MusicSet } from "~/data/sets";
import { useShareSet } from "~/hooks/useShareSet";
import { getAudioCurrentTime } from "~/store/playerSlice";

type Props = {
  set: MusicSet;
  /** True when this set is the one currently loaded in the player. Enables the
   * "share @ MM:SS" secondary button. */
  isCurrent?: boolean;
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function ShareSetButton({ set, isCurrent }: Props) {
  const share = useShareSet();
  const [tickTime, setTickTime] = useState(0);

  const refreshTime = () => setTickTime(getAudioCurrentTime());
  const displayTime = isCurrent ? tickTime || getAudioCurrentTime() : 0;

  const linkClass =
    "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer";

  return (
    <div
      className="flex justify-center flex-wrap gap-x-5 gap-y-2 mb-8"
      onMouseEnter={refreshTime}
    >
      <button type="button" onClick={() => share(set)} className={linkClass}>
        [ share_set ]
      </button>
      {isCurrent && displayTime > 3 && (
        <button type="button" onClick={() => share(set, displayTime)} className={linkClass}>
          [ share @ {fmtTime(displayTime)} ]
        </button>
      )}
    </div>
  );
}
