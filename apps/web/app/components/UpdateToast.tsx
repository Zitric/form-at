import { BracketLabel, ToastShell } from "@form-at/ui";
import { useSwUpdate } from "~/hooks/useSwUpdate";
import { useStore } from "~/store";
import { Z } from "~/styles/z";

// "new version ready [ update ]" — the user-consented SW update flow.
// Shown when a new service-worker build is installed and waiting; tapping
// posts SKIP_WAITING to the waiting worker, and the page reloads itself on
// controllerchange (see useSwUpdate). Surface/positioning come from
// `ToastShell`, which owns the treatment all three toasts share. Whole surface is
// the action; no dismiss affordance (ignoring it is free: the update simply
// applies on the next natural page load).
//
// Copy is deliberately jargon-free ("version", not "build") and the action
// verb is the user's goal ("update"), not the mechanism ("reload") — the
// reload explains itself when it happens. Hierarchy: grey message, gold
// bracketed action — one gold focal point instead of an all-gold strip.
export function UpdateToast() {
  const { updateReady, applyUpdate } = useSwUpdate();
  const activeDownloadId = useStore((s) => s.activeDownloadId);

  // Defer the offer while a set download is in flight: a reload aborts the
  // download (reload-during-download = aborted, by the offlineSlice
  // persistence rules), and a consent tap doesn't help a user who didn't
  // realize a download was running. This re-renders when the download
  // finishes and the toast appears then.
  if (!updateReady || activeDownloadId !== null) return null;

  return (
    <ToastShell variant="default" onClick={applyUpdate} zIndexClassName={Z.toast}>
      <span className="text-grey">new version ready</span>
      <BracketLabel tone="gold">update</BracketLabel>
    </ToastShell>
  );
}
