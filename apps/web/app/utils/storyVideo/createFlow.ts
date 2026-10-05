// The create → record → share flow as a pure state machine, so its rules are
// testable without a browser: which transitions exist, and which analytics
// event each one emits. An action that doesn't apply to the current phase
// changes nothing and emits nothing; that is what makes every event fire at
// most once (a second tap on [ share ], a late `recorded` after [ cancel ]).

export type CreateState =
  | { phase: "picking" }
  | { phase: "recording"; progress: number }
  /** A file, and the browser says it can share it: [ share ]. */
  | { phase: "ready"; file: File }
  /** The share sheet is open. */
  | { phase: "sharing"; file: File }
  /** A file the browser won't share: [ download ] + instructions. */
  | { phase: "fallback"; file: File }
  | { phase: "failed"; message: string }
  /** A share target was picked; the flow closes. */
  | { phase: "done" };

export type CreateAction =
  | { type: "create" }
  | { type: "progress"; progress: number }
  | { type: "recorded"; file: File; canShare: boolean }
  | { type: "record-failed"; message: string }
  | { type: "cancel" }
  | { type: "share" }
  | { type: "share-resolved" }
  /** The visitor dismissed the share sheet. */
  | { type: "share-aborted" }
  | { type: "share-failed" }
  /** Back to the picker, from any screen after recording. */
  | { type: "back" };

export type CreateEvent = "story_video_created" | "story_video_shared";

export interface Transition {
  state: CreateState;
  events: CreateEvent[];
}

const stay = (state: CreateState): Transition => ({ state, events: [] });

export function transition(state: CreateState, action: CreateAction): Transition {
  switch (state.phase) {
    case "picking":
      return action.type === "create" ? stay({ phase: "recording", progress: 0 }) : stay(state);
    case "recording":
      if (action.type === "progress")
        return stay({ phase: "recording", progress: action.progress });
      if (action.type === "recorded") {
        const next: CreateState = action.canShare
          ? { phase: "ready", file: action.file }
          : { phase: "fallback", file: action.file };
        return { state: next, events: ["story_video_created"] };
      }
      if (action.type === "record-failed")
        return stay({ phase: "failed", message: action.message });
      if (action.type === "cancel") return stay({ phase: "picking" });
      return stay(state);
    case "ready":
      if (action.type === "share") return stay({ phase: "sharing", file: state.file });
      if (action.type === "back") return stay({ phase: "picking" });
      return stay(state);
    case "sharing":
      if (action.type === "share-resolved")
        return { state: { phase: "done" }, events: ["story_video_shared"] };
      if (action.type === "share-aborted") return stay({ phase: "ready", file: state.file });
      if (action.type === "share-failed") return stay({ phase: "fallback", file: state.file });
      return stay(state);
    case "fallback":
    case "failed":
      return action.type === "back" ? stay({ phase: "picking" }) : stay(state);
    case "done":
      return stay(state);
  }
}

/** formatglasgow-<set-id>-<mm>-<ss>.mp4, minutes unbounded as in fmtTimestamp. */
/**
 * The link the visitor copies for Instagram's link sticker: the set at the
 * excerpt's start, marked `ref=story` so the set page can count the visits
 * stories bring (story_link_open) and then drop the marker from the address
 * bar, so a link copied from there doesn't carry it on.
 */
export function storyLinkUrl(origin: string, setId: string, startSeconds: number): string {
  return `${origin}/sets/${setId}?t=${Math.floor(startSeconds)}&ref=story`;
}

export function storyFileName(setId: string, startSeconds: number): string {
  const whole = Math.floor(startSeconds);
  return `formatglasgow-${setId}-${Math.floor(whole / 60)}-${String(whole % 60).padStart(2, "0")}.mp4`;
}

/** What to tell the visitor when recording stopped, by the recorder's failure reason. */
export function recordingFailureMessage(failure: string): string {
  if (failure === "hidden") {
    return "recording stopped — the screen locked or you left the app, so nothing was saved. keep the screen on and try again.";
  }
  if (failure === "unsupported") return "this browser can't record the video.";
  return "recording failed — nothing was saved. try again.";
}
