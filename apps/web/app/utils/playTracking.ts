import { parseDuration } from "./fmt";

// Shared between the client (useAudioPlayer.ts's sendPlay) and the server
// (routes/api/signal.ts's validate()) as the FALLBACK ceiling for when a
// track's own duration isn't known — see `maxListenedSecondsForDuration`
// below for the real, per-track ceiling the server applies whenever it can
// resolve one.
//
// This used to be the ONLY ceiling, sized just above the longest set in the
// catalogue at the time (96 min). That was the same mistake twice: a fixed
// number chosen against "today's catalogue" breaks the moment a longer real
// set ships. It broke once already — a wall-clock play timer with no
// relation to actual playback state produced a single 7945s (2h12m) segment
// on that 96-min set, past the ceiling then in place (4h, tightened to 2h in
// response — see TECH_DEBT.md item 28a for the stalled/backgrounded-tab
// mechanism) — and it broke again when Form:at 003's Unreal set (141 min /
// 8451s) shipped: every uninterrupted full listen of it exceeded the 2h
// ceiling and was silently discarded, 204 regardless, nothing inserted.
//
// The fix is that the server's real ceiling (below) is now derived from the
// reported set's own duration, so it survives any future set without
// needing to be revisited. This constant only matters when that lookup
// fails entirely — no D1 binding and no snapshot entry, or a
// missing/malformed duration string. That's rare, and generous is the safer
// direction to fail in: rejecting a real listen is a silent, unrecoverable
// loss (this file's whole history above), while over-accepting a bad row
// for a few extra hours costs one garbage row. Same reasoning the client
// applies when the real per-track duration (playerSlice's `durations`
// cache) isn't cached yet: this is what still applies then, so "duration
// not cached yet" degrades to "generously capped", never "uncapped".
export const MAX_LISTENED_SECONDS = 4 * 60 * 60; // 4h — fallback only

// Added on top of a resolved real duration before rejecting a listen as
// garbage — covers Math.floor/rounding drift and a couple of seconds of
// pre-roll counted before playback truly starts. Not meant to forgive a
// timer that's structurally wrong; MAX_LISTENED_SECONDS above still exists
// to catch that when duration can't be resolved at all.
const DURATION_GRACE_SECONDS = 60;

// The real ceiling `routes/api/signal.ts` applies: the reported set's own
// duration (parsed from its stored `MusicSet.duration` string) plus a small
// grace margin, falling back to MAX_LISTENED_SECONDS only when that string
// is missing, malformed, or the caller couldn't resolve one at all (pass
// undefined). Anything above this ceiling, once a real duration IS known,
// can only be garbage or a bug — a legitimate client already caps at the
// track's own duration (see sendPlay in useAudioPlayer.ts), so rejecting
// past it here is safe again in a way rejecting past a flat global number
// never was.
export function maxListenedSecondsForDuration(duration: string | undefined): number {
  if (!duration) return MAX_LISTENED_SECONDS;
  const parsed = parseDuration(duration);
  return parsed === undefined ? MAX_LISTENED_SECONDS : parsed + DURATION_GRACE_SECONDS;
}
