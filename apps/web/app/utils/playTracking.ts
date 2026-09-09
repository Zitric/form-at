// Shared between the client (useAudioPlayer.ts's sendPlay) and the server
// (routes/api/signal.ts's validate()) so the two ceilings can't drift into
// two different answers for "how long is too long".
//
// Sized just above the longest real set (96 min / 5760s) rather than a
// round "safely more than anything" number — the previous value (4h) was
// exactly that kind of round number, and it let a real bug through: a
// wall-clock play timer with no relation to actual playback state produced
// a single 7945s (2h12m) segment on a 96-min set, well under the old 4h
// ceiling. See TECH_DEBT.md item 28a for the mechanism (a silently
// stalled/backgrounded tab whose flush doesn't fire until much later).
//
// The client applies this as a FALLBACK ceiling only — when the real
// per-track duration (playerSlice's `durations` cache) is already known,
// that's the tighter, correct cap; this constant is what still applies
// when it isn't, so "duration not cached yet" degrades to "generously
// capped", never to "uncapped". The server applies it as the only ceiling
// it has (it doesn't know per-track duration), and as a backstop against
// anything that reaches `/api/signal` without going through the client's
// own cap at all — a stale cached client mid-rollout, or a direct hit to
// the endpoint.
export const MAX_LISTENED_SECONDS = 2 * 60 * 60; // 2h
