import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveForOfflineButton } from "~/components/SaveForOfflineButton";

// Mock the capability hook to drive each branch. The InstallPromptModal it
// renders internally is exercised via "modal opened" assertions only — its
// platform-specific content has its own coverage if we add it later.
vi.mock("~/hooks/useInstallCapability", () => ({
  useInstallCapability: vi.fn(() => "native"),
  useTriggerInstallPrompt: vi.fn(() => async () => "no-prompt" as const),
}));

// Stub Modal's polyfilled dialog API so jsdom doesn't throw on showModal().
// Mirrors the pattern in tests/setup.ts used by ShareModal tests.
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

async function withCapability(cap: "native" | "ios-safari" | "installed" | "unsupported") {
  const mod = await import("~/hooks/useInstallCapability");
  vi.mocked(mod.useInstallCapability).mockReturnValue(cap);
}

describe("SaveForOfflineButton", () => {
  it("renders the button on Chromium with native install available", async () => {
    await withCapability("native");
    render(<SaveForOfflineButton />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button on iOS Safari (manual install path)", async () => {
    await withCapability("ios-safari");
    render(<SaveForOfflineButton />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button on Chromium without a captured prompt (engagement heuristic not met yet)", async () => {
    await withCapability("chromium-manual");
    render(<SaveForOfflineButton />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button when already installed (modal shows the 'coming soon' message)", async () => {
    await withCapability("installed");
    render(<SaveForOfflineButton />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("hides itself entirely when capability is 'unsupported'", async () => {
    await withCapability("unsupported");
    const { container } = render(<SaveForOfflineButton />);
    // Component returns null — nothing renders.
    expect(container.firstChild).toBeNull();
  });

  it("opens the install modal on click — proves tap is never a no-op (Phase 3 soft-dismiss semantic)", async () => {
    await withCapability("native");
    render(<SaveForOfflineButton />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save_for_offline/ }));
    // Modal renders its `install_for_offline` title once open.
    expect(await screen.findByText(/install_for_offline/)).toBeInTheDocument();
  });
});
