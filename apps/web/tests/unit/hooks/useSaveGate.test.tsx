import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTriggerInstallPrompt } from "~/hooks/useSaveGate";
import { useStore } from "~/store";
import type { BeforeInstallPromptEvent } from "~/store/uiSlice";

// install_dismissed (2026-07-08), native-dialog path: shared by InstallCta's
// tap-to-install AND SaveGateModal's "install" button, since both call this
// same hook. The OTHER install_dismissed path (SaveGateModal's own passive
// modal close) is covered in SaveGateModal.test.tsx.

function fakePrompt(outcome: "accepted" | "dismissed"): BeforeInstallPromptEvent {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as BeforeInstallPromptEvent;
}

beforeEach(() => {
  useStore.setState({ deferredPrompt: null, pwaInstallDismissed: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTriggerInstallPrompt", () => {
  it("fires install_dismissed when the native dialog outcome is dismissed", async () => {
    useStore.setState({ deferredPrompt: fakePrompt("dismissed") });
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    const { result } = renderHook(() => useTriggerInstallPrompt());
    await result.current();

    expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({ event_type: "install_dismissed" });
  });

  it("does NOT fire install_dismissed when the outcome is accepted", async () => {
    useStore.setState({ deferredPrompt: fakePrompt("accepted") });
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    const { result } = renderHook(() => useTriggerInstallPrompt());
    await result.current();

    expect(beaconSpy).not.toHaveBeenCalled();
  });
});
