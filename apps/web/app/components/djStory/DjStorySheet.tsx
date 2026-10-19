import type { DJ } from "@form-at/data/djs";
import type { Event } from "@form-at/data/events";
import { BracketLabel, Button, Modal } from "@form-at/ui";
import { useEffect, useRef, useState } from "react";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import {
  DEFAULT_TREATMENT,
  type DjStoryAssets,
  type PhotoTreatment,
  TREATMENTS,
  TREATMENT_IDS,
  canvasToJpeg,
  drawDjStory,
  loadDjStoryAssets,
  storyFileName,
  storyLine,
} from "~/utils/djStory/renderDjStory";
import { FRAME } from "~/utils/storyVideo/layout";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface DjStorySheetProps {
  dj: DJ;
  nextEvent: Event | null;
  /** Whether DjStoryButton got the page link onto the clipboard. */
  linkCopied: boolean;
  onClose: () => void;
}

// The DJ Story sheet: a preview, the photo treatments, and [ share ]. The
// image is rendered before the share tap, so the tap calls navigator.share
// straight away: rendering after it could outlast the browser's
// user-activation window, and the share would then be refused.
//
// The preview is the frame itself, drawn into an on-page canvas, not an <img>
// of the file: the CSP's img-src doesn't allow blob: URLs.
export function DjStorySheet({ dj, nextEvent, linkCopied, onClose }: DjStorySheetProps) {
  const trackEvent = useTrackEvent();
  const [assets, setAssets] = useState<DjStoryAssets | null>(null);
  const [treatment, setTreatment] = useState<PhotoTreatment>(DEFAULT_TREATMENT);
  const [image, setImage] = useState<Blob | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("dj_story_open");
  }, [trackEvent]);

  useEffect(() => {
    let cancelled = false;
    loadDjStoryAssets(dj.photo).then((a) => {
      if (!cancelled) setAssets(a);
    });
    return () => {
      cancelled = true;
    };
  }, [dj.photo]);

  const line = storyLine(dj.type, nextEvent);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!assets || !canvas) return;
    let cancelled = false;
    setImage(null);
    drawDjStory(canvas, { name: dj.name, line, assets, treatment });
    canvasToJpeg(canvas).then((blob) => {
      if (!cancelled) setImage(blob);
    });
    return () => {
      cancelled = true;
    };
  }, [assets, treatment, dj.name, line]);

  const fileName = storyFileName(dj.id);
  const file = image ? new File([image], fileName, { type: "image/jpeg" }) : null;
  const canShareFile =
    file !== null &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  const handleShare = async () => {
    if (!file || !image) return;
    if (canShareFile) {
      try {
        await navigator.share({ files: [file] });
        trackEvent("dj_story_shared");
        onClose();
        return;
      } catch (e) {
        // Cancelled in the share sheet: stay, so another treatment can be tried.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    download(image, fileName);
    trackEvent("dj_story_downloaded");
    onClose();
  };

  const linkHint = linkCopied
    ? "link copied: add it in Instagram as a link sticker"
    : `add formatglasgow.com/djs/${dj.id} in Instagram as a link sticker`;

  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="Share a Story image"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">share_story</span>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <canvas
          ref={canvasRef}
          width={FRAME.width}
          height={FRAME.height}
          role="img"
          aria-label={`${dj.name}, Story preview`}
          className="h-[50vh] aspect-[9/16] border border-grey/20 bg-black"
        />
        {/* Each chip is one button and BracketLabel is nowrap, so the row
            wraps between chips, never inside a bracket. */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-grey tracking-widest">
          {TREATMENT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTreatment(id)}
              aria-pressed={treatment === id}
              className="cursor-pointer hover:text-white transition-colors"
            >
              {treatment === id ? (
                <BracketLabel>{TREATMENTS[id].label}</BracketLabel>
              ) : (
                TREATMENTS[id].label
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-grey/70 text-center">{linkHint}</p>
        <Button variant="secondary" onClick={handleShare} disabled={!image}>
          {canShareFile ? "share" : "download"}
        </Button>
      </div>
    </Modal>
  );
}
