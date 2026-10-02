import type { MusicSet } from "@form-at/data/sets";
import { BracketLabel } from "@form-at/ui";

import { useOnline } from "~/hooks/useOnline";
import { useSaveGate } from "~/hooks/useSaveGate";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";
import { isStandalone } from "~/utils/installCapability";
import { type StoryEntryState, storyEntryState } from "~/utils/storyAvailability";
import { isStoryFlagActive } from "~/utils/storyFlag";
import { canRecordStory } from "~/utils/storyVideo/capability";

type Props = { set: MusicSet; rowClass: string };

/** This browser's StoryEntryState (utils/storyAvailability.ts). */
function currentStoryEntryState(online = true): StoryEntryState {
  return storyEntryState({
    ua: navigator.userAgent,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    flag: isStoryFlagActive(),
    standalone: isStandalone(),
    online,
    canRecord: canRecordStory(),
  });
}

/**
 * Whether the [ instagram_story ] row renders at all. Past this, StoryEntry
 * always renders something (a button or a muted line), so the share modal
 * shows its create_video: section on this.
 */
export function isStoryEntryShown(): boolean {
  return currentStoryEntryState() !== "hidden";
}

// The [ instagram_story ] row in ShareModal's create_video: section. Who sees
// it and what a tap does: storyEntryState. Both steps replace the share modal
// (StoryFlowHost renders them). Only ever rendered inside the open
// ShareModal, i.e. on the client after a tap, so reading window state during
// render can't mismatch hydration.
export function StoryEntry({ set, rowClass }: Props) {
  const online = useOnline();
  const gate = useSaveGate();
  const openStoryFlow = useStore((s) => s.openStoryFlow);
  const trackEvent = useTrackEvent();

  const state = currentStoryEntryState(online);
  if (state === "hidden") return null;
  if (state === "offline") {
    return (
      <div className="text-left text-sm text-grey/40 tracking-widest py-1 cursor-default">
        instagram_story: needs a connection
      </div>
    );
  }

  const onTap = () => {
    if (state === "picker") {
      trackEvent("story_create_tap", set.id);
      openStoryFlow(set, "picker");
      return;
    }
    // Before the store hydrates, the gate can't say which guidance applies,
    // and StoryInstallGate would render nothing. Ignore the tap rather than
    // log a tap and a gate nobody saw; hydration takes a frame, so a retap
    // works.
    if (gate.allow === false && gate.reason === "pending") return;
    trackEvent("story_create_tap", set.id);
    trackEvent("story_install_gate_shown", set.id);
    openStoryFlow(set, "install-gate");
  };

  return (
    <button type="button" onClick={onTap} className={rowClass}>
      <BracketLabel>instagram_story</BracketLabel>
    </button>
  );
}
