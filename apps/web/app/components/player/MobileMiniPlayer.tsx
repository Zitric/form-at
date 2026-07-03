import { useDrag } from "@use-gesture/react";
import { useEffect, useRef, useState } from "react";
import { MobileProgressBar } from "~/components/player/MobileProgressBar";
import { metaSeparator, playToggleIcon } from "~/components/player/playerCommon";
import type { MusicSet } from "~/data/sets";
import { useNavReady } from "~/hooks/useNavReady";
import { useStore } from "~/store";
import { ABOVE_NAV_BOTTOM, LAYOUT } from "~/styles/layout";
import { Z } from "~/styles/z";
import { shouldSnapOpen } from "~/utils/playerGestures";

type Props = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  nowPlaying: MusicSet | null;
  isPlaying: boolean;
  loading: boolean;
  hasError: boolean;
  togglePlay: () => void;
  /** Ref to <FullPlayer>'s root element so the drag-to-open gesture can
   *  drive its translateY via direct DOM writes (no Zustand round-trip, no
   *  re-renders mid-drag). Lifted to <Player> and shared. */
  fullPlayerRef: React.RefObject<HTMLDivElement | null>;
  /** Shared with <FullPlayer>'s style prop so React omits transform /
   *  transition while we're driving them imperatively. */
  setIsDragging: (v: boolean) => void;
};

