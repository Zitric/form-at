import type { MusicSet } from "@form-at/data/sets";
import { Card } from "@form-at/ui";
import { useNavigate } from "@tanstack/react-router";
import { CardArtwork } from "~/components/CardArtwork";
import { SaveForOfflineIconButton } from "~/components/SaveForOfflineIconButton";
import { ShareIconButton } from "~/components/ShareIconButton";
import { CirclePlayButton } from "~/components/player";
import { useStore } from "~/store";

// Unified set-list card, rendered by BOTH `/sets/index.tsx` and
// `/djs/$djId.tsx`'s "played by this DJ" list. Both surfaces render this exact
// component so their action slots can't drift apart — don't fork the body
// markup per consumer, which is the drift this component exists to remove.
//
// Takes only `set` + `index` deliberately: the navigation target, the playing
// check, and the action-button wiring are internalized rather than passed in,
// which is what makes parity structural instead of conventional.
// Background: PWA_PROGRESS.md's "Cosmetic backlog" → Set card abstraction.
type Props = {
  set: MusicSet;
  index: number;
};

export function SetCard({ set, index }: Props) {
  const navigate = useNavigate();
  const playTrack = useStore((s) => s.playTrack);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const isThisPlaying = nowPlaying?.id === set.id && isPlaying;

  return (
    <Card
      image={
        set.artwork && (
          <CardArtwork src={set.artwork} alt={set.title} originalUrl={set.artworkOriginalUrl} />
        )
      }
      hideImageOnMobile
      onClick={() => navigate({ to: "/sets/$setId", params: { setId: set.id } })}
      action={
        <div className="flex items-center gap-1">
          <SaveForOfflineIconButton set={set} />
          <ShareIconButton set={set} />
          <CirclePlayButton
            isThisPlaying={isThisPlaying}
            onClick={(e) => {
              e.stopPropagation();
              playTrack(set);
            }}
          />
        </div>
      }
      animationDelay={index}
    >
      <div className="flex flex-col gap-1">
        {/* Phone widths (<sm): DJ on row 1, event on row 2 — no date/location
            row. Truncation-resistant for long names like "Brandon Lee Vear"
            at iPhone SE 375px, where the combined "{artist} @ {title}" line
            was getting cut. sm+ keeps the richer single-line + date/location
            layout. */}
        <p className="text-sm tracking-tight truncate sm:hidden">{set.artist}</p>
        <p className="text-xs tracking-tight truncate sm:hidden">
          @<span className="pl-1">{set.title}</span>
        </p>
        <p className="text-xs text-grey truncate sm:hidden"> {set.date}</p>

        <p className="hidden sm:block sm:text-base tracking-tight truncate">
          {set.artist} @ {set.title}
        </p>
        <p className="hidden sm:block sm:text-sm text-grey truncate">
          {set.date}
          {set.date && " · "}Glasgow
        </p>
      </div>
    </Card>
  );
}
