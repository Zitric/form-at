import { BracketLabel } from "@form-at/ui";
import { useEffect, useState } from "react";
import { useNavReady } from "~/hooks/useNavReady";
import { useStore } from "~/store";
import { ABOVE_CHROME_BOTTOM, ABOVE_NAV_BOTTOM } from "~/styles/layout";
import { Z } from "~/styles/z";
import { inAppContext } from "~/utils/inAppBrowser";
import { safeSession } from "~/utils/safeStorage";

const DISMISS_KEY = "iab-dismissed";
// From inAppContext: "tap ⋯ and open in safari". Fits at 375px (iPhone SE);
// keep any rewording within that.
function instruction(menu: string, destination: "browser" | "safari"): string {
  return `for full audio: tap ${menu} and open in ${destination}`;
}

// Persistent informational banner shown when the page is rendered inside a
// known in-app browser (Instagram, Facebook, TikTok, Line) ON iOS. Teaches the
// manual escape deliberately rather than auto-launching Safari via URL
// schemes, which fail silently on most current host-app builds. iOS's own
// in-app behaviour is still untested on a device.
//
// NOT shown on Android, and don't add it back on the "full audio" premise:
// it's false there. In Instagram's Android browser (Pixel 10 Pro, opened from
// the profile bio link) audio keeps playing with the screen locked, after
// switching apps, and for 5–10 minutes. What that WebView lacks is
// lock-screen and notification controls, and no page can add them:
// browser-compat-data marks navigator.mediaSession, MediaSession,
// MediaMetadata and Notification unsupported in WebView Android
// (crbug.com/40611412), so useAudioPlayer's media session effect skips
// itself there. Closing the in-app browser leaves the audio playing with no
// controls until an Instagram video with sound takes audio focus or
// Instagram is killed. That is accepted: the only lever, pausing when the
// page is hidden, would also stop locked-screen listening. Leaving the app's
// browser still works through the install/story/save gates (inAppContext).
// PWA_PROGRESS.md → "In-app browsers: per-platform copy, one helper".
//
// Mobile-only (`sm:hidden`): in-app browsers ARE mobile.
//
// Dismiss is session-scoped via `sessionStorage` — a later visit from a
// different share is a different WebView session and shows the banner again.
//
// Plain static text, no marquee: the copy fits at iPhone SE 375px, the
// narrowest viewport supported. Revisit only if a copy change breaks that fit.
export function InAppBrowserBanner() {
  // Defer detection to mount — UA + sessionStorage both need `window`, so SSR
  // renders nothing and the client decides on hydration.
  const [text, setText] = useState<string | null>(null);

  // Bottom anchor: sit above MobileMiniPlayer when a track is loaded, above
  // BottomNav alone when nothing is playing. Matches SwipeNavigator's dot
  // positioning so the chrome stack reads consistently. `navReady` gates the
  // player-aware position until the navbar's first-load fade finishes — same
  // staged-entry beat the rest of the mobile chrome uses.
  const nowPlaying = useStore((s) => s.nowPlaying);
  const navReady = useNavReady();
  const bottom = nowPlaying && navReady ? ABOVE_CHROME_BOTTOM : ABOVE_NAV_BOTTOM;

  useEffect(() => {
    const context = inAppContext();
    // iOS only (see above); named apps only: an unnamed WebView has no menu
    // we can describe.
    if (!context || context.os !== "ios" || context.app === "webview") return;
    if (safeSession.get(DISMISS_KEY) === "1") return;
    setText(instruction(context.menu, context.destination));
  }, []);

  if (!text) return null;

  return (
    <div
      className={`sm:hidden fixed inset-x-0 ${Z.iabBanner} bg-black border-t-2 border-gold pl-3 pr-2 py-2 flex items-center gap-3 font-mono text-xs`}
      // `bottom` transitions 300ms ease-in-out so the banner *slides* up when
      // the mini-player loads, matching the player's own `grid-template-rows`
      // animation timing exactly. Without this the banner snaps from
      // above-nav to above-player position the instant `nowPlaying` flips.
      style={{ bottom, transition: "bottom 300ms ease-in-out" }}
    >
      <p className="flex-1 min-w-0 truncate text-white">{text}</p>
      <button
        type="button"
        onClick={() => {
          safeSession.set(DISMISS_KEY, "1");
          setText(null);
        }}
        aria-label="Dismiss in-app browser banner"
        className="shrink-0 text-grey hover:text-white px-1 -my-1 py-2 cursor-pointer transition-colors"
      >
        <BracketLabel>×</BracketLabel>
      </button>
    </div>
  );
}
