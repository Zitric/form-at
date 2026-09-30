import { safeLocal } from "~/utils/safeStorage";

// Rollout gate for the Instagram Story feature while it's built and
// device-tested. Off by default; the only way on is visiting any page with
// `?story=on` (and `?story=off` to clear it), never a visible control — the
// same pattern as devMode.ts, deliberately a separate key: devmode also
// stops this browser's plays from counting, which has nothing to do with
// seeing an unreleased feature.
const STORY_FLAG_KEY = "form-at-story";

export function isStoryFlagActive(): boolean {
  return safeLocal.get(STORY_FLAG_KEY) === "1";
}

/** Applies `?story=on|off` from the current URL, if present. */
export function applyStoryFlagFromUrl(search = window.location.search): void {
  const requested = new URLSearchParams(search).get("story");
  if (requested === "on") safeLocal.set(STORY_FLAG_KEY, "1");
  else if (requested === "off") safeLocal.remove(STORY_FLAG_KEY);
}
