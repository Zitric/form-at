import type { DJ } from "@form-at/data/djs";
import type { Event } from "@form-at/data/events";
import { Button } from "@form-at/ui";
import { type ComponentType, Suspense, lazy, useState } from "react";
import type { DjStorySheetProps } from "~/components/djStory/DjStorySheet";

// The sheet, and the canvas renderer only it imports, are their own lazy
// chunk: the DJ page's chunk never carries them (CLAUDE.md §1's lazy rule).
// A failed load (a deploy since the page loaded) shows nothing instead of
// reaching the root error boundary, as StoryFlowHost's does.
const SheetUnavailable = (_: DjStorySheetProps) => null;
const DjStorySheet = lazy<ComponentType<DjStorySheetProps>>(() =>
  import("~/components/djStory/DjStorySheet")
    .then((m) => ({ default: m.DjStorySheet }))
    .catch(() => ({ default: SheetUnavailable })),
);

// [ share_story ]: a Story image of the DJ and their next night, for
// everyone, browser tab or installed app (unlike the set Story video, it
// needs no recording). Copies the DJ page's link on the tap, while the
// gesture is fresh, for the Instagram link sticker. No toast: the sheet opens
// over it (a <dialog> in the top layer), and says so itself.
export function DjStoryButton({ dj, nextEvent }: { dj: DJ; nextEvent: Event | null }) {
  const [open, setOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleClick = async () => {
    setOpen(true);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/djs/${dj.id}`);
      setLinkCopied(true);
    } catch {
      // No clipboard: the sheet shows the link to add instead.
      setLinkCopied(false);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={handleClick}>
        share_story
      </Button>
      {open && (
        <Suspense fallback={null}>
          <DjStorySheet
            dj={dj}
            nextEvent={nextEvent}
            linkCopied={linkCopied}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
