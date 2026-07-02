import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SaveGateModal } from "~/components/SaveGateModal";
import { DownloadIcon, SavedIcon } from "~/components/icons";
import type { MusicSet } from "~/data/sets";
import { useOfflineStateFor, useTriggerDownload } from "~/hooks/useOfflineDownload";
import { useSaveGate } from "~/hooks/useSaveGate";
import { useStore } from "~/store";
import { cn } from "~/utils/cn";

// Compact save-for-offline indicator + action for set-list cards. Sibling
// of <ShareIconButton> + <CirclePlayButton> in the card's action slot.
//
// Gate semantics (locked 2026-06-30): identical to <SaveForOfflineButton> —
// per-state UI (saved tick, progress ring, quota red) renders ONLY when
// `allow: true` (running standalone). In a browser tab the icon always shows
// the plain grey download glyph; tap opens <SaveGateModal>, never starts a
// download. A tab user has no concept of "downloaded" or "evicted", so we
// don't show those states.
//
// Behaviour rule (chunk-4 lock, unchanged): actionable states act on the
// card, needs-context states navigate to detail (where the full state-
// machine surface — cancel modal, quota modal, manage modal — already lives).
//
// `e.stopPropagation()` on every tap handler — the parent <Card> has its
// own onClick that navigates to detail; the icon's actions must not also
// trigger that.
type Props = { set: MusicSet };

const buttonBase =
  "flex items-center justify-center shrink-0 w-10 h-10 sm:w-14 sm:h-14 transition-all duration-300 cursor-pointer hover:scale-110";

export function SaveForOfflineIconButton({ set }: Props) {
  const navigate = useNavigate();
  const gate = useSaveGate();
  const offlineState = useOfflineStateFor(set.id);
  const activeDownloadId = useStore((s) => s.activeDownloadId);
  const triggerDownload = useTriggerDownload(set.id);

  const [gateOpen, setGateOpen] = useState(false);

  // Pre-hydration: hide rather than flash an icon that will disappear.
  if (gate.allow === false && gate.reason === "pending") return null;

  const goToDetail = () => navigate({ to: "/sets/$setId", params: { setId: set.id } });

  // Tab / non-standalone: always show the plain download icon. Tap opens the
  // gate modal. No per-state branching — "saved", "downloading", etc. are
  // app-only concepts and showing them in a tab would be a lie.
  if (gate.allow === false) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setGateOpen(true);
          }}
          aria-label={`Save "${set.artist} — ${set.title}" for offline listening`}
          className={cn(buttonBase, "text-grey hover:text-gold")}
        >
          <DownloadIcon className="w-5 h-5" />
        </button>
        <SaveGateModal open={gateOpen} onClose={() => setGateOpen(false)} gate={gate} />
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
