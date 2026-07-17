import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPushSupported, useSubscribeToPush } from "~/hooks/usePushSubscription";
import { useStore } from "~/store";

// jsdom has none of Notification / PushManager / navigator.serviceWorker —
// same gap useSwUpdate.test.tsx documents for serviceWorker alone. Mocked
// here, spec-shaped, per-test rather than in tests/setup.ts since only this
// suite touches the Push API. Covers the pure opt-in/dismissal-tracking
// decision logic (Phase 2, 2026-07-15); the real subscribe() call and its
// browser-native crypto can only be verified on-device — see
// PWA_PROGRESS.md's checklist.

function mockPushSupport(subscribeImpl: () => Promise<unknown>) {
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class PushManager {},
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager: { subscribe: vi.fn(subscribeImpl) } }),
    },
  });
}

function mockNotificationPermission(outcome: NotificationPermission) {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { requestPermission: vi.fn().mockResolvedValue(outcome) },
  });
}

// `Reflect.deleteProperty` (not `value: undefined`) because `"x" in obj` is
// true as soon as the key exists, regardless of value — a `defineProperty`
// with `value: undefined` would leave `isPushSupported()` reading `true`.
// Clears BOTH mocked globals: leaving `navigator.serviceWorker` set from a
// prior test's `mockPushSupport()` call was the actual bug here (state
// leaking across tests made a "PushManager absent" test still read as
// supported via the leftover serviceWorker mock).
function clearPushSupport() {
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(navigator, "serviceWorker");
}

beforeEach(() => {
  useStore.setState({ pushOptInDismissed: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  clearPushSupport();
});

describe("isPushSupported", () => {
  it("false when PushManager is absent (e.g. iOS Safari in a browser tab)", () => {
    clearPushSupport();
    expect(isPushSupported()).toBe(false);
  });

  it("true when both serviceWorker and PushManager are present", () => {
    mockPushSupport(() => Promise.resolve({ toJSON: () => ({ endpoint: "x", keys: {} }) }));
    expect(isPushSupported()).toBe(true);
  });
});

describe("useSubscribeToPush", () => {
  it("returns 'unsupported' and never touches Notification when the Push API is absent", async () => {
    clearPushSupport();
    const requestPermission = vi.fn();
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { requestPermission },
    });

    const { result } = renderHook(() => useSubscribeToPush());
    const outcome = await result.current();

    expect(outcome).toBe("unsupported");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("sets pushOptInDismissed and returns 'denied' when permission isn't granted", async () => {
    mockPushSupport(() => Promise.reject(new Error("subscribe should not be called")));
    mockNotificationPermission("denied");

    const { result } = renderHook(() => useSubscribeToPush());
    const outcome = await result.current();

    expect(outcome).toBe("denied");
    expect(useStore.getState().pushOptInDismissed).toBe(true);
  });

  // Locks the resume-path guarantee (granted-but-unsubscribed recovery,
  // 2026-07-17): when the grant already exists, the hook must not call
  // requestPermission at all — the "native dialog only ever fires from a
  // modal accept" contract stays literal instead of relying on the browser
  // treating a granted-state prompt call as a no-op.
  it("skips requestPermission entirely when permission is already granted", async () => {
    mockPushSupport(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) }),
    );
    const requestPermission = vi.fn().mockResolvedValue("granted");
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "granted", requestPermission },
    });
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    const { result } = renderHook(() => useSubscribeToPush());
    const outcome = await result.current();

    expect(outcome).toBe("subscribed");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("subscribes and posts the subscription when permission is granted", async () => {
    const fakeSubscription = {
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        keys: { p256dh: "p256dh-value", auth: "auth-value" },
      }),
    };
    mockPushSupport(() => Promise.resolve(fakeSubscription));
    mockNotificationPermission("granted");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    const { result } = renderHook(() => useSubscribeToPush());
    const outcome = await result.current();

    expect(outcome).toBe("subscribed");
    expect(useStore.getState().pushOptInDismissed).toBe(false);
    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const [url, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(url).toBe("/api/push-subscribe");
    expect(JSON.parse(await blob.text())).toMatchObject({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    });
  });
});
