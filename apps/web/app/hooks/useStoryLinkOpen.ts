import { useEffect, useRef } from "react";
import { useTrackEvent } from "~/hooks/useTrackEvent";

/**
 * Counts an arrival from a story's link sticker (`?ref=story`, see
 * storyLinkUrl): one story_link_open with the set's id, then `clearRef`
 * drops `ref` from the address bar, so a reload doesn't count again and a
 * link copied from the page doesn't carry the marker on. Once per set per
 * mount; anonymous like every event (no id beyond the set's).
 */
export function useStoryLinkOpen(
  setId: string,
  ref: string | undefined,
  clearRef: () => void,
): void {
  const trackEvent = useTrackEvent();
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (ref !== "story" || counted.current === setId) return;
    counted.current = setId;
    trackEvent("story_link_open", setId);
    clearRef();
  }, [ref, setId, trackEvent, clearRef]);
}
