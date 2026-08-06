import { InstallIcon } from "@form-at/ui";
import { useState } from "react";
import { type FormFactor, detectFormFactor } from "~/utils/deviceFormFactor";

// The two manual-install instruction blocks, extracted from SaveGateModal so
// PushOptInModal can reuse the exact same guidance with its own lead copy —
// one logical unit (how to install by hand, per platform), two shapes:
// an inline sentence tail for Chromium, a block list for iOS Safari.

// Manual-install guidance for the no-captured-prompt path. Reached by
// Chromium-family browsers that never fire `beforeinstallprompt` at all
// (Opera Android carries `Chrome/` in its UA but its menu had no install
// entry) AND by Chrome before its install
// heuristics pass. So we never promise a specific menu item: name the labels
// it might carry, and say honestly that this browser may not offer one.
// Form-factor split: mobile → browser menu, desktop → address-bar icon
// (rendered with the actual Chrome install glyph). Renders as a sentence
// TAIL — the caller owns the lead ("… lives in the Form:at app — {tail}").
export function ManualInstallHint() {
  const [formFactor] = useState<FormFactor>(() =>
    typeof window !== "undefined" ? detectFormFactor() : "desktop",
  );

  return formFactor === "mobile" ? (
    <>
      open your browser menu (⋮) and look for <span className="text-white">install app</span> or{" "}
      <span className="text-white">add to home screen</span>. don't see either? this browser may not
      support installing — <span className="text-white">Chrome on Android</span> does.
    </>
  ) : (
    <>
      look for the install icon <InstallIcon className="inline-block align-[-0.15em]" /> at the
      right end of your address bar. don't see it? this browser may not support installing —{" "}
      <span className="text-white">Chrome</span> does.
    </>
  );
}

// iOS Safari has no programmatic install prompt — the share menu is the only
// path. Callers render their own lead sentence above this list.
export function IosInstallSteps() {
  return (
    <ol className="text-xs text-grey leading-relaxed space-y-2 pl-5 list-decimal">
      <li>tap the share icon (⎙) at the bottom of Safari</li>
      <li>
        scroll and tap <span className="text-white">Add to Home Screen</span>
      </li>
      <li>
        tap <span className="text-white">Add</span> in the top right
      </li>
    </ol>
  );
}
