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
//
// The picker's chunk is deliberately not precached (vite.config.ts), so its
// load can fail: a dropped connection, or a deploy while the app was open
// (Pages serves only the latest build's chunks). Without the catch, that
// rejection reaches the root error boundary and takes the page down.
const StoryVideoFlow = lazy(() =>
  import("~/components/story/StoryVideoFlow").catch(() => ({ default: PickerUnavailable })),
);
const StoryInstallGate = lazy(() =>
  import("~/components/story/StoryInstallGate").then((m) => ({ default: m.StoryInstallGate })),
);

const pickerTitle = (
  <div className="text-xs text-grey tracking-widest truncate">
    › <span className="text-white">instagram_story</span>
  </div>
);

// React.lazy keeps whatever the import resolved to for the session, so a
// retry needs a fresh start of the app, and the copy says so.
function PickerUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel="The Instagram story picker couldn't load"
      title={pickerTitle}
    >
      <p className="text-sm text-grey tracking-widest leading-relaxed">
        couldn't load the story picker. check your connection, then close the app and open it again.
      </p>
    </Modal>
  );
}

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
      title={pickerTitle}
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
