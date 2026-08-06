import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveGateModal } from "~/components/SaveGateModal";
import type { SaveGate } from "~/hooks/useSaveGate";

// The escape-hatch handlers flip `pwaInstalled` in the store. We stub the
// store hook to a noop setter so the test focuses on the invariant: the
// handler MUST NOT call `onClose`. The gate-reason flip that re-renders
// this modal with the OTHER case's copy is exercised elsewhere via the
// useSaveGate → useStore integration; here we lock the local invariant.
vi.mock("~/store", () => ({
  useStore: (
    selector: (s: {
      setPwaInstalled: (v: boolean) => void;
      setPwaInstallDismissed: (v: boolean) => void;
    }) => unknown,
  ) => selector({ setPwaInstalled: vi.fn(), setPwaInstallDismissed: vi.fn() }),
}));

vi.mock("~/hooks/useSaveGate", () => ({
  useTriggerInstallPrompt: () => async () => "no-prompt" as const,
}));

beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

const needsInstallGate: SaveGate = {
  allow: false,
  reason: "needs-install",
  platform: "chromium",
  canPrompt: true,
};

const openAppGate: SaveGate = { allow: false, reason: "open-app" };

const manualChromiumGate: SaveGate = {
  allow: false,
  reason: "needs-install",
  platform: "chromium",
  canPrompt: false,
};

describe("SaveGateModal manual-install copy (no captured prompt)", () => {
  // Opera Android field finding: it UA-matches "chromium" but
  // never fired beforeinstallprompt and its menu had no install entry — the
  // old copy promised "tap install app" in a menu where it didn't exist.
  // The manual branch must hedge, never promise a specific menu item.
  it("hedges instead of promising a specific menu item", () => {
    const { container } = render(
      <SaveGateModal open={true} onClose={vi.fn()} gate={manualChromiumGate} />,
    );

    expect(container.textContent).toMatch(/may not support installing/i);
    expect(container.textContent).toMatch(/Chrome/);
    expect(container.textContent).not.toMatch(/(?:and|then) tap install app/i);
  });
});

describe("SaveGateModal escape-hatch handlers", () => {
  it('does NOT close the modal when "already installed? open it" is tapped (case a → b)', async () => {
    const onClose = vi.fn();
    render(<SaveGateModal open={true} onClose={onClose} gate={needsInstallGate} />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /already installed\? open it from your home screen/i }),
    );

    // The store's pwaInstalled flip is what switches the visible copy on the
    // next render via useSaveGate. The MODAL must stay open so the user sees
    // that switched copy in place — closing here would flash the new copy
    // for one exit-animation frame before hiding it.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT close the modal when "not installed? install the app" is tapped (case b → a)', async () => {
    const onClose = vi.fn();
    render(<SaveGateModal open={true} onClose={onClose} gate={openAppGate} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /not installed\? install the app/i }));

    expect(onClose).not.toHaveBeenCalled();
  });
});

// install_dismissed: fires on passive close (the modal's own
// [ x ]) ONLY for the needs-install branch — that's the only branch
// actually offering to install something. open-app / cannot-install have
// no install action to dismiss.
describe("SaveGateModal install_dismissed tracking", () => {
  it("fires install_dismissed when the needs-install branch is closed", async () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    render(<SaveGateModal open={true} onClose={vi.fn()} gate={needsInstallGate} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({ event_type: "install_dismissed" });
  });

  it("does NOT fire install_dismissed when the open-app branch is closed", async () => {
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    render(<SaveGateModal open={true} onClose={vi.fn()} gate={openAppGate} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(beaconSpy).not.toHaveBeenCalled();
  });
});
