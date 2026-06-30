import { Link } from "@tanstack/react-router";
import { useDrag } from "@use-gesture/react";
import { useRef } from "react";
import { BracketLabel } from "~/components/BracketLabel";
import { Image } from "~/components/Image";
import { ShareSetButton } from "~/components/ShareSetButton";
import { NextIcon, PrevIcon } from "~/components/icons";
import { CirclePlayButton } from "~/components/player/CirclePlayButton";
import { PlayerSeeker } from "~/components/player/PlayerSeeker";
import { useFullPlayerLifecycle } from "~/hooks/useFullPlayerLifecycle";
import { useStore } from "~/store";
import { Z } from "~/styles/z";
import { shouldSnapClose } from "~/utils/playerGestures";

type FullPlayerProps = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  loading: boolean;
  hasError: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Shared with <MobileMiniPlayer> — both gestures mutate this element's
   *  transform directly, so React never re-renders mid-drag. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
};

// Mobile-only full-screen "now playing" overlay. Mounted inside <Player /> so
// it can share `audioRef` + the useAudioPlayer outputs without context
// plumbing. Always rendered while `nowPlaying` exists — `transform: translateY()`
// controls visibility so the slide animation plays in both directions. All the
// dismissal / focus / history side-effects live in useFullPlayerLifecycle so
// this file stays a pure layout description.
export function FullPlayer({
  audioRef,
  isPlaying,
  loading,
  hasError,
  togglePlay,
  seek,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  containerRef,
  isDragging,
  setIsDragging,
}: FullPlayerProps) {
  const isOpen = useStore((s) => s.fullPlayerOpen);
  const closeFullPlayer = useStore((s) => s.closeFullPlayer);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Follow-finger drag down on the header → close. Direct DOM writes through
  // `containerRef` (shared with the mini-player) so we never re-render
  // mid-drag. Symmetric with MobileMiniPlayer's drag-up implementation —
  // refer there for the full pattern. `filterTaps: true` so taps on the [×]
  // button still hit the button's onClick instead of the drag handler.
  const headerDragBind = useDrag(
    ({ active, first, movement: [, my], velocity: [, vy], event, last }) => {
      event.stopPropagation();
      const el = containerRef.current;
      if (!el) return;

      if (first) setIsDragging(true);

      if (active) {
        // Only respond to downward movement. Clamp 0 ≤ progress ≤ 1, where
        // 0 is fully open and 1 would be fully closed.
        const downward = Math.max(0, Math.min(1, my / window.innerHeight));
        el.style.transition = "none";
        el.style.transform = `translateY(${downward * 100}%)`;
      }

      if (last) {
        const progress = -my / window.innerHeight;
        const commit = shouldSnapClose(progress, vy, my);
        el.style.transition = "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.transform = commit ? "translateY(100%)" : "translateY(0%)";
        setIsDragging(false);
        if (commit) closeFullPlayer();
      }
    },
    { axis: "y", filterTaps: true },
  );

  useFullPlayerLifecycle({ isOpen, nowPlaying, closeFullPlayer, closeButtonRef });

  if (!nowPlaying) return null;

  return (
    <div
      ref={containerRef}
      className={`sm:hidden fixed inset-0 ${Z.fullPlayer} bg-black flex flex-col font-mono`}
      style={{
        // Slide-up animation. translateY (GPU-composited) instead of changing
        // `bottom` so the animation runs on the compositor thread and stays
        // smooth on mid-range Androids. 400ms with cubic-bezier(0.32, 0.72,
        // 0, 1) is iOS's "decelerate" curve — snappy entrance, soft landing.
        // `prefers-reduced-motion` is handled globally in styles/global.css.
        // When `isDragging` is true the gestures own this element's transform
        // / transition via direct DOM writes, so we omit them here entirely —
        // React reconciliation would otherwise overwrite the live drag value
        // on every parent re-render. The drag handler imperatively sets the
        // snap target *before* clearing isDragging, so by the time React
        // re-renders the element's current transform already matches our
        // resting value, no flicker.
        ...(isDragging
          ? {}
          : {
              transform: `translateY(${isOpen ? 0 : 100}%)`,
              transition: "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)",
            }),
        willChange: "transform",
        // Only the *bottom* safe area gets padding on the container; the
        // *top* is intentionally not padded so `bg-black` extends behind the
        // notch / dynamic island. The header below pads itself for clearance.
        // +1.5rem breathing room mirrors the header's
        // `calc(env(safe-area-inset-top) + 1.5rem)` pattern — without it,
        // the share / open-set-details stack sits flush against the bottom
        // on iPhone SE (no home indicator → safe-area-inset-bottom is 0).
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
      }}
      aria-hidden={!isOpen}
    >
      {/* Header — terminal label on the left, close button on the right.
          The pt-[calc()] gives notch + 24px breathing room without forcing
          the container to inset itself (so the black bg can still extend
          behind the notch). Close button gets p-2 so the tap target is
          ~44px on the diagonal even though the glyph is just `[ × ]`. */}
      <div
        {...headerDragBind()}
        className="flex items-center justify-between px-4 pb-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
          touchAction: "none",
        }}
      >
        <span className="text-sm text-grey tracking-widest">› now_playing</span>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeFullPlayer}
          aria-label="Close now playing"
          className="text-base text-grey hover:text-white tracking-widest cursor-pointer p-2 -mr-2"
        >
          [ × ]
        </button>
      </div>

      {/* Body — centred column with artwork, identity, seeker, transport, share.
          The dvh-clamped artwork keeps everything on-screen on iPhone SE
          (667pt tall) without forcing a media query — `min(280px, 38dvh)`
          shrinks it only when the viewport actually gets short. The gap also
          scales with viewport height: tight on the SE, breathing on the XR /
          15 Pro Max, capped at 2.25rem so it never reads cartoonish on
          iPad-sized viewports. `dvh` (not `vh`) so iOS Safari's collapsing
          URL bar doesn't cause the column to jump as the user scrolls. */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 min-h-0"
        style={{ gap: "clamp(1rem, 3.5dvh, 2.25rem)" }}
      >
        {/* Drag-to-close zone for the top half of the body. Combined with the
            header strip, this lets the user dismiss the player by pulling
            down from wherever the thumb is naturally resting — usually on or
            near the artwork — instead of stretching all the way to the
            top-of-screen [ × ]. The bottom half (seeker, transport, share)
            stays interactive-only on purpose so a button drag never becomes
            an accidental dismiss. The wrapper carries its own gap so the
            artwork→identity spacing visually matches the body's other gaps. */}
        <div
          {...headerDragBind()}
          className="flex flex-col items-center"
          style={{ touchAction: "none", gap: "clamp(1rem, 3.5dvh, 2.25rem)" }}
        >
          {nowPlaying.artwork && (
            <div
              className="aspect-square overflow-hidden rounded-card border border-grey/20"
              style={{ width: "min(280px, 38dvh)" }}
            >
              <Image
                src={nowPlaying.artwork}
                alt={nowPlaying.title}
                sizes="280px"
                priority
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="text-center max-w-full">
            <div className="text-2xl font-bold text-white truncate">{nowPlaying.artist}</div>
            <div className="text-sm text-grey truncate">
              @ {nowPlaying.title}
              {nowPlaying.date && ` · ${nowPlaying.date}`}
            </div>
          </div>
        </div>

        <div className="w-full flex items-center gap-3">
          <PlayerSeeker
            audioRef={audioRef}
            nowPlaying={nowPlaying}
            seek={seek}
            disabled={loading || hasError}
          />
        </div>

        <div className="flex items-center justify-center gap-8">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev || loading}
            aria-label="Previous track"
            className="text-grey hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer text-xl transition-colors"
          >
            <PrevIcon />
          </button>

          <CirclePlayButton
            isThisPlaying={isPlaying}
            onClick={() => {
              if (!loading && !hasError) togglePlay();
            }}
            className="w-20 h-20 text-2xl"
          />

          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext || loading}
            aria-label="Next track"
            className="text-grey hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer text-xl transition-colors"
          >
            <NextIcon />
          </button>
        </div>

        {/* Share + open-set-details stacked. Stacking reads cleaner across
            screen widths than the inline-wrap row did on Android. Closing the
            overlay is deliberately left to the pathname-change effect in
            useFullPlayerLifecycle — calling closeFullPlayer in the Link's
            onClick races TanStack Router's history.pushState, which causes
            useFullPlayerLifecycle's cleanup to see the marker still on top,
            fire history.back(), and undo the navigation. The route effect
            fires only after the URL has actually changed, so its close cycle
            sees the new history entry and skips back(). */}
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/sets/$setId"
            params={{ setId: nowPlaying.id }}
            className="text-sm text-grey hover:text-white transition-colors tracking-widest whitespace-nowrap"
          >
            <BracketLabel>open_set_details</BracketLabel>
          </Link>
          <ShareSetButton set={nowPlaying} className="whitespace-nowrap" />
        </div>
      </div>
    </div>
  );
}
