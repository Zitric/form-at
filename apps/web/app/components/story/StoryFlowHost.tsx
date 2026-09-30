import { Modal } from "@form-at/ui";
import { Suspense, lazy } from "react";

import { useStore } from "~/store";

// Never flatten either of these into a static import. A static import still
// renders fine; the only symptom is a bigger main bundle, with no test
// failing. Same rule as apps/admin's TrendChart (CLAUDE.md §1).
//   - The picker pulls in the MP3 excerpt reader (and, next, the renderer,
//     spectrum and recorder), for a feature few visitors open.
//   - The gate reuses SaveGateModal and InstallInstructions, which otherwise
//     live in the set page's chunks. Imported statically from here, at the
//     root, they'd land in every visitor's main bundle (~7KB).
const StoryVideoFlow = lazy(() => import("~/components/story/StoryVideoFlow"));
const StoryInstallGate = lazy(() =>
  import("~/components/story/StoryInstallGate").then((m) => ({ default: m.StoryInstallGate })),
);

// Mounted once at the root, next to ShareModal. Renders nothing until a
// story flow is opened; each step's chunk is only fetched then, and never on
// the server.
export function StoryFlowHost() {
  const storyFlow = useStore((s) => s.storyFlow);
  const closeStoryFlow = useStore((s) => s.closeStoryFlow);
  if (!storyFlow) return null;

  if (storyFlow.step === "install-gate") {
    // No fallback: on a set page the gate's chunk is already loaded (the save
    // button shares it), so it appears at once; elsewhere, within a fetch.
    return (
      <Suspense fallback={null}>
        <StoryInstallGate onClose={closeStoryFlow} />
      </Suspense>
    );
  }

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
