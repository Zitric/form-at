import type { MusicSet } from "@form-at/data/sets";
import { Button } from "@form-at/ui";
import { useState } from "react";
import { CancelDownloadModal } from "~/components/CancelDownloadModal";
import { QuotaInfoModal } from "~/components/QuotaInfoModal";
import { SaveGateModal } from "~/components/SaveGateModal";
import { SavedManageModal } from "~/components/SavedManageModal";
import { useOfflineStateFor, useTriggerDownload } from "~/hooks/useOfflineDownload";
import { useSaveGate } from "~/hooks/useSaveGate";
import { useStore } from "~/store";
import { getCatalogueSet } from "~/store/catalogueSlice";
import { fmtBytes } from "~/utils/fmt";

// `save_for_offline` trigger on the set detail page.
//
// Two-axis state machine: save-gate × per-set offline state.
//
// Download fires ONLY in standalone display-mode. Any browser tab — including
// one on a device where the PWA IS installed — gets <SaveGateModal> instead.
// This matches the SW read path: tabs always stream from network and never read
// IDB, the app does both (see `withAppContext`). Full rule: PWA_PROGRESS.md's
// "Save gate — strict standalone rule".
//
// Dismiss semantic: this button stays VISIBLE and TAPPABLE in every gate
// branch, and a tap ALWAYS opens the relevant modal or triggers the relevant
// action. `pwaInstallDismissed` suppresses only passive prompting (the home
// <InstallCta>), never user-initiated taps here.
type Props = { set: MusicSet };

export function SaveForOfflineButton({ set }: Props) {
  const gate = useSaveGate();
  const offlineState = useOfflineStateFor(set.id);
  const activeDownloadId = useStore((s) => s.activeDownloadId);
  const cancelDownload = useStore((s) => s.cancelDownload);
  const removeOfflineSet = useStore((s) => s.removeOfflineSet);
  const setToast = useStore((s) => s.setToast);
  const catalogueSets = useStore((s) => s.catalogueSets);
  const triggerDownload = useTriggerDownload(set.id);

  const [gateOpen, setGateOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Pre-hydration we can't decide which branch to render — keep the button
  // out of the DOM rather than flash an "install" path that flips to the
  // state machine a frame later.
  if (gate.allow === false && gate.reason === "pending") return null;

  // Tab / non-standalone: the button is visible (we want users to discover
  // the feature), but tap opens the guidance modal. No size hint, no per-
  // state surfaces — those are app concepts.
  if (gate.allow === false) {
    return (
      <>
        <Button variant="secondary" onClick={() => setGateOpen(true)}>
          save_for_offline
        </Button>
        <SaveGateModal open={gateOpen} onClose={() => setGateOpen(false)} gate={gate} />
      </>
    );
  }

  // Standalone — full per-state machine. Each branch derives its label and
  // onTap from `offlineState.status`. Modals are state-bound — only one can
  // be open at a time per branch, so the boolean-per-modal approach is clean
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
      // Title from the catalogue rather than props in case the modal stays
      // mounted after a navigation — the catalogue is the source of truth
      // either way (and gracefully falls back to the prop if this id
      // somehow isn't resolvable yet, e.g. a very recent upload this
      // device's catalogue fetch hasn't picked up).
      const titleForModal = getCatalogueSet(catalogueSets, set.id)?.artist ?? set.artist;
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
        const { quotaShortfallBytes } = offlineState;
        // Shortfall is only measurable when the pre-flight caught the
        // shortage; a quota hit during the IDB write has none — degrade
        // to a number-free label rather than "need 0 B more".
        const quotaLabel =
          quotaShortfallBytes !== undefined
            ? `✗ need ${fmtBytes(quotaShortfallBytes)} more`
            : "✗ not enough storage";
        return (
          <>
            <Button variant="fail" onClick={() => setQuotaOpen(true)}>
              {quotaLabel}
            </Button>
            <QuotaInfoModal
              open={quotaOpen}
              onClose={() => setQuotaOpen(false)}
              onRetry={triggerDownload}
              shortfallBytes={quotaShortfallBytes}
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
