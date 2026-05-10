import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFirstLoad } from "~/hooks/useFirstLoad";

describe("useFirstLoad", () => {
  it("resolves to true after the mount effect (so animations play once)", () => {
    // Effects flush before renderHook returns under RTL, so the post-mount
    // value is observable immediately.
    const { result } = renderHook(() => useFirstLoad());
    expect(result.current).toBe(true);
  });

  it("returns true again on a sibling mount within the strict-mode window", () => {
    // Two mounts within ~500ms (test execution is sub-ms) both see true —
    // this is what lets the visible second mount animate after StrictMode replay.
    const a = renderHook(() => useFirstLoad());
    const b = renderHook(() => useFirstLoad());
    expect(a.result.current).toBe(true);
    expect(b.result.current).toBe(true);
  });
});
