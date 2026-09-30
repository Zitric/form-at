import { type InstallGateCopy, SaveGateModal } from "~/components/SaveGateModal";
import { useSaveGate } from "~/hooks/useSaveGate";

const STORY_GATE_COPY: InstallGateCopy = {
  ariaLabel: "Form:at — make an Instagram story",
  label: "instagram_story",
  prompt:
    "instagram stories are made in the Form:at app. install it to your home screen, then open this set there to make one.",
  manual: "instagram stories are made in the Form:at app — ",
  ios: "instagram stories are made in the Form:at app. iOS Safari only installs from the share menu — two taps:",
  openApp:
    "Form:at is already on your device — open this set from your home-screen app to make an instagram story. this tab can't record one.",
  cannotInstall: (
    <>
      instagram stories need <span className="text-white">Chrome on Android</span> or{" "}
      <span className="text-white">Safari on iOS</span> — open{" "}
      <span className="text-white">formatglasgow.com</span> there to install the app.
    </>
  ),
};

// Stories are made in the installed app. A browser-tab user who taps
// [ instagram_story ] gets the same install guidance as save_for_offline —
// the same gate (useSaveGate) and the same modal, with story copy — covering
// Android's native prompt, the manual hint, iOS Safari's share-menu steps,
// and browsers that can't install at all.
export function StoryInstallGate({ onClose }: { onClose: () => void }) {
  const gate = useSaveGate();
  // Opened only from a browser tab after hydration, so neither of these
  // should happen; if the page became standalone, there's nothing to gate.
  if (gate.allow || gate.reason === "pending") return null;
  return <SaveGateModal open onClose={onClose} gate={gate} copy={STORY_GATE_COPY} />;
}
