import { BracketLabel } from "@form-at/ui";
import { useEffect, useState } from "react";
import { Z } from "~/styles/z";
import { isDevModeActive, setDevMode } from "~/utils/devMode";

// Persistent, full-width, top-of-viewport indicator whenever dev mode is
// active — see devMode.ts for what it does and why it defaults off.
// Activated by visiting with `?devmode=on`; `?devmode=off` clears it too,
// so a link can turn it off remotely as well as the button below.
//
// Unlike InAppBrowserBanner's dismiss, there is deliberately NO "hide but
// keep suppressing" state here. The button disables dev mode outright —
// dismissing the reminder without also turning off the thing it's warning
// about would defeat the entire point: a forgotten flag silently dropping
// real listening data, unnoticed. Same shape as the RUM archiver's
// staleness warning needing to be visible rather than pull-only.
export function DevModeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("devmode");
    if (requested === "on") setDevMode(true);
    else if (requested === "off") setDevMode(false);
    setShow(isDevModeActive());
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-x-0 top-0 ${Z.devModeBanner} bg-gold text-black px-3 py-1.5 flex items-center justify-center gap-3 font-mono text-xs`}
    >
      <span>[ dev_mode — plays from this browser are not counted ]</span>
      <button
        type="button"
        onClick={() => {
          setDevMode(false);
          setShow(false);
        }}
        aria-label="Disable dev mode"
        className="shrink-0 hover:opacity-70 transition-opacity cursor-pointer"
      >
        <BracketLabel>disable</BracketLabel>
      </button>
    </div>
  );
}
