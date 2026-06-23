import { Modal } from "~/components/Modal";
import { useInstallCapability, useTriggerInstallPrompt } from "~/hooks/useInstallCapability";
import { useStore } from "~/store";

const linkClass =
  "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer text-left";

type Props = { open: boolean; onClose: () => void };

// Platform-adaptive install prompt. Reuses the shared Modal shell so it sits
// in the same visual vocabulary as ShareModal, BookingsButton, etc.
//
// Closing the modal without installing sets pwaInstallDismissed=true — this
// makes the passive <InstallCta> on home stop nagging. <SaveForOfflineButton>
// stays alive regardless (Phase 3 dismiss semantic, see uiSlice.ts).
export function InstallPromptModal({ open, onClose }: Props) {
  const capability = useInstallCapability();
  const triggerInstall = useTriggerInstallPrompt();
  const setPwaInstalled = useStore((s) => s.setPwaInstalled);
  const setPwaInstallDismissed = useStore((s) => s.setPwaInstallDismissed);

  const handleClose = () => {
    // Passive dismiss — closing the modal without engaging. Hide the home
    // InstallCta from future visits but keep <SaveForOfflineButton> tappable.
    setPwaInstallDismissed(true);
    onClose();
  };

  const handleNativeInstall = async () => {
    const outcome = await triggerInstall();
    if (outcome !== "no-prompt") onClose();
  };

  // iOS self-report — user confirms they've already installed by following
  // the share-menu instructions. Both install surfaces flip to "installed"
  // mode for the rest of the user's lifetime on this device.
  const handleAlreadyInstalled = () => {
    setPwaInstalled(true);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      ariaLabel="Install Form:at for offline listening"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">install_for_offline</span>
        </div>
      }
    >
      {capability === "native" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-grey leading-relaxed">
            install Form:at to download sets and listen offline. lands on your home screen with our
            icon — fullscreen, no browser chrome.
          </p>
          <button type="button" onClick={handleNativeInstall} className={linkClass}>
            [ install ]
          </button>
        </div>
      )}

      {capability === "chromium-manual" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-grey leading-relaxed">
            install Form:at to download sets and listen offline:
          </p>
          <ol className="text-xs text-grey leading-relaxed space-y-2 pl-5 list-decimal">
            <li>
              <span className="text-white">mobile:</span> open the browser menu (⋮) and tap{" "}
              <span className="text-white">install app</span>
            </li>
            <li>
              <span className="text-white">desktop:</span> tap the install icon at the right end of
              your address bar
            </li>
          </ol>
        </div>
      )}

      {capability === "ios-safari" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-grey leading-relaxed">
            install Form:at to download sets and listen offline. iOS needs two taps from Safari's
            share menu:
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
          <button type="button" onClick={handleAlreadyInstalled} className={linkClass}>
            [ ✓ already installed ]
          </button>
        </div>
      )}

      {capability === "installed" && (
        <p className="text-sm text-grey leading-relaxed">
          thanks — offline download is coming soon. you're already set up to receive it the moment
          we ship the next update.
        </p>
      )}

      {capability === "unsupported" && (
        // Defensive — SaveForOfflineButton hides itself for unsupported,
        // so this branch shouldn't normally render.
        <p className="text-sm text-grey leading-relaxed">
          offline download isn't available in this browser. open Form:at in Chrome on Android, or
          Safari on iOS, to install.
        </p>
      )}
    </Modal>
  );
}
