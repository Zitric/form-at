import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushOptInModal } from "~/components/PushOptInModal";
import type { SaveGate } from "~/hooks/useSaveGate";
import { useStore } from "~/store";

// Locks the soft-prompt contract (feat/push-optin-modal, 2026-07-16): the
// NATIVE permission dialog must never fire except from the standalone
// variant's explicit accept. A native "Block" is nearly unrecoverable, so
// every other path — declining, closing, and the entire browser-tab install
// nudge — must leave `Notification.requestPermission` untouched.

const { triggerInstallMock } = vi.hoisted(() => ({
  triggerInstallMock: vi.fn(async () => "accepted" as const),
}));

vi.mock("~/hooks/useSaveGate", () => ({
  useTriggerInstallPrompt: () => triggerInstallMock,
}));

// Same spec-shaped per-test mocks as usePushSubscription.test.tsx — jsdom
// has none of Notification / PushManager / navigator.serviceWorker.
function mockNotification(
  outcome: NotificationPermission,
  current: NotificationPermission = "default",
) {
  const requestPermission = vi.fn().mockResolvedValue(outcome);
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission: current, requestPermission },
  });
  return requestPermission;
}

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

// Reflect.deleteProperty, not `value: undefined` — the `in` checks in
// isPushSupported() are satisfied by the key existing at all (see the
// identical helper's comment in usePushSubscription.test.tsx).
function clearPushGlobals() {
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(window, "Notification");
}

// Lets a test hold `subscribe()` open mid-flight to inspect the in-flight
// UI, then resolve it on demand — a fixed-resolution mock can't distinguish
// "never showed busy copy" from "resolved too fast to see it".
function deferredSubscription() {
  let resolve!: (v: { toJSON: () => { endpoint: string; keys: Record<string, string> } }) => void;
  const promise = new Promise<{ toJSON: () => { endpoint: string; keys: Record<string, string> } }>(
    (res) => {
      resolve = res;
    },
  );
  return { promise, resolve };
}

async function beaconedEventTypes(spy: ReturnType<typeof vi.spyOn>): Promise<string[]> {
  const types: string[] = [];
  for (const call of spy.mock.calls) {
    const [url, blob] = call as unknown as [string, Blob];
    if (url === "/api/event") types.push(JSON.parse(await blob.text()).event_type);
  }
  return types;
}

const standaloneGate: SaveGate = { allow: true };
const needsInstallGate: SaveGate = {
  allow: false,
  reason: "needs-install",
  platform: "chromium",
  canPrompt: true,
};
const openAppGate: SaveGate = { allow: false, reason: "open-app" };
const cannotInstallGate: SaveGate = { allow: false, reason: "cannot-install" };

function renderModal(gate: SaveGate) {
  const onClose = vi.fn();
  const onDeclined = vi.fn();
  const onOutcome = vi.fn();
  render(
    <PushOptInModal
      open
      onClose={onClose}
      onDeclined={onDeclined}
      onOutcome={onOutcome}
      gate={gate}
    />,
  );
  return { onClose, onDeclined, onOutcome };
}

beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  }
  useStore.setState({ pushOptInDismissed: false, pushOptInDeclinedSession: false });
  triggerInstallMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearPushGlobals();
});

describe("PushOptInModal — variant branching", () => {
  it("standalone gate renders the subscribe ask, not the install nudge", () => {
    mockPushSupport(() => Promise.reject(new Error("not tapped")));
    mockNotification("granted");
    renderModal(standaloneGate);

    expect(screen.getByRole("button", { name: /enable_notifications/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "[ install ]" })).not.toBeInTheDocument();
  });

  it("browser-tab needs-install gate renders the install nudge, no subscribe ask", () => {
    renderModal(needsInstallGate);

    expect(screen.getByText(/notifications live in the Form:at app/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "[ install ]" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable_notifications/ })).not.toBeInTheDocument();
  });

  it("open-app gate points at the installed app", () => {
    renderModal(openAppGate);
    expect(screen.getByText(/already on your device/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /not installed\? install the app/i }),
    ).toBeInTheDocument();
  });

  it("cannot-install gate is honest about the missing install path", () => {
    renderModal(cannotInstallGate);
    expect(screen.getByText(/this browser can't install it/i)).toBeInTheDocument();
  });
});

