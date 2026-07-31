import { BracketLabel } from "@form-at/ui";
import { useEffect, useState } from "react";
import { useNavReady } from "~/hooks/useNavReady";
import { useStore } from "~/store";
import { ABOVE_CHROME_BOTTOM, ABOVE_NAV_BOTTOM } from "~/styles/layout";
import { Z } from "~/styles/z";
import { isInAppBrowser } from "~/utils/inAppBrowser";
import { safeSession } from "~/utils/safeStorage";

const DISMISS_KEY = "iab-dismissed";
const INSTRUCTION = "for full audio: tap ⋯ and open in safari";

// Persistent informational banner shown when the page is rendered inside a
// known in-app browser (Instagram, Facebook, TikTok, Line). Teaches the manual
// escape — "tap ⋯ and open in safari" — rather than trying to auto-launch
// Safari via URL schemes that fail silently on most current host-app builds.
// See platform-asymmetry-honesty in CLAUDE memory + Phase 2 plan section 2.2.
//
// Mobile-only (`sm:hidden`): in-app browsers ARE mobile, no point on desktop.
//
// Dismiss is session-scoped via `sessionStorage` — re-entering from a different
// share later shows the banner again (different WebView session), but within
// the current session it stays dismissed.
//
// Static text (no marquee): the instruction fits comfortably at iPhone SE 375
// — the narrowest viewport we support — and the surface is informational
// chrome the user reads once and dismisses, not long-form content that needs
// to keep scrolling. Decorative animation here would also be (correctly)
// suppressed for `prefers-reduced-motion` users. If a future copy change
// pushes the text past the fit threshold, revisit; for now plain text is the
// honest call.
export function InAppBrowserBanner() {
  // Defer detection to mount — UA + sessionStorage both need `window`, so SSR
  // renders nothing and the client decides on hydration.
  const [show, setShow] = useState(false);

  // Bottom anchor: sit above MobileMiniPlayer when a track is loaded, above
  // BottomNav alone when nothing is playing. Matches SwipeNavigator's dot
  // positioning so the chrome stack reads consistently. `navReady` gates the
  // player-aware position until the navbar's first-load fade finishes — same
  // staged-entry beat the rest of the mobile chrome uses.
  const nowPlaying = useStore((s) => s.nowPlaying);
  const navReady = useNavReady();
  const bottom = nowPlaying && navReady ? ABOVE_CHROME_BOTTOM : ABOVE_NAV_BOTTOM;

  useEffect(() => {
    const detected = isInAppBrowser();
    if (!detected) return;
    if (safeSession.get(DISMISS_KEY) === "1") return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div
      className={`sm:hidden fixed inset-x-0 ${Z.iabBanner} bg-black border-t-2 border-gold pl-3 pr-2 py-2 flex items-center gap-3 font-mono text-xs`}
      // `bottom` transitions 300ms ease-in-out so the banner *slides* up when
      // the mini-player loads, matching the player's own `grid-template-rows`
      // animation timing exactly. Without this the banner snaps from
      // above-nav to above-player position the instant `nowPlaying` flips.
      style={{ bottom, transition: "bottom 300ms ease-in-out" }}
    >
      <p className="flex-1 min-w-0 truncate text-white">{INSTRUCTION}</p>
      <button
        type="button"
        onClick={() => {
          safeSession.set(DISMISS_KEY, "1");
          setShow(false);
        }}
        aria-label="Dismiss in-app browser banner"
        className="shrink-0 text-grey hover:text-white px-1 -my-1 py-2 cursor-pointer transition-colors"
      >
        <BracketLabel>×</BracketLabel>
      </button>
    </div>
  );
}
