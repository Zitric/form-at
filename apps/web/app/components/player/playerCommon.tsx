// Small primitives shared across the player surfaces (controls, mini, desktop).
// Lives here rather than in any single component to avoid coupling unrelated
// files just to share a 3-line helper.

import { PauseIcon } from "~/components/icons/PauseIcon";
import { PlayIcon } from "~/components/icons/PlayIcon";

// Resolves the glyph for a play/pause button. Loading takes priority because a
// press during load should read as "busy", not as "ready to play".
export function playToggleIcon({ loading, isPlaying }: { loading: boolean; isPlaying: boolean }) {
  if (loading) return <span className="animate-pulse opacity-60">…</span>;
  return isPlaying ? <PauseIcon /> : <PlayIcon />;
}

// Inline separator used in track-meta rows. Single source of truth so the dot
// styling doesn't drift between the mobile mini-player and the desktop layout.
export const metaSeparator = <span className="mx-2 text-grey/40">·</span>;
