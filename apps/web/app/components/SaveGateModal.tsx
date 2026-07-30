import { Button, Modal, TextButton } from "@form-at/ui";

import { IosInstallSteps, ManualInstallHint } from "~/components/InstallInstructions";
import { type SaveGate, useTriggerInstallPrompt } from "~/hooks/useSaveGate";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";

type Props = { open: boolean; onClose: () => void; gate: SaveGate };

// Renders the guidance the user needs when tapping `save_for_offline` in a
// browser tab (where downloads are deliberately disabled). Branches on the
// `gate.reason` discriminant from <useSaveGate>:
//
//   needs-install  — case (a): browser CAN install + we don't know the PWA is
//                    on the device. Fire the native prompt if available,
//                    otherwise show manual instructions; include an
//                    "already installed → open it" escape-hatch so a user
//                    whose `pwaInstalled` flag never got captured can flip
//                    themselves into case (b) instead of getting stuck.
//   open-app       — case (b): persisted `pwaInstalled === true`. Send them
//                    to the home-screen icon. Include the inverse escape-
//                    hatch ("not installed? install it") for users whose
//                    flag is stale (cleared the app, never re-installed).
//   cannot-install — case (c): Firefox, iOS non-Safari, desktop Safari. No
//                    install path the user can drive on this browser. Point
//                    them at Chrome/Safari + formatglasgow.com.
//
// Never instantiated for `allow: true` or `reason: "pending"` — consumer
// buttons skip the modal entirely in those states.
export function SaveGateModal({ open, onClose, gate }: Props) {
  const triggerInstall = useTriggerInstallPrompt();
  const setPwaInstalled = useStore((s) => s.setPwaInstalled);
  const setPwaInstallDismissed = useStore((s) => s.setPwaInstallDismissed);
  const trackEvent = useTrackEvent();

  const handleClose = () => {
    // Passive dismiss matches the previous InstallPromptModal behaviour:
    // closing without engaging suppresses the home-page <InstallCta> while
    // leaving this modal reachable on every future save tap.
    setPwaInstallDismissed(true);
    // Only the needs-install branch is actually offering to install —
    // open-app ("go to your home screen") and cannot-install ("this browser
    // can't") have no install action to dismiss, so closing THOSE isn't an
    // install_dismissed in any meaningful sense; counting them would inflate
    // the metric with closes that were never really about installing.
    if (gate.allow === false && gate.reason === "needs-install") {
      trackEvent("install_dismissed");
    }
    onClose();
  };

  const handleNativeInstall = async () => {
    const outcome = await triggerInstall();
    if (outcome !== "no-prompt") onClose();
  };

  // Self-report flips us into case (b) on the next render. Used by both
  // case-a paths (chromium-manual and ios-safari) where the user knows the
  // app is already on their device but we never captured the install event.
  //
  // MUST NOT call onClose here. The self-report changes `pwaInstalled`,
  // which changes `gate.reason` via `useSaveGate`, which re-renders THIS
  // modal with the OTHER case's copy — that's the correction the user
  // asked for. Closing on top of that would mean the confirmation copy
  // flashes for one frame before the exit animation runs, which reads as
  // "did the button do anything?" and hides the mutual escape-hatch pair
  // that makes misclassification recoverable in both directions.
  const handleAlreadyInstalled = () => {
    setPwaInstalled(true);
  };

  // Inverse self-report — case (b) escape-hatch. Lets a user with a stale
  // `pwaInstalled` flag (deleted the PWA, never re-installed) recover into
  // case (a) instead of being told to open something that isn't there.
  // Same rule as `handleAlreadyInstalled`: do not close — let the reason
  // flip re-render this modal with the other case's copy in place.
  const handleNotInstalledAfterAll = () => {
    setPwaInstalled(false);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      ariaLabel="Form:at — save sets for offline listening"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">save_for_offline</span>
        </div>
      }
    >
      {gate.allow === false && gate.reason === "needs-install" && (
        <div className="flex flex-col gap-4">
          {gate.platform === "chromium" ? (
            gate.canPrompt ? (
              <>
                <p className="text-sm text-grey leading-relaxed">
                  saving sets offline lives in the Form:at app. install it to your home screen —
                  fullscreen, no browser chrome — then come back here to save.
                </p>
                <Button variant="secondary" onClick={handleNativeInstall} className="text-left">
                  install
                </Button>
              </>
            ) : (
              <p className="text-sm text-grey leading-relaxed">
                saving sets offline lives in the Form:at app — <ManualInstallHint />
              </p>
            )
          ) : (
            <>
              <p className="text-sm text-grey leading-relaxed">
                saving sets offline lives in the Form:at app. iOS Safari only installs from the
                share menu — two taps:
              </p>
              <IosInstallSteps />
            </>
          )}
          <TextButton
            onClick={(e) => {
              e.stopPropagation();
              handleAlreadyInstalled();
            }}
          >
            already installed? open it from your home screen
          </TextButton>
        </div>
      )}

      {gate.allow === false && gate.reason === "open-app" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-grey leading-relaxed">
            Form:at is already on your device — open it from your home screen to save sets for
            offline listening. this tab streams from the network, the app keeps the bytes.
          </p>
          <TextButton
            onClick={(e) => {
              e.stopPropagation();
              handleNotInstalledAfterAll();
            }}
          >
            not installed? install the app
          </TextButton>
        </div>
      )}

      {gate.allow === false && gate.reason === "cannot-install" && (
        <p className="text-sm text-grey leading-relaxed">
          saving sets offline needs <span className="text-white">Chrome on Android</span> or{" "}
          <span className="text-white">Safari on iOS</span> — open{" "}
          <span className="text-white">formatglasgow.com</span> there to install the app. this
          browser streams sets fine, but can't keep them offline.
        </p>
      )}
    </Modal>
  );
}
