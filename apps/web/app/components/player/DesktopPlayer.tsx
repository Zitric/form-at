import { useEffect, useState } from "react";
import { PlayerControls } from "~/components/player/PlayerControls";
import { PlayerSeeker } from "~/components/player/PlayerSeeker";
import { metaSeparator } from "~/components/player/playerCommon";
import type { MusicSet } from "~/data/sets";
import { Z } from "~/styles/z";

type Props = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  nowPlaying: MusicSet;
  isPlaying: boolean;
  loading: boolean;
  hasError: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

// Fixed bottom bar on `sm:` and above. Holds the full transport (prev / play /
// next), the desktop-style track meta column (artist stacked above title/date),
// and the waveform seeker. Mobile uses <MobileMiniPlayer> instead — desktop has
// the screen width for the rich version, so no tap-to-expand needed here.
export function DesktopPlayer({
  audioRef,
  nowPlaying,
  isPlaying,
  loading,
  hasError,
  togglePlay,
  seek,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: Props) {
  // 300ms opacity fade-in on mount — DesktopPlayer is conditionally rendered
  // when `nowPlaying` becomes truthy, so this is the bar's *entrance*
  // animation. Matches the mobile mini-player's slide-up polish without
  // duplicating the 0fr→1fr grid trick (we don't need the layout to
  // collapse/expand; the bar simply appears).
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <div
      className={`hidden sm:block fixed bottom-0 inset-x-0 ${Z.player} bg-black border-t border-white/10 py-3 font-mono`}
      style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms ease-out" }}
    >
      {/* Mirrors PageLayout / Header's `max-w-2xl mx-auto px-6 md:px-0` so
          the meta and waveform edges line up *exactly* with the cards above
          on every viewport size. md:px-0 drops the inner padding once the
          container has hit its max-width — see PageLayout for the full
          reasoning. */}
      <div className="flex flex-col gap-2 max-w-2xl mx-auto w-full px-6 md:px-0">
        {/* Row 1 — meta on the left (reads first on a left-to-right scan),
            transport controls on the right. Controls-on-right mirrors the
            mobile mini-player's play/pause-on-right convention so the two
            surfaces feel consistent instead of mirror-image. */}
        <div className="flex items-center justify-between gap-4">
          {/* Single-line meta — matches the mobile mini-player's inline
              `artist · title · date` format, bumped to text-base (16px) so it
              reads as the second visual anchor next to the waveform below. */}
          <div className="min-w-0 flex-1 text-base truncate">
            <span className="text-white">{nowPlaying.artist}</span>
            {metaSeparator}
            <span className="text-grey">{nowPlaying.title}</span>
            {nowPlaying.date && (
              <>
                {metaSeparator}
                <span className="text-grey">{nowPlaying.date}</span>
              </>
            )}
          </div>

          <PlayerControls
            loading={loading}
            hasError={hasError}
            isPlaying={isPlaying}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={onPrev}
            onNext={onNext}
            onToggle={togglePlay}
          />
        </div>

        {/* Row 2 — full-width waveform with no competing elements, so the
            seeker is the visual anchor of the player. The natural read order
            is identity (row 1) → progress (row 2), with transport right next
            to identity for thumb/cursor proximity. */}
        <div className="flex items-center gap-3">
          <PlayerSeeker
            audioRef={audioRef}
            nowPlaying={nowPlaying}
            seek={seek}
            disabled={loading || hasError}
          />
        </div>
      </div>
    </div>
  );
}
