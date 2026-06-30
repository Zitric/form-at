import { useState } from "react";
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

const buttonClass =
  "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer text-left";

const buttonClassFail =
  "text-sm text-red-400 hover:text-red-300 transition-colors tracking-widest cursor-pointer text-left";

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
        <button type="button" onClick={() => setInstallOpen(true)} className={buttonClass}>
          [ save_for_offline ]
        </button>
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
        ? `[ save_for_offline · ${fmtBytes(set.sizeBytes)} ]`
        : "[ save_for_offline ]";
      return (
        <button type="button" onClick={triggerDownload} className={buttonClass}>
          {label}
        </button>
      );
    }

    case "downloading": {
      const pct = Math.floor((offlineState.bytesDownloaded / offlineState.bytesTotal) * 100);
      // Title from getSet rather than props in case the modal stays mounted
      // after a navigation — getSet is the source of truth either way.
      const titleForModal = getSet(set.id)?.artist ?? set.artist;
      return (
        <>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className={buttonClass}
            // Force the bracket pair onto one line on iPhone SE per CLAUDE.md
            style={{ whiteSpace: "nowrap" }}
          >
            [ downloading · {pct}% ]
          </button>
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
          <button type="button" onClick={() => setManageOpen(true)} className={buttonClass}>
            [ saved · {fmtBytes(bytesTotal)} ]
          </button>
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
            <button
              type="button"
              onClick={() => setQuotaOpen(true)}
              className={buttonClassFail}
              style={{ whiteSpace: "nowrap" }}
            >
              [ ✗ need {fmtBytes(shortfall)} more ]
            </button>
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
      const retryLabel = activeDownloadId
        ? "[ retry · waiting ]"
        : offlineState.reason === "aborted"
          ? "[ ↻ retry ]"
          : "[ ↻ retry ]";
      return (
        <button type="button" onClick={triggerDownload} className={buttonClass}>
          {retryLabel}
        </button>
      );
    }

    case "evicted": {
      const { lastKnownBytes } = offlineState;
      return (
        <button
          type="button"
          onClick={triggerDownload}
          className={buttonClass}
          style={{ whiteSpace: "nowrap" }}
        >
          [ ↻ re-save · was {fmtBytes(lastKnownBytes)} ]
        </button>
      );
    }
  }
}
