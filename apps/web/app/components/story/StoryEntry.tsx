import type { MusicSet } from "@form-at/data/sets";
import { BracketLabel } from "@form-at/ui";

import { useOnline } from "~/hooks/useOnline";
import { useSaveGate } from "~/hooks/useSaveGate";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";
import { isHandheldTouch } from "~/utils/deviceFormFactor";
import { isStandalone } from "~/utils/installCapability";
import { isStoryFlagActive } from "~/utils/storyFlag";
import { canRecordStory } from "~/utils/storyVideo/capability";

type Props = { set: MusicSet; rowClass: string };

/**
 * Whether the [ instagram_story ] row renders at all: the `?story=on` flag on
 * a phone. Past this, StoryEntry always renders something (a button or a
 * muted line), so the share modal shows its create_video: section on this.
 */
export function isStoryEntryShown(): boolean {
  return isStoryFlagActive() && isHandheldTouch();
}

// The [ instagram_story ] row in ShareModal's create_video: section. Nothing renders unless the
// `?story=on` flag is set AND this is a phone. Past that:
//   - can't record H.264 + AAC MP4 (Firefox) → a muted line, not a button
//   - the installed app, offline → a muted line: v1 is online-only
//   - a browser tab → the install gate: stories live in the installed app
//   - the installed app, online → the excerpt picker
// Both steps replace the share modal (StoryFlowHost renders them). Only ever
// rendered inside the open ShareModal, i.e. on the client after a tap, so
// reading window state during render can't mismatch hydration.
export function StoryEntry({ set, rowClass }: Props) {
  const online = useOnline();
  const gate = useSaveGate();
  const openStoryFlow = useStore((s) => s.openStoryFlow);
  const trackEvent = useTrackEvent();

  if (!isStoryEntryShown()) return null;

  const mutedClass = "text-left text-sm text-grey/40 tracking-widest py-1 cursor-default";
  if (!canRecordStory()) {
    return <div className={mutedClass}>instagram_story: not available in this browser</div>;
  }
  const standalone = isStandalone();
  if (standalone && !online) {
    return <div className={mutedClass}>instagram_story: needs a connection</div>;
  }

  const onTap = () => {
    if (standalone) {
      openStoryFlow(set, "picker");
      return;
    }
    // Before the store hydrates, the gate can't say which guidance applies,
    // and StoryInstallGate would render nothing. Ignore the tap rather than
    // log a gate nobody saw; hydration takes a frame, so a retap works.
    if (gate.allow === false && gate.reason === "pending") return;
    trackEvent("story_install_gate_shown", set.id);
    openStoryFlow(set, "install-gate");
  };

  return (
    <button type="button" onClick={onTap} className={rowClass}>
      <BracketLabel>instagram_story</BracketLabel>
    </button>
  );
}