// Always-in-DOM mobile bar. Animates from 0fr → 1fr on `nowPlaying`, sits
// directly on top of <BottomNav>, and routes a tap on the strip to the
// full-screen "now playing" overlay. The inner play/pause is a real <button>
// with stopPropagation so it doesn't fire the strip's open-overlay handler.
export function MobileMiniPlayer({
  audioRef,
  nowPlaying,
  isPlaying,
  loading,
  hasError,
  togglePlay,
  fullPlayerRef,
  setIsDragging,
}: Props) {
  const openFullPlayer = useStore((s) => s.openFullPlayer);
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const trackTextRef = useRef<HTMLDivElement>(null);
  // Set true mid-drag once movement crosses the 4px threshold, consumed by
  // the row's onClick to swallow the synthetic click that browsers emit on
  // pointerup. Reset on the *next* click after the drag finishes.
  const dragOccurredRef = useRef(false);
  // 0 = text fits, no animation. Negative = the px distance we need to
  // translate the text by so its right edge lines up with the container's
  // right edge at the end of the scroll. Set on each track change.
  const [marqueeEnd, setMarqueeEnd] = useState(0);

  // Two signals: `overflowsRow` removes the centring spacer the moment the
  // text doesn't fit the current container (so the truncated track *can*
  // breathe into the spacer's slot), while `marqueeEnd` only fires the
  // animation when text *still* overflows after that 44px is reclaimed. This
  // separation matters: short-but-tight titles (e.g. "Julz Lever · Form:at
  // 002 · 2026-04-24") fit the wider container without scrolling, but were
  // wrongly truncated under the spacer in the previous version.
  const [overflowsRow, setOverflowsRow] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: id is the trigger; the setters are stable
  useEffect(() => {
    setMarqueeEnd(0);
    setOverflowsRow(false);
    if (!nowPlaying) return;
    const id = requestAnimationFrame(() => {
      const container = trackContainerRef.current;
      const text = trackTextRef.current;
      if (!container || !text) return;
      // Step 1: does the text overflow the *current* (with-spacer) container?
      // If not, leave centred + truncated as-is. 8px threshold avoids jittery
      // mode flips on marginal overflows.
      const currentOverflow = text.scrollWidth - container.clientWidth;
      if (currentOverflow <= 8) return;
      setOverflowsRow(true);
      // Step 2: reclaim the spacer's slot (32px + the gap-3 it would sit
      // beside = 44px) and re-check. If the wider container fits the text,
      // we're done — no animation needed. Otherwise scroll the remainder.
      const postShiftOverflow = currentOverflow - 44;
      if (postShiftOverflow > 8) setMarqueeEnd(-postShiftOverflow);
    });
    return () => cancelAnimationFrame(id);
  }, [nowPlaying?.id]);

  const isMarqueeing = marqueeEnd < 0;

  // Stagger our slide-up after the BottomNav's 0.8s fade-in so the two
  // motions don't clash on a first load with a rehydrated track. Shared with
  // SwipeNavigator's dot-position transition via `useNavReady` so the dots
  // and the player move in the same staged beat instead of independently.
  const navReady = useNavReady();

  // Track-meta as a single inline `artist · title · date` row, truncated on
  // narrow screens so a long title never pushes the play button off-screen.
  const trackInfo = nowPlaying && (
    <>
      <span className="text-white">{nowPlaying.artist}</span>
      {metaSeparator}
      <span className="text-grey">{nowPlaying.title}</span>
      {nowPlaying.date && (
        <>
          {metaSeparator}
          <span className="text-grey">{nowPlaying.date}</span>
        </>
      )}
    </>
  );

  const rowsClass = nowPlaying && navReady ? "grid-rows-[1fr]" : "grid-rows-[0fr]";

  // Follow-finger drag up → open full player. We mutate the <FullPlayer> root
  // element's `transform` / `transition` directly via ref, *without* round-
  // tripping through Zustand on every frame. React state ticks only twice per
  // gesture — once at start (setIsDragging(true), which makes FullPlayer's
  // JSX omit transform/transition so React doesn't fight us) and once at end
  // (setIsDragging(false) + the optional openFullPlayer() commit). Mid-drag
  // the 60fps motion never crosses a React boundary, which keeps the panel
  // smooth on low-end Androids.
  // Snap decision matches Apple Music / Spotify: commit if either the user
  // has dragged >30% of the viewport up OR released with a fast upward flick.
  // `filterTaps: true` keeps the existing onClick path alive for plain taps.
  const bind = useDrag(
    ({ active, first, movement: [, my], event, last, canceled }) => {
      event.stopPropagation();
      if (!nowPlaying) return;
      const el = fullPlayerRef.current;
      if (!el) return;

      if (first) setIsDragging(true);
      if (active && Math.abs(my) > 4) dragOccurredRef.current = true;

      if (active) {
        const progress = Math.max(0, Math.min(1, -my / window.innerHeight));
        el.style.transition = "none";
        el.style.transform = `translateY(${(1 - progress) * 100}%)`;
      }

      if (last) {
        const progress = Math.max(0, -my / window.innerHeight);
        // A browser-canceled gesture (notification shade, edge gesture,
        // pointer stolen mid-drag) must NEVER commit — before this guard, a
        // canceled fling left the overlay committed fully open (field bug
        // 2026-07-03, CDP-reproduced with touchCancel).
        const commit = !canceled && shouldSnapOpen(progress);
        // Imperatively set the snap target *with* the transition restored so
        // the browser animates from current inline transform to the target.
        // Without this the next React render would reconcile a "transition:
        // none" element and the snap would happen instantly.
        el.style.transition = "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.transform = commit ? "translateY(0%)" : "translateY(100%)";
        setIsDragging(false);
        if (commit) openFullPlayer();
      }
    },
    { axis: "y", filterTaps: true },
  );

  const openOverlay = () => {
    // After a drag, the browser still synthesises a click event. Swallow that
    // one — the snap decision already happened in the drag handler.
    if (dragOccurredRef.current) {
      dragOccurredRef.current = false;
      return;
    }
    if (nowPlaying) openFullPlayer();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (nowPlaying && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openOverlay();
    }
  };

  return (
    <div
      className={`sm:hidden fixed inset-x-0 ${Z.player} bg-black grid ${rowsClass}`}
      style={{
        bottom: ABOVE_NAV_BOTTOM,
        transition: "grid-template-rows 300ms ease-in-out",
      }}
    >
      <div className="overflow-hidden">
        {/* The outer is a div with role="button" — a real <button> here would
            create invalid nested-interactives HTML since the inner play/pause
            IS a real <button>. */}
        <div
          style={{ height: `${LAYOUT.playerHeightMobile}px` }}
          className="border-t border-white/10 font-mono flex flex-col"
        >
          {/* Centred track info with the play button hanging off the right
              edge. When the text fits, an invisible left spacer mirrors the
              play button's width so `text-center` actually visually centres
              the text in the full row. The spacer is dropped the moment the
              text overflows so the scrolling (or simply wider, non-scrolling)
              track can use the full bar width — otherwise the spacer reads
              as the bar "eating" the left edge mid-scroll.
              `pt-2` biases content down a hair to balance the bar's
              invisible touch area below — without it the row visually reads
              as top-heavy because the scrub strip's 16px tap area has only
              ~3px of visible bar at the very bottom. */}
          <div
            {...bind()}
            role={nowPlaying ? "button" : undefined}
            tabIndex={nowPlaying ? 0 : undefined}
            onClick={openOverlay}
            onKeyDown={onKeyDown}
            aria-label={nowPlaying ? "Open now playing" : undefined}
            className="flex-1 flex items-center px-4 gap-3 cursor-pointer pt-2"
            style={{ touchAction: "none" }}
          >
            {!overflowsRow && <div className="w-8 h-8 shrink-0" aria-hidden="true" />}
            {/* Marquee track-info. When the text fits, it sits centred + truncated
                as a static line. When it overflows the container, we measure the
                overflow distance and run the `marquee-scroll` keyframe with that
                value as `--marquee-end`, so the right edge of the text lines up
                with the right edge of the container at the end of the scroll.
                13px font is a deliberate mid-point — text-xs (12px) reads as
                an afterthought, text-sm (14px) at mono width pushes nearly
                every track into the scrolling state. */}
            <div ref={trackContainerRef} className="flex-1 min-w-0 overflow-hidden text-[13px]">
              <div
                ref={trackTextRef}
                className={`whitespace-nowrap ${isMarqueeing ? "" : "text-center truncate"}`}
                style={
                  isMarqueeing
                    ? {
                        animation: "marquee-scroll 10s linear infinite",
                        ["--marquee-end" as string]: `${marqueeEnd}px`,
                      }
                    : undefined
                }
              >
                {trackInfo}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              disabled={loading || hasError}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 text-xl text-gold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              suppressHydrationWarning
            >
              {playToggleIcon({ loading, isPlaying })}
            </button>
          </div>
          <MobileProgressBar audioRef={audioRef} nowPlaying={nowPlaying} />
        </div>
      </div>
    </div>
  );
}
