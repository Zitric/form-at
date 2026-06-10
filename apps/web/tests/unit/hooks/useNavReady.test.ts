import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("useNavReady", () => {
  beforeEach(() => {
    // Reset the module so the singleton timer state (`started`, `navReady`)
    // starts fresh each test. Without this the second test sees `navReady`
    // already true from the first.
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips to true after the 800ms navbar-fade window", async () => {
    const { useNavReady } = await import("~/hooks/useNavReady");
    const { result } = renderHook(() => useNavReady());

    // Pre-timeout: still false. The mount effect just scheduled the timer.
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(result.current).toBe(true);
  });

  it("starts true on a second consumer after the timer has fired", async () => {
    const { useNavReady } = await import("~/hooks/useNavReady");
    // Drain the timer via a throwaway consumer
    const first = renderHook(() => useNavReady());
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(first.result.current).toBe(true);

    // Subsequent consumers should pick up the resolved singleton synchronously
    const second = renderHook(() => useNavReady());
    expect(second.result.current).toBe(true);
  });
});
