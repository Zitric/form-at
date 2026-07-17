import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushOptInCta } from "~/components/PushOptInCta";
import type { SaveGate } from "~/hooks/useSaveGate";
import { useStore } from "~/store";

// CTA gating for the two-variant soft prompt (feat/push-optin-modal,
// 2026-07-16). The gate is deliberately different per display mode:
// standalone offers the real subscribe (needs the Push API + an unspent
// ask), a browser tab offers the install nudge (shown even where the Push
// API is absent — that's the iOS-Safari-tab audience the nudge exists for).

const { gateRef } = vi.hoisted(() => ({
  gateRef: { current: { allow: true } as unknown },
}));

vi.mock("~/hooks/useSaveGate", () => ({
  useSaveGate: () => gateRef.current,
  useTriggerInstallPrompt: () => async () => "no-prompt" as const,
}));

function setGate(gate: SaveGate) {
  gateRef.current = gate;
}

function mockNotification(permission: NotificationPermission) {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission, requestPermission: vi.fn().mockResolvedValue(permission) },
  });
}

function mockPushSupport({ subscribed }: { subscribed: boolean }) {
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class PushManager {},
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(subscribed ? { endpoint: "x" } : null),
          subscribe: vi.fn().mockRejectedValue(new Error("not exercised here")),
        },
      }),
    },
  });
}

function clearPushGlobals() {
  Reflect.deleteProperty(window, "PushManager");
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(window, "Notification");
}

const tabGate: SaveGate = {
  allow: false,
  reason: "needs-install",
  platform: "chromium",
  canPrompt: false,
};

beforeEach(async () => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  }
  // The store is a module-level singleton and setState writes through to
  // localStorage — clear BOTH, then rehydrate, so no flag set by a previous
  // test (e.g. the suppression cases) leaks into the next one.
  localStorage.clear();
  useStore.setState({ pushOptInDismissed: false, pushOptInDeclinedSession: false });
  await useStore.persist.rehydrate();
  vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  clearPushGlobals();
});

const ctaButton = () => screen.queryByRole("button", { name: "[ notify_me ]" });

describe("PushOptInCta gating — standalone", () => {
  it("shows when the Push API is present and permission is still default", async () => {
    setGate({ allow: true });
    mockPushSupport({ subscribed: false });
    mockNotification("default");
    render(<PushOptInCta />);

    expect(await screen.findByRole("button", { name: "[ notify_me ]" })).toBeInTheDocument();
  });

  it("hides when permission is granted AND a live subscription exists", async () => {
    setGate({ allow: true });
    mockPushSupport({ subscribed: true });
    mockNotification("granted");
    render(<PushOptInCta />);

    await new Promise((r) => setTimeout(r, 10));
    expect(ctaButton()).not.toBeInTheDocument();
  });

  it("returns when permission is granted but no subscription survived (failed-subscribe recovery)", async () => {
    setGate({ allow: true });
    mockPushSupport({ subscribed: false });
    mockNotification("granted");
    render(<PushOptInCta />);

    expect(await screen.findByRole("button", { name: "[ notify_me ]" })).toBeInTheDocument();
  });

  it("hides when the Push API is absent in standalone (nothing to offer)", async () => {
    setGate({ allow: true });
    render(<PushOptInCta />);

    await new Promise((r) => setTimeout(r, 10));
    expect(ctaButton()).not.toBeInTheDocument();
  });
});

describe("PushOptInCta gating — browser tab", () => {
  it("shows even where the Push API is absent (iOS Safari tab — the install nudge audience)", async () => {
    setGate(tabGate);
    render(<PushOptInCta />);

    expect(await screen.findByRole("button", { name: "[ notify_me ]" })).toBeInTheDocument();
  });

  it("hides once permission is known-spent at this origin", async () => {
    setGate(tabGate);
    mockPushSupport({ subscribed: false });
    mockNotification("denied");
    render(<PushOptInCta />);

    await new Promise((r) => setTimeout(r, 10));
    expect(ctaButton()).not.toBeInTheDocument();
  });
});

describe("PushOptInCta gating — suppression flags", () => {
  it("hides on the persisted dismiss flag", async () => {
    setGate(tabGate);
    useStore.setState({ pushOptInDismissed: true });
    render(<PushOptInCta />);

    await new Promise((r) => setTimeout(r, 10));
    expect(ctaButton()).not.toBeInTheDocument();
  });

  it("hides on the session decline flag", async () => {
    setGate(tabGate);
    useStore.setState({ pushOptInDeclinedSession: true });
    render(<PushOptInCta />);

    await new Promise((r) => setTimeout(r, 10));
    expect(ctaButton()).not.toBeInTheDocument();
  });
});

describe("PushOptInCta → PushOptInModal wiring", () => {
  it("tapping the CTA opens the modal for the current variant", async () => {
    setGate(tabGate);
    render(<PushOptInCta />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "[ notify_me ]" }));

    expect(screen.getByText(/notifications live in the Form:at app/i)).toBeInTheDocument();
  });

  it("declining the modal suppresses the CTA for the session WITHOUT touching the persisted flag", async () => {
    setGate({ allow: true });
    mockPushSupport({ subscribed: false });
    mockNotification("default");
    render(<PushOptInCta />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "[ notify_me ]" }));
    await user.click(screen.getByRole("button", { name: /not now/i }));

    await waitFor(() => expect(ctaButton()).not.toBeInTheDocument());
    expect(useStore.getState().pushOptInDeclinedSession).toBe(true);
    // The persisted flag is reserved for a spent NATIVE ask — a soft-prompt
    // decline must stay recoverable on the next visit.
    expect(useStore.getState().pushOptInDismissed).toBe(false);
  });
});
