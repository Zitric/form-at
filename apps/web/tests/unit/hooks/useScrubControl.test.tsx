import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist the mutable shared state so vi.mock's factory can close over it
// (vi.mock is hoisted to the top of the file by the Vitest transform, so any
// values it captures must be declared via vi.hoisted to survive that lift).
const { storeState, togglePlayMock } = vi.hoisted(() => ({
  storeState: { isPlaying: false },
  togglePlayMock: vi.fn(),
}));

vi.mock("~/store", () => ({
  useStore: (selector: (s: { isPlaying: boolean; togglePlay: () => void }) => unknown) =>
    selector({ isPlaying: storeState.isPlaying, togglePlay: togglePlayMock }),
}));

// Imported after the mock so the hook sees the stubbed store, not the real one.
const { useScrubControl } = await import("~/hooks/useScrubControl");

beforeEach(() => {
  storeState.isPlaying = false;
  togglePlayMock.mockReset();
});

describe("useScrubControl", () => {
  it("accepts the drag when not disabled and duration > 0", () => {
    const { result } = renderHook(() => useScrubControl(false, 100));
    let accepted: boolean | undefined;
    act(() => {
      accepted = result.current.acceptIfReady();
    });
    expect(accepted).toBe(true);
    expect(result.current.isAccepted()).toBe(true);
  });

  it("rejects when disabled, even with valid duration", () => {
    const { result } = renderHook(() => useScrubControl(true, 100));
    act(() => {
      result.current.acceptIfReady();
    });
    expect(result.current.isAccepted()).toBe(false);
  });

  it("rejects when duration is zero", () => {
    const { result } = renderHook(() => useScrubControl(false, 0));
    act(() => {
      result.current.acceptIfReady();
    });
    expect(result.current.isAccepted()).toBe(false);
  });

  it("pauses playback once movement crosses the 4px threshold", () => {
    storeState.isPlaying = true;
    const { result } = renderHook(() => useScrubControl(false, 100));

    act(() => {
      result.current.maybePauseOnMove(3);
    });
    expect(togglePlayMock).not.toHaveBeenCalled();

    act(() => {
      result.current.maybePauseOnMove(5);
      result.current.maybePauseOnMove(50);
    });
    expect(togglePlayMock).toHaveBeenCalledTimes(1);
  });

  it("does not pause if audio was not playing when the drag started", () => {
    storeState.isPlaying = false;
    const { result } = renderHook(() => useScrubControl(false, 100));

    act(() => {
      result.current.maybePauseOnMove(100);
    });
    expect(togglePlayMock).not.toHaveBeenCalled();
  });

  it("resumes on endScrub iff we paused for this scrub", () => {
    storeState.isPlaying = true;
    const { result } = renderHook(() => useScrubControl(false, 100));

    act(() => {
      result.current.acceptIfReady();
      result.current.maybePauseOnMove(50);
      result.current.endScrub();
    });
    expect(togglePlayMock).toHaveBeenCalledTimes(2);
    expect(result.current.isAccepted()).toBe(false);
  });

  it("does not toggle on endScrub if no pause happened (tap, not drag)", () => {
    storeState.isPlaying = true;
    const { result } = renderHook(() => useScrubControl(false, 100));

    act(() => {
      result.current.acceptIfReady();
      result.current.endScrub();
    });
    expect(togglePlayMock).not.toHaveBeenCalled();
  });
});
