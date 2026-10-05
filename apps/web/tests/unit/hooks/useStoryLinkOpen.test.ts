import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStoryLinkOpen } from "~/hooks/useStoryLinkOpen";

const trackEvent = vi.fn();
vi.mock("~/hooks/useTrackEvent", () => ({ useTrackEvent: () => trackEvent }));

beforeEach(() => {
  trackEvent.mockClear();
});

describe("useStoryLinkOpen", () => {
  it("counts an arrival from a story link once, then clears ref", () => {
    const clearRef = vi.fn();
    const { rerender } = renderHook(
      ({ ref }) => useStoryLinkOpen("set-003-unreal", ref, clearRef),
      { initialProps: { ref: "story" as string | undefined } },
    );
    expect(trackEvent.mock.calls).toEqual([["story_link_open", "set-003-unreal"]]);
    expect(clearRef).toHaveBeenCalledTimes(1);

    // The re-render after clearing, and any later one, sends nothing more.
    rerender({ ref: undefined });
    rerender({ ref: "story" });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("does nothing without ref=story", () => {
    const clearRef = vi.fn();
    renderHook(() => useStoryLinkOpen("set-003-unreal", undefined, clearRef));
    renderHook(() => useStoryLinkOpen("set-003-unreal", "instagram", clearRef));
    expect(trackEvent).not.toHaveBeenCalled();
    expect(clearRef).not.toHaveBeenCalled();
  });

  it("counts again for a different set in the same page", () => {
    const { rerender } = renderHook(({ id }) => useStoryLinkOpen(id, "story", () => {}), {
      initialProps: { id: "set-003-unreal" },
    });
    rerender({ id: "set-002-til" });
    expect(trackEvent.mock.calls).toEqual([
      ["story_link_open", "set-003-unreal"],
      ["story_link_open", "set-002-til"],
    ]);
  });
});