describe("PushOptInModal — native permission guarantee", () => {
  it("standalone: requestPermission is NOT called on open or decline, only after accept", async () => {
    mockPushSupport(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) }),
    );
    const requestPermission = mockNotification("granted");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { onDeclined } = renderModal(standaloneGate);

    expect(requestPermission).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /not now/i }));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(onDeclined).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /enable_notifications/ }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("browser-tab variant NEVER calls requestPermission — not even via its primary action", async () => {
    mockPushSupport(() => Promise.reject(new Error("subscribe must not run in a tab")));
    const requestPermission = mockNotification("granted");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    renderModal(needsInstallGate);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "[ install ]" }));

    expect(triggerInstallMock).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe("PushOptInModal — subscribe outcomes through the modal", () => {
  it("accept → subscribed: success copy, onOutcome('subscribed'), no decline", async () => {
    mockPushSupport(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) }),
    );
    mockNotification("granted");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { onDeclined, onOutcome, onClose } = renderModal(standaloneGate);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /enable_notifications/ }));

    expect(await screen.findByText(/notifications on/i)).toBeInTheDocument();
    expect(onOutcome).toHaveBeenCalledWith("subscribed");

    // Closing after an accept is not a decline — even a successful one.
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onDeclined).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("accept transitions phases inside ONE dialog — success carries both messages and [ done ] closes without a decline", async () => {
    mockPushSupport(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) }),
    );
    mockNotification("granted");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { onDeclined, onClose } = renderModal(standaloneGate);

    expect(document.querySelectorAll("dialog")).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /enable_notifications/ }));

    // Both messages in ONE surface: the confirmation and the reassurance.
    expect(await screen.findByText(/notifications on/i)).toBeInTheDocument();
    expect(screen.getByText(/no spam, just the signal/i)).toBeInTheDocument();
    // Still the same single dialog — phases swap in place, no second mount.
    expect(document.querySelectorAll("dialog")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "[ done ]" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeclined).not.toHaveBeenCalled();
  });

  it("accept → native denied: blocked-at-browser-level copy, no retry button", async () => {
    mockPushSupport(() => Promise.reject(new Error("subscribe should not be called")));
    mockNotification("denied");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { onOutcome } = renderModal(standaloneGate);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /enable_notifications/ }));

    expect(await screen.findByText(/blocked for Form:at/i)).toBeInTheDocument();
    expect(onOutcome).toHaveBeenCalledWith("denied");
    expect(screen.queryByRole("button", { name: /try_again/ })).not.toBeInTheDocument();
  });

  it("accept → subscribe failure: retryable, and closing afterwards is NOT a decline", async () => {
    mockPushSupport(() => Promise.reject(new Error("push service unreachable")));
    mockNotification("granted");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { onDeclined, onOutcome } = renderModal(standaloneGate);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /enable_notifications/ }));

    expect(await screen.findByRole("button", { name: /try_again/ })).toBeInTheDocument();
    expect(onOutcome).toHaveBeenCalledWith("failed");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onDeclined).not.toHaveBeenCalled();
  });
});

