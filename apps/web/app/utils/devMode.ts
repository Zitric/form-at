import { safeLocal } from "~/utils/safeStorage";

// Excludes THIS browser's own play beacons from the public plays count —
// for the operator testing the player, not a feature visitors ever see a
// control for. Default OFF, and the ONLY way to turn it on is visiting with
// `?devmode=on` in the URL — never a clickable control anywhere in the
// public UI. A discoverable toggle would itself be the risk this whole
// feature exists to avoid: anyone could flip it for themselves and silently
// stop their own real plays from counting, with no way to notice.
//
// localStorage via `safeLocal`, NOT the Zustand persist blob — see
// safeStorage.ts's header comment. This is a debug-only signal completely
// outside the app's normal state model; it has no business riding along
// with a future persist-migration version bump the way real player/UI state
// does. Deliberately localStorage rather than sessionStorage: the operator
// testing across a multi-day sprint would otherwise have to re-enable it in
// every new tab, which risks MORE inconsistency (some tabs excluded, some
// not), not less.
const DEV_MODE_KEY = "form-at-dev-mode";

export function isDevModeActive(): boolean {
  return safeLocal.get(DEV_MODE_KEY) === "1";
}

export function setDevMode(active: boolean): void {
  if (active) safeLocal.set(DEV_MODE_KEY, "1");
  else safeLocal.remove(DEV_MODE_KEY);
}
