import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUpdateReady, useSwUpdate } from "~/hooks/useSwUpdate";

// H2 update-flow tests. jsdom has no navigator.serviceWorker, so the hook's
// integration is exercised against a spec-shaped mock; the real SW lifecycle
// (waiting → SKIP_WAITING → activate → controllerchange) can only be
// verified against a production build in a browser — see the manual script
// in PWA_PROGRESS.

describe("isUpdateReady (pure decision)", () => {
  it("true only for installed + existing controller (a real update)", () => {
    expect(isUpdateReady("installed", true)).toBe(true);
  });

  it("false for installed without controller — that's a FIRST install, not an update", () => {
    expect(isUpdateReady("installed", false)).toBe(false);
  });

  it("false for other lifecycle states regardless of controller", () => {
    for (const state of ["installing", "activating", "activated", "redundant"] as const) {
      expect(isUpdateReady(state, true)).toBe(false);
    }
  });
});

// --- hook integration against a mocked navigator.serviceWorker ---

class MockServiceWorker extends EventTarget {
  state: ServiceWorkerState = "installed";
  postMessage = vi.fn();
}

class MockRegistration extends EventTarget {
  waiting: MockServiceWorker | null = null;
  installing: MockServiceWorker | null = null;
}

class MockContainer extends EventTarget {
  controller: object | null = null;
  registration = new MockRegistration();
  ready: Promise<MockRegistration>;
  constructor() {
    super();
    this.ready = Promise.resolve(this.registration);
  }
}

let container: MockContainer;

beforeEach(() => {
  container = new MockContainer();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: container,
  });
});

afterEach(() => {
  // biome-ignore lint/performance/noDelete: restoring the absent jsdom default
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("useSwUpdate", () => {
  it("reports an update when registration.waiting exists at mount with a controller", async () => {
    container.registration.waiting = new MockServiceWorker();
    container.controller = {};

    const { result } = renderHook(() => useSwUpdate());
    await waitFor(() => expect(result.current.updateReady).toBe(true));
  });

  it("does NOT report an update on first install (waiting but no controller)", async () => {
    container.registration.waiting = new MockServiceWorker();
    container.controller = null;

    const { result } = renderHook(() => useSwUpdate());
    // Give the ready promise a tick to settle before asserting the negative.
    await act(async () => {});
    expect(result.current.updateReady).toBe(false);
  });

  it("reports an update when an installing worker reaches installed while the page is open", async () => {
    container.controller = {};
    const { result } = renderHook(() => useSwUpdate());
    await act(async () => {}); // let ready settle so updatefound is attached

    const installing = new MockServiceWorker();
    installing.state = "installing";
    container.registration.installing = installing;
    act(() => {
      container.registration.dispatchEvent(new Event("updatefound"));
    });
    expect(result.current.updateReady).toBe(false);

    installing.state = "installed";
    act(() => {
      installing.dispatchEvent(new Event("statechange"));
    });
    expect(result.current.updateReady).toBe(true);
  });

  it("applyUpdate posts SKIP_WAITING to the waiting worker", async () => {
    const waiting = new MockServiceWorker();
    container.registration.waiting = waiting;
    container.controller = {};

    const { result } = renderHook(() => useSwUpdate());
    await waitFor(() => expect(result.current.updateReady).toBe(true));

    act(() => result.current.applyUpdate());
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("controllerchange without a prior applyUpdate does not reload (first-install claim)", async () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    try {
      renderHook(() => useSwUpdate());
      await act(async () => {});
      act(() => {
        container.dispatchEvent(new Event("controllerchange"));
      });
      expect(reload).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    }
  });

  it("controllerchange AFTER applyUpdate reloads exactly the requesting tab", async () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    try {
      const waiting = new MockServiceWorker();
      container.registration.waiting = waiting;
      container.controller = {};

      const { result } = renderHook(() => useSwUpdate());
      await waitFor(() => expect(result.current.updateReady).toBe(true));

      act(() => result.current.applyUpdate());
      act(() => {
        container.dispatchEvent(new Event("controllerchange"));
      });
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    }
  });
});