// The resume path (granted-but-unsubscribed): permission was granted in an
// earlier session but the subscribe after it never completed. There is no
// ask left to make, so the modal must skip the soft prompt, subscribe
// directly, and stay outside the notify_* funnel entirely.
describe("PushOptInModal — granted-but-unsubscribed resume", () => {
  it("skips the soft prompt and subscribes on open — requestPermission never called", async () => {
    mockPushSupport(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) }),
    );
    const requestPermission = mockNotification("granted", "granted");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { onOutcome } = renderModal(standaloneGate);

    expect(await screen.findByText(/notifications on/i)).toBeInTheDocument();
    expect(onOutcome).toHaveBeenCalledWith("subscribed");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByText(/hear about new sets/i)).not.toBeInTheDocument();

    const types = await beaconedEventTypes(beaconSpy);
    expect(types).not.toContain("notify_prompt_shown");
    expect(types).not.toContain("notify_accepted");
  });

  it("failed resume is retryable, and closing it is NOT a decline", async () => {
    mockPushSupport(() => Promise.reject(new Error("push service unreachable")));
    mockNotification("granted", "granted");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { onDeclined } = renderModal(standaloneGate);

    expect(await screen.findByRole("button", { name: /try_again/ })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onDeclined).not.toHaveBeenCalled();
    expect(await beaconedEventTypes(beaconSpy)).not.toContain("notify_declined");
  });
});

// Field bug 2026-07-20: the visible "setting up notifications…" busy page
// made the modal look like it was "turning pages by itself" for the few
// hundred ms subscribe() takes. Fixed by making the in-flight window either
// blank (direct/resume path — nothing honest to say yet) or a dimmed
// continuation of the ask (native-dialog path) — never its own page.
describe("PushOptInModal — busy phase visibility (2026-07-20 simplification)", () => {
  it("direct/resume path: no busy copy, no ask copy, ONE dialog throughout — blank until it resolves", async () => {
    const { promise, resolve } = deferredSubscription();
    mockPushSupport(() => promise);
    mockNotification("granted", "granted");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    renderModal(standaloneGate);

    expect(screen.queryByText(/setting up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hear about new sets/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll("dialog")).toHaveLength(1);

    resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) });
    expect(await screen.findByText(/notifications on/i)).toBeInTheDocument();
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
  });

  it("native-dialog path: the ask content stays visible and disabled during flight, never swapped for busy copy", async () => {
    const { promise, resolve } = deferredSubscription();
    mockPushSupport(() => promise);
    mockNotification("granted");
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    renderModal(standaloneGate);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /enable_notifications/ }));

    // Same ask copy, still on screen — not swapped, just disabled.
    expect(screen.getByText(/hear about new sets/i)).toBeInTheDocument();
    expect(screen.queryByText(/setting up/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enable_notifications/ })).toBeDisabled();
    expect(document.querySelectorAll("dialog")).toHaveLength(1);

    resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) });
    expect(await screen.findByText(/notifications on/i)).toBeInTheDocument();
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
  });
});

describe("PushOptInModal — analytics", () => {
  it("fires notify_prompt_shown when the standalone variant opens", async () => {
    mockPushSupport(() => Promise.reject(new Error("not tapped")));
    mockNotification("granted");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    renderModal(standaloneGate);

    expect(await beaconedEventTypes(beaconSpy)).toContain("notify_prompt_shown");
  });

  it("fires notify_install_nudge_shown when the tab variant opens, and notify_declined on close", async () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    renderModal(needsInstallGate);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Close" }));

    const types = await beaconedEventTypes(beaconSpy);
    expect(types).toContain("notify_install_nudge_shown");
    expect(types).toContain("notify_declined");
    expect(types).not.toContain("notify_prompt_shown");
  });

  it("fires notify_accepted on accept and does NOT fire notify_declined afterwards", async () => {
    mockPushSupport(() =>
      Promise.resolve({ toJSON: () => ({ endpoint: "https://push.example/x", keys: {} }) }),
    );
    mockNotification("granted");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    renderModal(standaloneGate);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /enable_notifications/ }));
    await screen.findByText(/notifications on/i);
    await user.click(screen.getByRole("button", { name: "Close" }));

    const types = await beaconedEventTypes(beaconSpy);
    expect(types).toContain("notify_accepted");
    expect(types).not.toContain("notify_declined");
  });
});
