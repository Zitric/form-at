import { Card } from "@form-at/ui";
import { useNavigate } from "@tanstack/react-router";
import { CardArtwork } from "~/components/CardArtwork";
import { SaveForOfflineIconButton } from "~/components/SaveForOfflineIconButton";
import { ShareIconButton } from "~/components/ShareIconButton";
import { CirclePlayButton } from "~/components/player";
import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";

// Unified set-list card — consolidates two component paths that had drifted
// (PWA_PROGRESS.md, "Cosmetic backlog" → "Set card abstraction",
// field-confirmed 2026-07-06): `/sets/index.tsx` rendered
// `SaveForOfflineIconButton` in its action slot; `/djs/$djId.tsx`'s "played
// by this DJ" list only rendered `ShareIconButton` + `CirclePlayButton` — no
// way to save a set for offline from the DJ page at all. Structural fix, not
// a convention to remember: both surfaces now render the exact same
// component, so the action slot can't drift again.
//
// Deliberate visual change on the DJ page (flagged, not silent): the two
// original cards' BODIES already differed too — `/sets/index.tsx` had an
// extra truncation-resistant mobile-only 3-line layout (artist / @title /
// date) that the DJ page's card never had. Forking body markup per consumer
// would just reintroduce the same per-surface drift this component exists
// to remove, so this standardizes on the more robust version for both. Same
// fields, same order — a wrapping improvement, not an information change.
//
// Deliberately takes only `set` + `index`: navigation target, the playing
// check, and the action-button wiring were IDENTICAL at both call sites
// before this extraction — internalizing them (rather than accepting them
// as props) is what makes parity structural instead of conventional.
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
