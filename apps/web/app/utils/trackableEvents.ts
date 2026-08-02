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
  // Push opt-in soft prompt (feat/push-optin-modal, 2026-07-16) — mirrors
  // the install_* naming. `notify_prompt_shown` / `notify_install_nudge_shown`
  // are the two modal variants becoming visible (standalone subscribe prompt
  // vs browser-tab install nudge); `notify_accepted` is accepting OUR soft
  // prompt (fires before the native permission ask — grant rate is inferable
  // by comparing against the push_subscriptions table); `notify_declined` is
  // closing either variant without accepting/engaging.
  "notify_prompt_shown",
  "notify_accepted",
  "notify_declined",
  "notify_install_nudge_shown",
  // AddToCalendarButton (feat/calendar-tracking-and-dashboard, 2026-08-02) —
  // one type for all three destinations (google/outlook/.ics), same
  // minimal-cardinality precedent as save_click/share_click not
  // differentiating method. Deliberately carries no set_id/event_id: `events`
  // has no generic entity-id column (set_id is validated against getSet() in
  // routes/api/event.ts, sets-only), and this button only ever appears in the
  // context of one event per page load — adding an id column is a separate,
  // not-yet-needed schema decision.
  "calendar_add_click",
] as const;

export type TrackableEventType = (typeof TRACKABLE_EVENT_TYPES)[number];

export function isTrackableEventType(value: string): value is TrackableEventType {
  return (TRACKABLE_EVENT_TYPES as readonly string[]).includes(value);
}
