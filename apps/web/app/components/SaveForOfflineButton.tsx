import { useState } from "react";
import { Button } from "~/components/Button";
import { CancelDownloadModal } from "~/components/CancelDownloadModal";
import { InstallPromptModal } from "~/components/InstallPromptModal";
import { QuotaInfoModal } from "~/components/QuotaInfoModal";
import { SavedManageModal } from "~/components/SavedManageModal";
import { type MusicSet, getSet } from "~/data/sets";
import { useInstallCapability } from "~/hooks/useInstallCapability";
import { useOfflineStateFor, useTriggerDownload } from "~/hooks/useOfflineDownload";
import { useStore } from "~/store";
import { fmtBytes } from "~/utils/fmt";

// `save_for_offline` trigger on the set detail page.
//
// Two-axis state machine: install capability × per-set offline state.
//
// Capability gate (Q1 — locked 2026-06-27): install IS required to download.
// Justification is the iOS WebKit 7-day ITP eviction rule — standalone PWAs
// are exempt, plain Safari tabs are not (see PWA_PROGRESS.md + the canonical
// WebKit pages). An in-tab download would silently evaporate after ~7 days
// of no visits, breaking the feature's promise. So when the user is on a
// capable-but-not-installed platform, the button keeps its current behaviour
// (open InstallPromptModal); only once `capability === "installed"` does the
// per-state matrix kick in.
//
// Dismiss semantic (DIFFERENT from <InstallCta>):
//   - This button stays VISIBLE and TAPPABLE regardless of pwaInstallDismissed.
//   - A user tap ALWAYS opens the relevant modal / triggers the relevant action.
//   - The dismissed flag only suppresses passive prompting (i.e. <InstallCta>
//     on home), not user-initiated taps.
type Props = { set: MusicSet };

export function SaveForOfflineButton({ set }: Props) {
  const capability = useInstallCapability();
  const offlineState = useOfflineStateFor(set.id);
  const activeDownloadId = useStore((s) => s.activeDownloadId);
  const cancelDownload = useStore((s) => s.cancelDownload);
  const removeOfflineSet = useStore((s) => s.removeOfflineSet);
  const setToast = useStore((s) => s.setToast);
  const triggerDownload = useTriggerDownload(set.id);

  const [installOpen, setInstallOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Hidden for browsers without an install path (Firefox, iOS non-Safari,
  // macOS Safari, Chromium-pre-engagement). No point teasing a flow that
  // can't complete.
  if (capability === "unsupported") return null;

  // Pre-installed path: any tap opens InstallPromptModal. The set's offline
  // state is irrelevant here — without install we can't keep the bytes alive
  // long enough for "saved" to mean anything (see capability-gate comment).
  if (capability !== "installed") {
    return (
      <>
        <Button variant="secondary" onClick={() => setInstallOpen(true)}>
          save_for_offline
        </Button>
        <InstallPromptModal open={installOpen} onClose={() => setInstallOpen(false)} />
      </>
    );
  }

  // Installed + per-state machine. Each branch derives its label and onTap
  // from `offlineState.status`. Modals are state-bound — only one can be
  // open at a time per branch, so the boolean-per-modal approach is clean
  // without a reducer.
  switch (offlineState.status) {
    case "not-saved": {
      const label = set.sizeBytes
        ? `save_for_offline · ${fmtBytes(set.sizeBytes)}`
        : "save_for_offline";
      return (
        <Button variant="secondary" onClick={triggerDownload}>
          {label}
        </Button>
      );
    }

    case "downloading": {
      const pct = Math.floor((offlineState.bytesDownloaded / offlineState.bytesTotal) * 100);
      // Title from getSet rather than props in case the modal stays mounted
      // after a navigation — getSet is the source of truth either way.
      const titleForModal = getSet(set.id)?.artist ?? set.artist;
      return (
        <>
          <Button variant="secondary" onClick={() => setCancelOpen(true)}>
            downloading · {pct}%
          </Button>
          <CancelDownloadModal
            open={cancelOpen}
            onClose={() => setCancelOpen(false)}
            onConfirmCancel={() => cancelDownload(set.id)}
            setTitle={titleForModal}
          />
        </>
      );
    }

    case "saved": {
      const { bytesTotal } = offlineState;
      return (
        <>
          <Button variant="secondary" onClick={() => setManageOpen(true)}>
            saved · {fmtBytes(bytesTotal)}
          </Button>
          <SavedManageModal
            open={manageOpen}
            onClose={() => setManageOpen(false)}
            onRemove={() => {
              removeOfflineSet(set.id).catch(() => {
                setToast("could not remove — try again");
              });
            }}
            setTitle={set.artist}
            bytesTotal={bytesTotal}
          />
        </>
      );
    }

    case "failed": {
      if (offlineState.reason === "quota") {
        const shortfall = offlineState.quotaShortfallBytes ?? 0;
        return (
          <>
            <Button variant="fail" onClick={() => setQuotaOpen(true)}>
              ✗ need {fmtBytes(shortfall)} more
            </Button>
            <QuotaInfoModal
              open={quotaOpen}
              onClose={() => setQuotaOpen(false)}
              onRetry={triggerDownload}
              shortfallBytes={shortfall}
            />
          </>
        );
      }
      // Network / aborted — retry is the obvious action. Active download
      // elsewhere still throws ONE_DOWNLOAD_AT_A_TIME which `triggerDownload`
      // handles with a toast (same behaviour as the `not-saved` retry).
      const retryLabel = activeDownloadId ? "retry · waiting" : "↻ retry";
      return (
        <Button variant="secondary" onClick={triggerDownload}>
          {retryLabel}
        </Button>
      );
    }

    case "evicted": {
      const { lastKnownBytes } = offlineState;
      return (
        <Button variant="secondary" onClick={triggerDownload}>
          ↻ re-save · was {fmtBytes(lastKnownBytes)}
        </Button>
      );
    }
  }
}
