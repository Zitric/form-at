import type { MusicSet } from "@form-at/data/sets";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoryEntry } from "~/components/story/StoryEntry";
import type { SaveGate } from "~/hooks/useSaveGate";
import type { StoryEntryState } from "~/utils/storyAvailability";

// Who sees the entry is storyEntryState's job, tested over the whole
// environment matrix in storyAvailability.test.ts. Here it's stubbed, so each
// test sets the state it describes and checks what the row does with it.
const env = {
  state: "gate" as StoryEntryState,
  gate: {
    allow: false,
    reason: "needs-install",
    platform: "chromium",
    canPrompt: false,
  } as SaveGate,
};
const trackEvent = vi.fn();
const openStoryFlow = vi.fn();

vi.mock("~/utils/storyAvailability", () => ({ storyEntryState: () => env.state }));
vi.mock("~/utils/storyFlag", () => ({ isStoryFlagActive: () => false }));
vi.mock("~/utils/storyVideo/capability", () => ({ canRecordStory: () => true }));
vi.mock("~/utils/installCapability", () => ({ isStandalone: () => false }));
vi.mock("~/hooks/useOnline", () => ({ useOnline: () => true }));
vi.mock("~/hooks/useSaveGate", () => ({ useSaveGate: () => env.gate }));
vi.mock("~/hooks/useTrackEvent", () => ({ useTrackEvent: () => trackEvent }));
vi.mock("~/store", () => ({
  useStore: (selector: (s: { openStoryFlow: typeof openStoryFlow }) => unknown) =>
    selector({ openStoryFlow }),
}));

const set = { id: "set-003-unreal", title: "Form:at 003", artist: "Unreal" } as MusicSet;
const renderEntry = () => render(<StoryEntry set={set} rowClass="" />);
const entryButton = () => screen.queryByRole("button", { name: /instagram_story/ });

beforeEach(() => {
  env.state = "gate";
  env.gate = { allow: false, reason: "needs-install", platform: "chromium", canPrompt: false };
  vi.clearAllMocks();
});

describe("StoryEntry", () => {
  it("renders nothing when hidden", () => {
    env.state = "hidden";
    const { container } = renderEntry();
    expect(container).toBeEmptyDOMElement();
  });

  it("in a tab, logs the tap and the gate, then opens the install gate", async () => {
    renderEntry();
    await userEvent.click(entryButton() as HTMLElement);
    expect(trackEvent.mock.calls).toEqual([
      ["story_create_tap", set.id],
      ["story_install_gate_shown", set.id],
    ]);
    expect(openStoryFlow).toHaveBeenCalledWith(set, "install-gate");
  });

  // Before hydration the gate would render nothing, so logging would count a
  // tap and a gate nobody saw.
  it("ignores a tap while the gate is still pending, logging nothing", async () => {
    env.gate = { allow: false, reason: "pending" };
    renderEntry();
    await userEvent.click(entryButton() as HTMLElement);
    expect(trackEvent).not.toHaveBeenCalled();
    expect(openStoryFlow).not.toHaveBeenCalled();
  });

  it("in the installed app, logs the tap and opens the picker, with no gate", async () => {
    env.state = "picker";
    env.gate = { allow: true };
    renderEntry();
    await userEvent.click(entryButton() as HTMLElement);
    expect(trackEvent.mock.calls).toEqual([["story_create_tap", set.id]]);
    expect(openStoryFlow).toHaveBeenCalledWith(set, "picker");
  });

  it("in the installed app offline, says it needs a connection", () => {
    env.state = "offline";
    renderEntry();
    expect(screen.getByText("instagram_story: needs a connection")).toBeInTheDocument();
    expect(entryButton()).toBeNull();
  });
});
