import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallCta } from "~/components/InstallCta";
import { useStore } from "~/store";

// install_prompt_shown must fire when the CTA actually becomes
// VISIBLE to the user — i.e. when InstallCtaButton mounts (all of
// useStoreHydrated + deferredPrompt + !pwaInstallDismissed hold) — not when
// Chromium's beforeinstallprompt event merely fires (those can differ by
// seconds on a slow first visit).

function fakeDeferredPrompt() {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  };
}

beforeEach(async () => {
  useStore.setState({ deferredPrompt: null, pwaInstallDismissed: false });
  await useStore.persist.rehydrate();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InstallCta", () => {
  it("fires install_prompt_shown once the button actually renders", async () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    render(<InstallCta />);
    // Gate depends on hydration + deferredPrompt, both applied after mount —
    // update after the initial render so the gated child actually mounts.
    useStore.setState({ deferredPrompt: fakeDeferredPrompt() as never });

    await waitFor(() => {
      expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    });
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({ event_type: "install_prompt_shown" });
  });

  it("does NOT fire when the gate never passes (no captured prompt)", async () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    render(<InstallCta />);
    await new Promise((r) => setTimeout(r, 10));

    expect(beaconSpy).not.toHaveBeenCalled();
  });
});
