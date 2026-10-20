import { type ComponentType, Suspense, lazy } from "react";
import type { DjStorySheetProps } from "~/components/djStory/DjStorySheet";
import { useStore } from "~/store";

// The sheet, and the canvas renderer only it imports, are their own lazy
// chunk: this host is mounted at the root, so a static import would put them
// in every visitor's main bundle (CLAUDE.md §1's lazy rule). A failed load (a
// deploy since the page loaded) shows nothing instead of reaching the root
// error boundary, as StoryFlowHost's does.
const SheetUnavailable = (_: DjStorySheetProps) => null;
const DjStorySheet = lazy<ComponentType<DjStorySheetProps>>(() =>
  import("~/components/djStory/DjStorySheet")
    .then((m) => ({ default: m.DjStorySheet }))
    .catch(() => ({ default: SheetUnavailable })),
);

// Mounted once at the root, next to StoryFlowHost. Renders nothing until the
// share modal's [ instagram_story ] row on a DJ page opens the DJ Story sheet
// (openDjStory), for everyone, browser tab or installed app: a still needs
// no recording.
export function DjStoryHost() {
  const djStory = useStore((s) => s.djStory);
  const closeDjStory = useStore((s) => s.closeDjStory);
  if (!djStory) return null;

  return (
    <Suspense fallback={null}>
      <DjStorySheet
        dj={djStory.dj}
        nextEvent={djStory.nextEvent}
        linkCopied={djStory.linkCopied}
        onClose={closeDjStory}
      />
    </Suspense>
  );
}
