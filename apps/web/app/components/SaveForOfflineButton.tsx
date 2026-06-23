import { useState } from "react";
import { InstallPromptModal } from "~/components/InstallPromptModal";
import { useInstallCapability } from "~/hooks/useInstallCapability";

// "Save for offline" trigger on the set detail page.
//
// PHASE 3 SCOPE — IMPORTANT: this button is purely the install-modal trigger.
// It does NOT download audio, does NOT touch Cache Storage, does NOT fetch
// the MP3. Real offline download lands in a later phase once sw.ts has the
// caching strategy + quota handling wired up. Do not add download logic here
// without that infrastructure in place — it would fail in confusing ways.
//
// Dismiss semantic (DIFFERENT from <InstallCta>):
//   - This button stays VISIBLE and TAPPABLE regardless of pwaInstallDismissed.
//   - A user tap ALWAYS opens the modal. The dismissed flag only suppresses
//     passive prompting (i.e. <InstallCta> on home), not user-initiated taps.
//   - <InstallCta> uses the opposite "hide on dismiss" semantic because it's
//     a passive CTA, not a user action. See uiSlice.ts for the full note.
export function SaveForOfflineButton() {
  const [open, setOpen] = useState(false);
  const capability = useInstallCapability();

  // Hidden for browsers without an install path (Firefox, iOS non-Safari,
  // macOS Safari, Chromium-pre-engagement). No point teasing a flow that
  // can't complete. On Chromium specifically, the button will appear once
  // Chrome fires beforeinstallprompt — that's accepted UX cost for honesty.
  if (capability === "unsupported") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer"
      >
        [ save_for_offline ]
      </button>
      <InstallPromptModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
