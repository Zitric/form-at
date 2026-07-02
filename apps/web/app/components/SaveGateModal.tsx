import { useState } from "react";
import { Button } from "~/components/Button";
import { Modal } from "~/components/Modal";
import { InstallIcon } from "~/components/icons";
import { type SaveGate, useTriggerInstallPrompt } from "~/hooks/useSaveGate";
import { useStore } from "~/store";
import { type FormFactor, detectFormFactor } from "~/utils/deviceFormFactor";

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

  const [formFactor] = useState<FormFactor>(() =>
    typeof window !== "undefined" ? detectFormFactor() : "desktop",
  );

  const handleClose = () => {
    // Passive dismiss matches the previous InstallPromptModal behaviour:
    // closing without engaging suppresses the home-page <InstallCta> while
    // leaving this modal reachable on every future save tap.
    setPwaInstallDismissed(true);
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

  // Same form-factor split as the previous InstallPromptModal:
  //   mobile → "open browser menu (⋮), tap install app"
  //   desktop → "tap the install icon in the address bar" (rendered with
  //             the actual Chrome install glyph)
  const manualInstructionTail =
    formFactor === "mobile" ? (
      <>
        open your browser menu (⋮) and tap <span className="text-white">install app</span>.
      </>
    ) : (
      <>
        tap the install icon <InstallIcon className="inline-block align-[-0.15em]" /> at the right
        end of your address bar.
      </>
    );

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
                saving sets offline lives in the Form:at app — {manualInstructionTail}
              </p>
            )
          ) : (
            <>
              <p className="text-sm text-grey leading-relaxed">
                saving sets offline lives in the Form:at app. iOS Safari only installs from the
                share menu — two taps:
              </p>
              <ol className="text-xs text-grey leading-relaxed space-y-2 pl-5 list-decimal">
                <li>tap the share icon (⎙) at the bottom of Safari</li>
                <li>
                  scroll and tap <span className="text-white">Add to Home Screen</span>
                </li>
                <li>
                  tap <span className="text-white">Add</span> in the top right
                </li>
              </ol>
            </>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAlreadyInstalled();
            }}
            className="text-xs text-grey/70 hover:text-grey underline underline-offset-2 self-start"
          >
            already installed? open it from your home screen
          </button>
        </div>
      )}

      {gate.allow === false && gate.reason === "open-app" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-grey leading-relaxed">
            Form:at is already on your device — open it from your home screen to save sets for
            offline listening. this tab streams from the network, the app keeps the bytes.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNotInstalledAfterAll();
            }}
            className="text-xs text-grey/70 hover:text-grey underline underline-offset-2 self-start"
          >
            not installed? install the app
          </button>
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
