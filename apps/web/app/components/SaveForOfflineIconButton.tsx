import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { InstallPromptModal } from "~/components/InstallPromptModal";
import { DownloadIcon, SavedIcon } from "~/components/icons";
import type { MusicSet } from "~/data/sets";
import { useInstallCapability } from "~/hooks/useInstallCapability";
import { useOfflineStateFor, useTriggerDownload } from "~/hooks/useOfflineDownload";
import { useStore } from "~/store";
import { cn } from "~/utils/cn";

// Compact save-for-offline indicator + action for set-list cards. Sibling
// of <ShareIconButton> + <CirclePlayButton> in the card's action slot.
//
// Behaviour rule (chunk-4 lock): actionable states act on the card,
// needs-context states navigate to detail (where the full state-machine
// surface — cancel modal, quota modal, manage modal — already lives).
// Mapping per offline state:
//   not-saved          → DownloadIcon, grey, tap = start download
//   downloading (this) → progress ring, gold, tap = navigate to detail
//   downloading (other)→ DownloadIcon, grey, tap = toast "one at a time"
//   saved              → SavedIcon, gold, tap = navigate to detail
//   failed/network     → DownloadIcon, red, tap = retry in-place
//   failed/aborted     → DownloadIcon, red, tap = retry in-place
//   failed/quota       → DownloadIcon, red, tap = navigate to detail
//   evicted            → DownloadIcon, grey, tap = re-download in-place
//   ≠ installed        → DownloadIcon, grey, tap = InstallPromptModal
//   unsupported        → hidden
//
// Install gate runs FIRST, before any per-state branch — same rule as
// SaveForOfflineButton (chunk 3c Q1: iOS WebKit's 7-day ITP eviction
// makes non-installed downloads unreliable, so we never bypass install).
//
// `e.stopPropagation()` on every tap handler — the parent <Card> has its
// own onClick that navigates to detail; the icon's actions must not also
// trigger that. (Saved + downloading-this + failed-quota DO navigate to
// detail, but via useNavigate so the destination is explicit; we don't
// want to rely on bubbling for that.)
type Props = { set: MusicSet };

const buttonBase =
  "flex items-center justify-center shrink-0 w-10 h-10 sm:w-14 sm:h-14 transition-all duration-300 cursor-pointer hover:scale-110";

export function SaveForOfflineIconButton({ set }: Props) {
  const navigate = useNavigate();
  const capability = useInstallCapability();
  const offlineState = useOfflineStateFor(set.id);
  const activeDownloadId = useStore((s) => s.activeDownloadId);
  const triggerDownload = useTriggerDownload(set.id);

  const [installOpen, setInstallOpen] = useState(false);

  if (capability === "unsupported") return null;

  const goToDetail = () => navigate({ to: "/sets/$setId", params: { setId: set.id } });

  // Pre-installed path: any tap opens InstallPromptModal. Identical to
  // SaveForOfflineButton's pre-installed branch.
  if (capability !== "installed") {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setInstallOpen(true);
          }}
          aria-label={`Save "${set.artist} — ${set.title}" for offline listening`}
          className={cn(buttonBase, "text-grey hover:text-gold")}
        >
          <DownloadIcon className="w-5 h-5" />
        </button>
        <InstallPromptModal open={installOpen} onClose={() => setInstallOpen(false)} />
      </>
    );
  }

  switch (offlineState.status) {
    case "not-saved":
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerDownload();
          }}
          aria-label={`Save "${set.artist} — ${set.title}" for offline listening`}
          className={cn(buttonBase, "text-grey hover:text-gold")}
        >
          <DownloadIcon className="w-5 h-5" />
        </button>
      );

    case "downloading": {
      const isThisSet = activeDownloadId === set.id;
      if (!isThisSet) {
        // Another set is downloading. Same icon as not-saved; tap fires the
        // toast via triggerDownload's ONE_DOWNLOAD_AT_A_TIME branch. No
        // visual dim — symmetric with SaveForOfflineButton on detail.
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerDownload();
            }}
            aria-label={`Save "${set.artist} — ${set.title}" — another download in progress`}
            className={cn(buttonBase, "text-grey hover:text-gold")}
          >
            <DownloadIcon className="w-5 h-5" />
          </button>
        );
      }
      const pct = Math.floor((offlineState.bytesDownloaded / offlineState.bytesTotal) * 100);
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goToDetail();
          }}
          aria-label={`Downloading "${set.artist} — ${set.title}", ${pct}% — tap for details`}
          className={cn(buttonBase, "text-gold")}
        >
          <ProgressRing pct={pct} />
        </button>
      );
    }

    case "saved":
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goToDetail();
          }}
          aria-label={`Saved offline — open details for "${set.artist} — ${set.title}"`}
          className={cn(buttonBase, "text-gold hover:text-white")}
        >
          <SavedIcon className="w-5 h-5" />
        </button>
      );

    case "failed":
      if (offlineState.reason === "quota") {
        // Quota needs the shortfall + QuotaInfoModal, both on detail.
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goToDetail();
            }}
            aria-label={`Save "${set.artist} — ${set.title}" failed — not enough storage, tap for details`}
            className={cn(buttonBase, "text-red-400 hover:text-red-300")}
          >
            <DownloadIcon className="w-5 h-5" />
          </button>
        );
      }
      // network / aborted — retry in-place. If another download is now
      // in flight, triggerDownload's sentinel toast handles it.
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerDownload();
          }}
          aria-label={`Retry saving "${set.artist} — ${set.title}" for offline listening`}
          className={cn(buttonBase, "text-red-400 hover:text-red-300")}
        >
          <DownloadIcon className="w-5 h-5" />
        </button>
      );

    case "evicted":
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerDownload();
          }}
          aria-label={`Re-save "${set.artist} — ${set.title}" for offline listening`}
          className={cn(buttonBase, "text-grey hover:text-gold")}
        >
          <DownloadIcon className="w-5 h-5" />
        </button>
      );
  }
}

// Inline SVG progress ring — circle circumference 2π·10 ≈ 62.83. No deps,
// no extra DOM weight beyond two <circle>s. Stroke uses `currentColor` so
// the parent button's text-gold cascades into it.
function ProgressRing({ pct }: { pct: number }) {
  const circumference = 2 * Math.PI * 10;
  const filled = (pct / 100) * circumference;
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}
