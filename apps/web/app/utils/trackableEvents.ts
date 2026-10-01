// Explicit allowlist of `event_type` values the tracking endpoint accepts.
// Shared between the client hook
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
  // Push opt-in soft prompt — mirrors the install_* naming.
  // `notify_prompt_shown` / `notify_install_nudge_shown`
  // are the two modal variants becoming visible (standalone subscribe prompt
  // vs browser-tab install nudge); `notify_accepted` is accepting OUR soft
  // prompt (fires before the native permission ask — grant rate is inferable
  // by comparing against the push_subscriptions table); `notify_declined` is
  // closing either variant without accepting/engaging.
  "notify_prompt_shown",
  "notify_accepted",
  "notify_declined",
  "notify_install_nudge_shown",
  // AddToCalendarButton — one type for all three destinations
  // (google/outlook/.ics), same
  // minimal-cardinality precedent as save_click/share_click not
  // differentiating method. Deliberately carries no set_id/event_id: `events`
  // has no generic entity-id column (set_id is validated against getSet() in
  // routes/api/event.ts, sets-only), and this button only ever appears in the
  // context of one event per page load — adding an id column is a separate,
  // not-yet-needed schema decision.
  "calendar_add_click",
  // Instagram Story video, both with the set's id.
  // `story_video_created` is a finished recording, a File in hand.
  // `story_video_shared` means `navigator.share` resolved, i.e. the visitor
  // picked a share target. It does NOT mean the story was published: nothing
  // reports back from Instagram, and the visitor can still back out of its
  // composer. Deliberately separate types rather than a method on
  // share_click, which stays one undifferentiated count.
  "story_video_created",
  "story_video_shared",
  // The install gate shown to a mobile tab user who tapped
  // [ instagram_story ]: stories need the installed app. Paired with
  // install_accepted over the same window, it says whether stories drive
  // installs; the two rows aren't linkable, so it's a rate, not a per-visitor
  // conversion.
  "story_install_gate_shown",
  // The home page's [ install_app ] opened its instructions modal: a browser
  // tab with no native prompt to fire (iOS share-menu steps, the manual hint,
  // open-app, or where to install instead). A tap that fires Chrome's prompt
  // directly isn't this; that funnel is install_prompt_shown →
  // install_accepted / install_dismissed.
  "install_cta_instructions_shown",
] as const;

export type TrackableEventType = (typeof TRACKABLE_EVENT_TYPES)[number];

export function isTrackableEventType(value: string): value is TrackableEventType {
  return (TRACKABLE_EVENT_TYPES as readonly string[]).includes(value);
}
