import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLaunchTracker } from "~/components/AppLaunchTracker";

// app_launch (2026-07-08) must fire once per real mount when running
// standalone, and never in a browser tab. This component lives once in
// __root's <body> (same slot as HydrateStore / InstallEventsListener /
// OfflineReconciler) and mounts exactly once per document load — TanStack
// Router's Outlet-based route changes never remount it — so a mount-only
// effect correctly means "session start", not "every route change".

function setStandalone(value: boolean) {
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  setStandalone(false);
  vi.restoreAllMocks();
});

describe("AppLaunchTracker", () => {
  it("fires app_launch on mount when standalone", async () => {
    setStandalone(true);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    render(<AppLaunchTracker />);

    expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({
      event_type: "app_launch",
      is_standalone: true,
    });
  });

  it("does NOT fire in a browser tab", () => {
    setStandalone(false);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    render(<AppLaunchTracker />);

    expect(beaconSpy).not.toHaveBeenCalled();
  });

  it("fires only once even if the component re-renders", () => {
    setStandalone(true);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    const { rerender } = render(<AppLaunchTracker />);
    rerender(<AppLaunchTracker />);
    rerender(<AppLaunchTracker />);

    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });
});
