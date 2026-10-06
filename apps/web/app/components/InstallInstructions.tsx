import { InstallIcon } from "@form-at/ui";
import { useState } from "react";
import { type FormFactor, detectFormFactor } from "~/utils/deviceFormFactor";
import type { IosThirdPartyBrowser, NoInstallHint } from "~/utils/installCapability";

// The two manual-install instruction blocks, extracted from SaveGateModal so
// PushOptInModal can reuse the exact same guidance with its own lead copy —
// one logical unit (how to install by hand, per platform), two shapes:
// an inline sentence tail for Chromium, a block list for iOS Safari.

// Manual-install guidance for the no-captured-prompt path. Reached by
// Chromium-family browsers that never fire `beforeinstallprompt` at all
// AND by Chrome before its install heuristics pass. (Android browsers known
// to only add shortcuts — Opera, Edge, Brave, Firefox — never get here:
// installCapability.ts sends them to Chrome instead.) So we never promise a specific menu item: name the labels
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

// Where the Share menu lives in each iOS browser. Only Safari's position has
// been checked on a device; the third-party ones follow each browser's
// current layout as documented, which they redesign often, so the wording
// names the menu rather than leaning on an exact spot.
const IOS_SHARE_STEP: Record<"Safari" | IosThirdPartyBrowser, string> = {
  Safari: "tap the share icon (⎙) at the bottom of Safari",
  Chrome: "tap the share icon (⎙) in Chrome's address bar",
  Firefox: "open Firefox's menu (☰) and tap Share",
  Edge: "open Edge's menu (⋯) and tap Share",
};

// iOS has no programmatic install prompt — the share menu is the only path,
// in Safari and, since iOS 16.4, in Chrome / Firefox / Edge too. Callers
// render their own lead sentence above this list.
export function IosInstallSteps({
  browser = "Safari",
}: {
  browser?: "Safari" | IosThirdPartyBrowser;
}) {
  return (
    <ol className="text-xs text-grey leading-relaxed space-y-2 pl-5 list-decimal">
      <li>{IOS_SHARE_STEP[browser]}</li>
      <li>
        scroll and tap <span className="text-white">Add to Home Screen</span>
      </li>
      <li>
        tap <span className="text-white">Add</span> in the top right
      </li>
    </ol>
  );
}

// The second half of every "this browser can't install" message: where to
// go instead. The caller's sentence before it says what lives in the app.
export function NoInstallPath({ hint }: { hint: NoInstallHint }) {
  const site = <span className="text-white">formatglasgow.com</span>;
  if (hint === "open-in-browser") {
    return (
      <>
        this app's browser can't install it — tap its menu (⋮), open this page in your browser and
        install from there. <span className="text-white">Chrome</span> and{" "}
        <span className="text-white">Samsung Internet</span> install apps; other browsers only add a
        shortcut.
      </>
    );
  }
  if (hint === "open-in-safari") {
    return (
      <>
        this app's browser can't install it — tap its menu (⋯), open this page in{" "}
        <span className="text-white">Safari</span> and add it to your home screen from there.
      </>
    );
  }
  if (hint === "use-chrome") {
    return (
      <>
        this browser can't install it — open {site} in <span className="text-white">Chrome</span>{" "}
        and install from there.
      </>
    );
  }
  if (hint === "use-safari") {
    return (
      <>
        this version of iOS only installs from Safari — open {site} in{" "}
        <span className="text-white">Safari</span> and install from there.
      </>
    );
  }
  return (
    <>
      this browser can't install it — open {site} in{" "}
      <span className="text-white">Chrome on Android</span> or{" "}
      <span className="text-white">Safari on iOS</span> to install.
    </>
  );
}
