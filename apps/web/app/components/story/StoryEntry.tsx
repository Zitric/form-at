import type { MusicSet } from "@form-at/data/sets";
import { BracketLabel } from "@form-at/ui";

import { useOnline } from "~/hooks/useOnline";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";
import { isHandheldTouch } from "~/utils/deviceFormFactor";
import { isStandalone } from "~/utils/installCapability";
import { isStoryFlagActive } from "~/utils/storyFlag";
import { canRecordStory } from "~/utils/storyVideo/capability";

type Props = { set: MusicSet; rowClass: string };

// The [ instagram_story ] row in ShareModal. Nothing renders unless the
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
  const openStoryFlow = useStore((s) => s.openStoryFlow);
  const trackEvent = useTrackEvent();

  if (!isStoryFlagActive() || !isHandheldTouch()) return null;

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
    trackEvent("story_install_gate_shown", set.id);
    openStoryFlow(set, "install-gate");
  };

  return (
    <button type="button" onClick={onTap} className={rowClass}>
      <BracketLabel>instagram_story</BracketLabel>
    </button>
  );
}
