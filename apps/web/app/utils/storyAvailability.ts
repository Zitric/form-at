// Who sees the [ instagram_story ] entry, and what a tap does. Pure: every
// input is passed in, so the whole environment matrix is unit-testable.
// Imported by ShareModal on every page, so keep it light: nothing from
// utils/storyVideo/ beyond what StoryEntry already passes in.

import { isHandheldTouch } from "./deviceFormFactor";
import { detectPlatform } from "./installCapability";

/**
 * ROLLBACK SWITCH. true: Android phones get the entry without `?story=on`.
 * false: Android goes back behind the flag with everything else. iOS stays
 * behind the flag either way until it's tested on an iPhone (TECH_DEBT.md
 * item 30); the flag keeps working everywhere as a testing override.
 */
export const STORY_LAUNCHED_ON_ANDROID = true;

export interface StoryEnvironment {
  ua: string;
  /** `(pointer: coarse)` matches. */
  coarsePointer: boolean;
  /** The `?story=on` flag (storyFlag.ts). */
  flag: boolean;
  /** Running as the installed app. */
  standalone: boolean;
  online: boolean;
  /** This browser can record H.264 + AAC MP4 (capability.ts). */
  canRecord: boolean;
}

/**
 * - hidden: no entry, and no create_video: section.
 * - picker: the installed app, online — the excerpt picker.
 * - offline: the installed app, offline — a muted "needs a connection" line.
 * - gate: a browser tab — the install gate (install, open the app, or where
 *   to go instead).
 */
export type StoryEntryState = "hidden" | "picker" | "offline" | "gate";

export function storyEntryState(
  env: StoryEnvironment,
  launchedOnAndroid: boolean = STORY_LAUNCHED_ON_ANDROID,
): StoryEntryState {
  if (!isHandheldTouch(env.ua, () => ({ matches: env.coarsePointer }))) return "hidden";
  const released = launchedOnAndroid && /Android/.test(env.ua);
  if (!released && !env.flag) return "hidden";

  // The installed app records with this very browser: it decides.
  if (env.standalone) {
    if (!env.canRecord) return "hidden";
    return env.online ? "picker" : "offline";
  }
  // A tab that can install records later, in the app it installs, which runs
  // on this same engine (Chrome and Samsung Internet install WebAPKs of
  // themselves), so this tab's answer holds: no MP4 recording, no entry,
  // rather than an entry that fails at the end. A tab that can't install
  // (an in-app browser, Firefox) is sent to Chrome by the gate, and its own
  // engine says nothing about Chrome's, so the entry stays.
  if (detectPlatform(env.ua) === "other") return "gate";
  return env.canRecord ? "gate" : "hidden";
}
