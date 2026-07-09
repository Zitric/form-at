import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTriggerDownload } from "~/hooks/useOfflineDownload";

// Belt-and-braces coverage for the shared hook now that it feeds TWO
// components (SaveForOfflineButton on the detail page, SaveForOfflineIconButton
// on the set-list cards). A bug here hits both surfaces at once, so the
// sentinel-error translations get their own focused test.
//
// We mock `~/store` to a tiny fake `useStore` instead of mutating the real
// Zustand store at runtime — the real store has `persist` middleware that
// hits jsdom's localStorage on every setState, which conflicts with the
// per-test reset in `tests/setup.ts`. Mocking the module is faster, more
// isolated, and tests only what the hook actually consumes from the store.

const startDownloadSpy = vi.fn<(setId: string) => Promise<void>>();
const setToastSpy = vi.fn<(msg: string) => void>();

vi.mock("~/store", () => {
  const state = {
    startDownload: (id: string) => startDownloadSpy(id),
    setToast: (msg: string) => setToastSpy(msg),
  };
  return {
    useStore: <T,>(selector: (s: typeof state) => T): T => selector(state),
  };
});

beforeEach(() => {
  startDownloadSpy.mockReset();
  setToastSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("useTriggerDownload", () => {
  it("calls startDownload with the setId", async () => {
    startDownloadSpy.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTriggerDownload("set-x"));
    result.current();
    expect(startDownloadSpy).toHaveBeenCalledWith("set-x");
    // Let the resolved promise settle so the .catch chain runs.
    await Promise.resolve();
    expect(setToastSpy).not.toHaveBeenCalled();
  });

  // save_click (2026-07-08): this hook is THE single shared source for
  // "start a save-for-offline attempt" — both SaveForOfflineButton (detail
  // page) and SaveForOfflineIconButton (list card) call it, so tracking
  // here covers chunk 4's two component paths with one assertion.
  it("fires save_click before calling startDownload", async () => {
    startDownloadSpy.mockResolvedValue(undefined);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    const { result } = renderHook(() => useTriggerDownload("set-x"));
    result.current();

    expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({
      event_type: "save_click",
      set_id: "set-x",
    });
  });

  it("translates ONE_DOWNLOAD_AT_A_TIME into the concurrency toast", async () => {
    startDownloadSpy.mockRejectedValue(new Error("ONE_DOWNLOAD_AT_A_TIME"));
    const { result } = renderHook(() => useTriggerDownload("set-x"));
    result.current();
    await Promise.resolve();
    await Promise.resolve();
    expect(setToastSpy).toHaveBeenCalledWith("one download at a time — finish current first");
  });

  it("translates SIZE_NOT_CONFIGURED into the data-error toast", async () => {
    startDownloadSpy.mockRejectedValue(new Error("SIZE_NOT_CONFIGURED: set-x"));
    const { result } = renderHook(() => useTriggerDownload("set-x"));
    result.current();
    await Promise.resolve();
    await Promise.resolve();
    expect(setToastSpy).toHaveBeenCalledWith(
      "size not configured for this set — flag it to the team",
    );
  });

  it("swallows unexpected throws silently — no toast", async () => {
    startDownloadSpy.mockRejectedValue(new Error("UNKNOWN_SET: set-x"));
    const { result } = renderHook(() => useTriggerDownload("set-x"));
    result.current();
    await Promise.resolve();
    await Promise.resolve();
    expect(setToastSpy).not.toHaveBeenCalled();
  });
});
