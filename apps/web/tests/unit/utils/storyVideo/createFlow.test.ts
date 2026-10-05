import { describe, expect, it } from "vitest";
import {
  type CreateAction,
  type CreateEvent,
  type CreateState,
  recordingFailureMessage,
  storyFileName,
  storyLinkUrl,
  transition,
} from "~/utils/storyVideo/createFlow";

const file = new File([new Uint8Array(8)], "story.mp4", { type: "video/mp4" });

/** Runs actions from `start`, collecting every event emitted on the way. */
function run(start: CreateState, ...actions: CreateAction[]) {
  const events: CreateEvent[] = [];
  let state = start;
  for (const action of actions) {
    const next = transition(state, action);
    state = next.state;
    events.push(...next.events);
  }
  return { state, events };
}

const picking: CreateState = { phase: "picking" };

describe("create flow", () => {
  it("records, shares, and emits created then shared, once each", () => {
    const { state, events } = run(
      picking,
      { type: "create" },
      { type: "progress", progress: 0.5 },
      { type: "recorded", file, canShare: true },
      { type: "share" },
      { type: "share-resolved" },
    );
    expect(state).toEqual({ phase: "done" });
    expect(events).toEqual(["story_video_created", "story_video_shared"]);
  });

  it("goes to the download fallback when the file can't be shared, still emitting created", () => {
    const { state, events } = run(
      picking,
      { type: "create" },
      { type: "recorded", file, canShare: false },
    );
    expect(state).toEqual({ phase: "fallback", file });
    expect(events).toEqual(["story_video_created"]);
  });

  it("stays on the share screen, with no event, when the sheet is dismissed", () => {
    const { state, events } = run(
      picking,
      { type: "create" },
      { type: "recorded", file, canShare: true },
      { type: "share" },
      { type: "share-aborted" },
    );
    expect(state).toEqual({ phase: "ready", file });
    expect(events).toEqual(["story_video_created"]);
  });

  it("falls back to download when sharing fails for any other reason", () => {
    const { state, events } = run(
      picking,
      { type: "create" },
      { type: "recorded", file, canShare: true },
      { type: "share" },
      { type: "share-failed" },
    );
    expect(state).toEqual({ phase: "fallback", file });
    expect(events).toEqual(["story_video_created"]);
  });

  it("cancels back to the picker, and ignores a recording that finishes afterwards", () => {
    const { state, events } = run(
      picking,
      { type: "create" },
      { type: "cancel" },
      { type: "recorded", file, canShare: true },
    );
    expect(state).toEqual(picking);
    expect(events).toEqual([]);
  });

  it("shows a failure without emitting anything", () => {
    const { state, events } = run(
      picking,
      { type: "create" },
      { type: "record-failed", message: "x" },
    );
    expect(state).toEqual({ phase: "failed", message: "x" });
    expect(events).toEqual([]);
  });

  it("can't emit shared twice: a second share or resolve is ignored", () => {
    const { events } = run(
      picking,
      { type: "create" },
      { type: "recorded", file, canShare: true },
      { type: "share" },
      { type: "share" },
      { type: "share-resolved" },
      { type: "share-resolved" },
    );
    expect(events).toEqual(["story_video_created", "story_video_shared"]);
  });

  it("can't emit created twice: a second recorded is ignored", () => {
    const { events } = run(
      picking,
      { type: "create" },
      { type: "recorded", file, canShare: true },
      { type: "recorded", file, canShare: true },
    );
    expect(events).toEqual(["story_video_created"]);
  });

  it("returns to the picker from the share, fallback and failure screens", () => {
    for (const from of [
      { phase: "ready", file },
      { phase: "fallback", file },
      { phase: "failed", message: "x" },
    ] as CreateState[]) {
      expect(transition(from, { type: "back" }).state).toEqual(picking);
    }
  });

  it("ignores a create that isn't from the picker", () => {
    expect(transition({ phase: "recording", progress: 0.3 }, { type: "create" }).state).toEqual({
      phase: "recording",
      progress: 0.3,
    });
  });
});

describe("storyFileName", () => {
  it("names the file after the set and the start, minutes unbounded", () => {
    expect(storyFileName("set-003-unreal", 2817)).toBe("formatglasgow-set-003-unreal-46-57.mp4");
    expect(storyFileName("set-003-unreal", 8431)).toBe("formatglasgow-set-003-unreal-140-31.mp4");
    expect(storyFileName("x", 5.9)).toBe("formatglasgow-x-0-05.mp4");
  });
});

describe("recordingFailureMessage", () => {
  it("explains a hidden-page abort and that nothing was saved", () => {
    expect(recordingFailureMessage("hidden")).toMatch(
      /screen locked or you left the app.*nothing was saved/,
    );
  });
});

describe("storyLinkUrl", () => {
  it("links the set at the excerpt's whole-second start, marked ref=story", () => {
    expect(storyLinkUrl("https://formatglasgow.com", "set-003-unreal", 1800.7)).toBe(
      "https://formatglasgow.com/sets/set-003-unreal?t=1800&ref=story",
    );
  });
});
