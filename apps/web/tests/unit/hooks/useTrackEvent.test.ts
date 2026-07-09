import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackEvent } from "~/hooks/useTrackEvent";

// Locks the beacon-firing convention (Step 3, 2026-07-08): must use
// navigator.sendBeacon (fire-and-forget, survives page unload — same
// contract as useAudioPlayer's sendPlay), posting to /api/event with the
// snake_case payload shape Step 2 specifies.

function setStandalone(value: boolean) {
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  setStandalone(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTrackEvent", () => {
  it("fires navigator.sendBeacon to /api/event with the event_type and is_standalone", () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => useTrackEvent());

    result.current("app_launch");

    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const [url, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(url).toBe("/api/event");
    expect(blob.type).toBe("application/json");
  });

  it("includes set_id when provided, null when omitted", async () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => useTrackEvent());

    result.current("save_click", "set-002-til");
    result.current("app_launch");

    const [, blobWithSet] = beaconSpy.mock.calls[0] as [string, Blob];
    const [, blobNoSet] = beaconSpy.mock.calls[1] as [string, Blob];
    expect(JSON.parse(await blobWithSet.text())).toMatchObject({ set_id: "set-002-til" });
    expect(JSON.parse(await blobNoSet.text())).toMatchObject({ set_id: null });
  });

  it("reads is_standalone fresh at call time (not cached across calls)", async () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => useTrackEvent());

    setStandalone(false);
    result.current("app_launch");
    setStandalone(true);
    result.current("app_launch");

    const [, firstBlob] = beaconSpy.mock.calls[0] as [string, Blob];
    const [, secondBlob] = beaconSpy.mock.calls[1] as [string, Blob];
    expect(JSON.parse(await firstBlob.text())).toMatchObject({ is_standalone: false });
    expect(JSON.parse(await secondBlob.text())).toMatchObject({ is_standalone: true });
  });
});
