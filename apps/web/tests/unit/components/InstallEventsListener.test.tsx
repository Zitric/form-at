import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallEventsListener } from "~/components/InstallEventsListener";
import { useStore } from "~/store";
import type { BeforeInstallPromptEvent } from "~/store/uiSlice";

// Locks the pre-hydration capture invariant (2026-07-02 Android field
// testing): Chromium fires `beforeinstallprompt` once per page load, often
// before React hydrates. The inline head script in __root stashes it on
// `window.__deferredInstallPrompt`; this component MUST adopt that stash on
// mount, not only listen for future events.

function fakePrompt(): BeforeInstallPromptEvent {
  const e = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
  Object.assign(e, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  return e;
}

beforeEach(() => {
  window.__deferredInstallPrompt = null;
  useStore.setState({ deferredPrompt: null, pwaInstalled: false, pwaInstallDismissed: false });
});

describe("InstallEventsListener", () => {
  it("adopts a prompt stashed before mount (pre-hydration capture)", () => {
    const stashed = fakePrompt();
    window.__deferredInstallPrompt = stashed;

    render(<InstallEventsListener />);

    expect(useStore.getState().deferredPrompt).toBe(stashed);
  });

  it("captures a prompt fired after mount via the live listener", () => {
    render(<InstallEventsListener />);

    const live = fakePrompt();
    window.dispatchEvent(live);

    expect(useStore.getState().deferredPrompt).toBe(live);
  });

  it("clears both store and stash on appinstalled", () => {
    const stashed = fakePrompt();
    window.__deferredInstallPrompt = stashed;
    render(<InstallEventsListener />);
    expect(useStore.getState().deferredPrompt).toBe(stashed);

    window.dispatchEvent(new Event("appinstalled"));

    expect(useStore.getState().deferredPrompt).toBeNull();
    expect(window.__deferredInstallPrompt).toBeNull();
    expect(useStore.getState().pwaInstalled).toBe(true);
  });
});
