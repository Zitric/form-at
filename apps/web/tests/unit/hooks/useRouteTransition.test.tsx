import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRouteTransition } from "~/hooks/useRouteTransition";

// Regression lock for the black-screen failure: a second navigation inside
// the 500ms fade window clears the pending timer, and — if previousPathRef is
// only updated INSIDE that timer — the effect's
// re-run saw "same path", scheduled nothing, and isVisible stayed false
// forever (content at opacity-0 under visible chrome).

const pathHolder = { pathname: "/sets" };
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ location: { pathname: pathHolder.pathname } }),
}));

afterEach(() => {
  vi.useRealTimers();
  pathHolder.pathname = "/sets";
});

describe("useRouteTransition", () => {
  it("fades out then back in on a single navigation", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(() => useRouteTransition());
    expect(result.current).toBe(true);

    pathHolder.pathname = "/sets/002";
    act(() => rerender());
    expect(result.current).toBe(false);

    act(() => vi.advanceTimersByTime(600));
    expect(result.current).toBe(true);
  });

  it("recovers visibility when a second navigation lands within the fade window", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(() => useRouteTransition());

    pathHolder.pathname = "/sets/002";
    act(() => rerender());
    act(() => vi.advanceTimersByTime(100));

    // The open_set_details double-navigation shape: bounced back to /sets
    // 100ms later, well inside the 500ms window.
    pathHolder.pathname = "/sets";
    act(() => rerender());
    act(() => vi.advanceTimersByTime(600));

    expect(result.current).toBe(true);
  });
});
