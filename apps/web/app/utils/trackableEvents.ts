// Explicit allowlist of `event_type` values the tracking endpoint accepts
// (Phase "Analytics 1", 2026-07-08). Shared between the client hook
// (`useTrackEvent`) and the server validation (`routes/api/event.ts`) so the
// two can never drift — add a new event type here FIRST, then wire up its
// call site.
//
// This allowlist IS the guard against `events` quietly becoming a dumping
// ground for arbitrary strings: `routes/api/event.ts` rejects (still 204,
// no INSERT) anything not listed here. Reject, don't sanitize — an unknown
// event_type usually means a client/server drift bug, not a value worth
// coercing into something else.
export const TRACKABLE_EVENT_TYPES = [
  "install_prompt_shown",
  "install_accepted",
  "install_dismissed",
  "app_launch",
  "save_click",
  "share_click",
] as const;

export type TrackableEventType = (typeof TRACKABLE_EVENT_TYPES)[number];

export function isTrackableEventType(value: string): value is TrackableEventType {
  return (TRACKABLE_EVENT_TYPES as readonly string[]).includes(value);
}
