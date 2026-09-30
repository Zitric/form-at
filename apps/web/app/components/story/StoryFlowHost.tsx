import { Modal } from "@form-at/ui";
import { Suspense, lazy } from "react";

import { StoryInstallGate } from "~/components/story/StoryInstallGate";
import { useStore } from "~/store";

// Never flatten this into a static import. The picker pulls in the MP3
// excerpt reader and the spectrum (and, next, the renderer and recorder),
// which every visitor would otherwise download for a feature few of them
// open. A static import still renders fine; the only symptom is a bigger main
// bundle, with no test failing. Same rule as apps/admin's TrendChart
// (CLAUDE.md §1).
const StoryVideoFlow = lazy(() => import("~/components/story/StoryVideoFlow"));

// Mounted once at the root, next to ShareModal. Renders nothing until a
// story flow is opened; the picker's chunk is only fetched then, and never on
// the server. The install gate is small and shared with save_for_offline, so
// it isn't lazy.
export function StoryFlowHost() {
  const storyFlow = useStore((s) => s.storyFlow);
  const closeStoryFlow = useStore((s) => s.closeStoryFlow);
  if (!storyFlow) return null;

  if (storyFlow.step === "install-gate") return <StoryInstallGate onClose={closeStoryFlow} />;

  const loading = (
    <Modal
      open
      onClose={closeStoryFlow}
      ariaLabel="Loading the Instagram story picker"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">instagram_story</span>
        </div>
      }
    >
      <p className="text-sm text-grey tracking-widest">loading…</p>
    </Modal>
  );

  return (
    <Suspense fallback={loading}>
      <StoryVideoFlow set={storyFlow.set} onClose={closeStoryFlow} />
    </Suspense>
  );
}
