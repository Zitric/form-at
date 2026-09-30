import type { MusicSet } from "@form-at/data/sets";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoryEntry } from "~/components/story/StoryEntry";
import type { SaveGate } from "~/hooks/useSaveGate";

// Every input StoryEntry decides on is a module read; each is stubbed here so
// a test sets exactly the situation it describes.
const env = {
  flag: true,
  handheld: true,
  canRecord: true,
  standalone: false,
  online: true,
  gate: { allow: false, reason: "cannot-install" } as SaveGate,
};
const trackEvent = vi.fn();
const openStoryFlow = vi.fn();

vi.mock("~/utils/storyFlag", () => ({ isStoryFlagActive: () => env.flag }));
vi.mock("~/utils/deviceFormFactor", () => ({ isHandheldTouch: () => env.handheld }));
vi.mock("~/utils/storyVideo/capability", () => ({ canRecordStory: () => env.canRecord }));
vi.mock("~/utils/installCapability", () => ({ isStandalone: () => env.standalone }));
vi.mock("~/hooks/useOnline", () => ({ useOnline: () => env.online }));
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
  Object.assign(env, {
    flag: true,
    handheld: true,
    canRecord: true,
    standalone: false,
    online: true,
    gate: { allow: false, reason: "needs-install", platform: "chromium", canPrompt: false },
  });
  vi.clearAllMocks();
});

describe("StoryEntry", () => {
  it("renders nothing without the flag, or off a phone", () => {
    env.flag = false;
    const { container, rerender } = renderEntry();
    expect(container).toBeEmptyDOMElement();
    env.flag = true;
    env.handheld = false;
    rerender(<StoryEntry set={set} rowClass="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is a muted line, not a button, where MP4 can't be recorded", () => {
    env.canRecord = false;
    renderEntry();
    expect(screen.getByText("instagram_story: not available in this browser")).toBeInTheDocument();
    expect(entryButton()).toBeNull();
  });

  it("in a tab, opens the install gate and logs it", async () => {
    renderEntry();
    await userEvent.click(entryButton() as HTMLElement);
    expect(trackEvent).toHaveBeenCalledWith("story_install_gate_shown", set.id);
    expect(openStoryFlow).toHaveBeenCalledWith(set, "install-gate");
  });

  // Before hydration the gate would render nothing, so a logged
  // story_install_gate_shown would count a gate nobody saw.
  it("ignores a tap while the gate is still pending", async () => {
    env.gate = { allow: false, reason: "pending" };
    renderEntry();
    await userEvent.click(entryButton() as HTMLElement);
    expect(trackEvent).not.toHaveBeenCalled();
    expect(openStoryFlow).not.toHaveBeenCalled();
  });

  it("in the installed app, opens the picker without logging a gate", async () => {
    env.standalone = true;
    env.gate = { allow: true };
    renderEntry();
    await userEvent.click(entryButton() as HTMLElement);
    expect(openStoryFlow).toHaveBeenCalledWith(set, "picker");
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("in the installed app offline, says it needs a connection", () => {
    env.standalone = true;
    env.online = false;
    renderEntry();
    expect(screen.getByText("instagram_story: needs a connection")).toBeInTheDocument();
    expect(entryButton()).toBeNull();
  });
});
