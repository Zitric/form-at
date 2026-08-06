import type { MusicSet } from "@form-at/data/sets";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

type Args = {
  /** Current open/closed flag for the overlay (from uiSlice). */
  isOpen: boolean;
  /** Currently loaded track. Used to defensively close the overlay if the
   *  track state clears out underneath an open overlay. */
  nowPlaying: MusicSet | null;
  /** The close action from uiSlice. */
  closeFullPlayer: () => void;
  /** Ref to the close button inside the overlay. Focused on open so screen
   *  readers and keyboard users land *inside* the modal context. */
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
};

// All of the `<FullPlayer>` overlay's side-effects in one hook:
//
//   1. Escape key dismisses (desktop testing aid).
//   2. Close button gets focus when the overlay opens.
//   3. If `nowPlaying` ever clears while open, close defensively.
//   4. iOS swipe-back / Android system back / browser back consume a marker
//      history entry instead of navigating the page underneath.
//   5. Route changes auto-close so the overlay doesn't linger over a new page.
//
// Pulling these out leaves <FullPlayer> as pure layout — easier to scan and
// easier to swap a visual without touching the lifecycle logic. The hook
// reads inputs as args (rather than hitting the store itself) so it stays
// testable in isolation.
export function useFullPlayerLifecycle({
  isOpen,
  nowPlaying,
  closeFullPlayer,
  closeButtonRef,
}: Args) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Escape key dismisses (useful for desktop tab-through during testing —
  // mobile users get [ × ]). Only registered while open so background renders
  // don't leak listeners.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFullPlayer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeFullPlayer]);

  // Move keyboard focus into the overlay when it opens. The close button is
  // the first thing screen readers announce, which gives the right "you are
  // now inside a modal" signal. Browsers don't scroll fixed-positioned focus
  // targets, so focusing while the panel is still mid-animation is safe.
  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen, closeButtonRef]);

  // Defensive: if `nowPlaying` ever becomes null while the overlay is open
  // (cleared persisted state, manual store reset), dismiss it instead of
  // just rendering null. Otherwise `fullPlayerOpen` would silently stay
  // true and the overlay would auto-open the moment a new track loaded.
  useEffect(() => {
    if (!nowPlaying && isOpen) closeFullPlayer();
  }, [nowPlaying, isOpen, closeFullPlayer]);

  // System back-gesture handling. iOS swipe-from-edge / Android back button /
  // browser back would normally navigate the page underneath instead of just
  // dismissing the overlay. The standard fix is to push a marker history
  // entry on open — back-button then consumes that entry (firing popstate)
  // and we close the overlay without changing the URL. On manual close
  // ([ × ] or Escape), the cleanup pops our marker so the history stays tidy.
  const closedByRouteChange = useRef(false);
  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ fullPlayerOverlay: true }, "");
    const handlePopState = () => closeFullPlayer();
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Route-change closes must NOT pop the marker: TanStack's history
      // defers its window.history.pushState to a microtask
      // (@tanstack/history queueHistoryAction), so at cleanup time
      // `window.history.state` can STILL read as our marker even though the
      // router has already navigated. The unguarded check below then fired
      // history.back(), undoing the navigation — which, combined with the
      // useRouteTransition stranding, produces the "open_set_details → black
      // screen at /sets" failure. The ref decides explicitly instead of racing
      // the deferred pushState.
      // The marker stays buried in history, so the NEXT back from the new
      // page lands on it and popstate-navigates to its URL — the page the
      // overlay was opened from, which is where back should go anyway.
      if (closedByRouteChange.current) {
        closedByRouteChange.current = false;
        return;
      }
      // Manual close (button / Escape): pop our marker ourselves so a
      // future back doesn't have a phantom entry to traverse.
      if (window.history.state?.fullPlayerOverlay) {
        window.history.back();
      }
    };
  }, [isOpen, closeFullPlayer]);

  // Auto-close on route change. If the user taps the in-overlay "open set
  // details" link or any other path change happens beneath us, dismiss the
  // overlay so it doesn't linger over a new page.
  //
  // React fires effects once on mount even when the dep hasn't actually
  // "changed", so we guard the first run — otherwise we'd issue a redundant
  // close at app start when the overlay is already closed. Skipping it makes
  // the effect's behaviour literally match the comment above.
  const firstPathnameRun = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only `pathname` should re-trigger
  useEffect(() => {
    if (firstPathnameRun.current) {
      firstPathnameRun.current = false;
      return;
    }
    // Flag BEFORE closing so the marker effect's cleanup (triggered by the
    // isOpen flip this causes) knows not to history.back(). Only when the
    // overlay is actually open — a route change with the overlay closed
    // must not leave a stale flag that would skip a future manual-close pop.
    if (isOpen) closedByRouteChange.current = true;
    closeFullPlayer();
  }, [pathname]);
}
