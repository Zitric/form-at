import { useSwUpdate } from "~/hooks/useSwUpdate";
import { useStore } from "~/store";
import { Z } from "~/styles/z";

// "new build · tap to reload" — the user-consented SW update flow (H2).
// Shown when a new service-worker build is installed and waiting; tapping
// posts SKIP_WAITING to the waiting worker, and the page reloads itself on
// controllerchange (see useSwUpdate). Same persistent-tappable-toast shape
// as <PlaybackErrorToast>, gold instead of red — it's an offer, not an
// error. Whole surface is the action; no dismiss affordance (ignoring it is
// free: the update simply applies on the next natural page load).
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
    <div
      // Same bottom math as <Toast> / <PlaybackErrorToast>: nav (55) +
      // mini-player (50) + safe-area + 12.
      className={`fixed inset-x-0 ${Z.toast} flex items-center justify-center pointer-events-none px-4 bottom-[calc(105px+env(safe-area-inset-bottom)+12px)] sm:bottom-[100px]`}
    >
      <button
        type="button"
        onClick={applyUpdate}
        className="pointer-events-auto bg-black border border-gold/40 text-gold text-xs font-mono max-w-sm px-4 py-2 hover:text-white transition-colors cursor-pointer animate-fade-in"
      >
        new build · tap to reload
      </button>
    </div>
  );
}
